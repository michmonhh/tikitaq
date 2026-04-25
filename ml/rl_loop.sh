#!/bin/bash
#
# TIKITAQ RL — Self-Play-Loop
# ===========================
#
# Iterativer RL-Trainings-Workflow:
#   1. Aktuelles ONNX-Modell lädt sich als KI für beide Teams in der Arena
#   2. Arena spielt N Round-Robins mit Sampling (Exploration), trajectories
#      mit reward + log_prob werden in JSONL.gz exportiert
#   3. Python liest die Trajectories, macht PPO-Update auf das Netz
#   4. Neuer ONNX-Export, Loop von vorn
#
# Nutzung:
#   ./rl_loop.sh [num_iterations] [round_robins_per_iter]
#
# Beispiel:
#   ./rl_loop.sh 10 1    # 10 RL-Iterationen, je 1 Round Robin (= 306 Matches)
#   ./rl_loop.sh 20 2    # 20 Iterationen, je 2 RR
#

set -e
shopt -s nullglob

NUM_ITER="${1:-30}"
RR_PER_ITER="${2:-3}"           # 3 RR/Iter = 3× mehr Trajectories für stabilere PPO-Updates
LR="${3:-1e-4}"                 # niedrigere LR ggü. Default 3e-4
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RL_DATA_DIR="$SCRIPT_DIR/rl_data"
CKPT_DIR="$SCRIPT_DIR/checkpoints"
OUTCOMES_CSV="$SCRIPT_DIR/rl_outcomes.csv"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

mkdir -p "$RL_DATA_DIR"

# Initial-Modell muss existieren
if [ ! -f "$CKPT_DIR/bc_latest.pt" ]; then
  log "❌ checkpoints/bc_latest.pt fehlt — bitte zuerst BC-Training laufen lassen"
  exit 1
fi

# Erstes ONNX-Modell exportieren (falls nicht vorhanden)
cd "$SCRIPT_DIR"
source .venv/bin/activate

if [ ! -f "$CKPT_DIR/rl_policy.onnx" ]; then
  log "Initiales ONNX aus BC-Checkpoint..."
  python export_onnx.py --checkpoint "$CKPT_DIR/bc_latest.pt" \
    --out "$CKPT_DIR/rl_policy.onnx"
  cp "$CKPT_DIR/bc_latest.pt" "$CKPT_DIR/rl_latest.pt"
fi

log "════════════════════════════════════════════════════════"
log "TIKITAQ RL Self-Play Loop"
log "  Iterationen: $NUM_ITER"
log "  Round Robins pro Iteration: $RR_PER_ITER"
log "  Lernrate: $LR"
log "════════════════════════════════════════════════════════"

# Outcome-CSV initialisieren falls nicht vorhanden
# v3 (2026-04-25): + vf_loss, explained_var (Actor-Critic-Diagnostik)
if [ ! -f "$OUTCOMES_CSV" ]; then
  echo "iter,goals_per_match,xg_per_team,shots_per_team,box_presence_pct,corners_per_team,home_win_pct,reward_mean,pg_loss_final,vf_loss_final,explained_var_final" > "$OUTCOMES_CSV"
fi

# Helper: extrahiert eine Zahl nach einem Label aus aiArena-Output
parse_metric() {
  local label="$1"
  local file="$2"
  grep -E "$label" "$file" | head -1 | grep -oE '[0-9]+\.[0-9]+|[0-9]+' | head -1
}

for i in $(seq 1 "$NUM_ITER"); do
  log ""
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "RL-Iteration $i / $NUM_ITER"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # ── Phase A: Trajectory-Sammlung ─────────────────────────
  log "Phase A: $RR_PER_ITER × Round-Robin mit Sampling..."

  ITER_STATS_FILE="$RL_DATA_DIR/iter${i}_stats.txt"
  : > "$ITER_STATS_FILE"

  for j in $(seq 1 "$RR_PER_ITER"); do
    SUB_TRAJ="$RL_DATA_DIR/iter${i}_part${j}.jsonl.gz"
    log "  Round-Robin $j/$RR_PER_ITER → $(basename "$SUB_TRAJ")"
    # Letzten Run mit Stats-Capture (für Outcome-Logging) — vorherige
    # Runs ohne, weil deren Stats identisch wären (selbe Policy)
    if [ "$j" -eq "$RR_PER_ITER" ]; then
      (cd "$PROJECT_ROOT" && \
        npx tsx scripts/aiArena.ts \
          --roundrobin \
          --bc-policy "$CKPT_DIR/rl_policy.onnx" \
          --sample \
          --export-training "$SUB_TRAJ" \
        > "$ITER_STATS_FILE" 2>&1) || log "  ⚠ Run $j fehlgeschlagen"
    else
      (cd "$PROJECT_ROOT" && \
        npx tsx scripts/aiArena.ts \
          --roundrobin \
          --bc-policy "$CKPT_DIR/rl_policy.onnx" \
          --sample \
          --export-training "$SUB_TRAJ" \
        > /dev/null 2>&1) || log "  ⚠ Run $j fehlgeschlagen"
    fi
  done

  # Outcome-Stats aus dem letzten Run extrahieren
  GPM=$(parse_metric "Tore pro Match" "$ITER_STATS_FILE")
  XG=$(parse_metric "xG / Team" "$ITER_STATS_FILE")
  SHOTS=$(parse_metric "Schüsse / Team" "$ITER_STATS_FILE")
  BOX=$(parse_metric "Box-Präsenz / Team" "$ITER_STATS_FILE")
  CORNERS=$(parse_metric "Eckbälle / Team" "$ITER_STATS_FILE")
  HOMEWIN=$(parse_metric "Heimsieg" "$ITER_STATS_FILE")
  log "  Outcomes: Tore/Match=$GPM  xG=$XG  Schüsse=$SHOTS  Box=${BOX}%  Ecken=$CORNERS  Heimsieg=${HOMEWIN}%"

  # ── Phase B: Trajectories validieren ─────────────────────
  TRAJ_FILES=("$RL_DATA_DIR"/iter${i}_part*.jsonl.gz)
  if [ ${#TRAJ_FILES[@]} -eq 0 ]; then
    log "❌ Keine Trajectory-Dateien — Iteration übersprungen"
    continue
  fi
  TOTAL_SIZE=$(du -sh "$RL_DATA_DIR" | cut -f1)
  log "  Sammelung: ${#TRAJ_FILES[@]} Dateien, gesamt $TOTAL_SIZE"

  # ── Phase C: PPO-Update ──────────────────────────────────
  log "Phase B: PPO-Update auf rl_latest.pt..."
  PPO_OUT_FILE="$RL_DATA_DIR/iter${i}_ppo.txt"
  python train_rl.py \
    --bc-checkpoint "$CKPT_DIR/rl_latest.pt" \
    --data "${TRAJ_FILES[@]}" \
    --output "$CKPT_DIR/rl_iter${i}.pt" \
    --epochs 4 \
    --lr "$LR" \
    --clip-eps 0.2 \
    --entropy-beta 0.01 \
    2>&1 | tee "$PPO_OUT_FILE" | tee -a "$SCRIPT_DIR/rl_loop.log"

  # Reward-mean + final pg/vf_loss + explained_var aus dem PPO-Output extrahieren
  REWARD_MEAN=$(grep "Reward stats" "$PPO_OUT_FILE" | grep -oE 'mean=[-0-9.]+' | head -1 | sed 's/mean=//')
  FINAL_PG_LOSS=$(grep "pg_loss=" "$PPO_OUT_FILE" | tail -1 | grep -oE 'pg_loss=[-0-9.]+' | sed 's/pg_loss=//')
  FINAL_VF_LOSS=$(grep "vf_loss=" "$PPO_OUT_FILE" | tail -1 | grep -oE 'vf_loss=[-0-9.]+' | sed 's/vf_loss=//')
  FINAL_EV=$(grep "explained_var=" "$PPO_OUT_FILE" | tail -1 | grep -oE 'explained_var=[-0-9.]+' | sed 's/explained_var=//')

  # Outcome-CSV-Zeile schreiben (v3: + vf_loss, explained_var)
  echo "$i,$GPM,$XG,$SHOTS,$BOX,$CORNERS,$HOMEWIN,$REWARD_MEAN,$FINAL_PG_LOSS,$FINAL_VF_LOSS,$FINAL_EV" >> "$OUTCOMES_CSV"

  # ── Phase D: Neuer rl_latest + ONNX ──────────────────────
  cp "$CKPT_DIR/rl_iter${i}.pt" "$CKPT_DIR/rl_latest.pt"
  python export_onnx.py \
    --checkpoint "$CKPT_DIR/rl_latest.pt" \
    --out "$CKPT_DIR/rl_policy.onnx"

  # Alte Iter-Trajectories aufräumen (nur die letzten 3 Iter behalten)
  if [ "$i" -gt 3 ]; then
    OLD_ITER=$((i - 3))
    rm -f "$RL_DATA_DIR/iter${OLD_ITER}_part"*.jsonl.gz 2>/dev/null || true
  fi

  log "Iteration $i fertig. Nächste Iteration..."
done

log ""
log "════════════════════════════════════════════════════════"
log "RL-Loop abgeschlossen"
log "  Modell: $CKPT_DIR/rl_latest.pt"
log "  ONNX:   $CKPT_DIR/rl_policy.onnx"
log "════════════════════════════════════════════════════════"
