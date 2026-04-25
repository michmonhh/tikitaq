#!/bin/bash
#
# TIKITAQ RL — League Self-Play-Loop (v3, 2026-04-25)
# ===================================================
#
# Erweiterung von rl_loop.sh um League-Training:
# Statt nur Self-Play (current vs current) trainiert das Netz hier auch
# gegen DIVERSE Gegner — vermeidet Überanpassung an einen Spielstil.
#
# Pro Iteration werden 3 Round-Robins gespielt:
#   1. Self-Play (current RL vs current RL — beide Teams)
#   2. vs Heuristik (current RL vs Default-Heuristik)
#   3. vs Pool (current RL vs alter Snapshot oder BC-Policy)
#
# Bei Iter %2 == 0 spielt RL als Team 1 (Home), sonst als Team 2 (Away)
# in den Mixed-Modi — so sieht das Netz beide Perspektiven.
#
# Snapshots:
#   Alle 10 Iterationen wird rl_latest.pt als snap_iterN.onnx gespeichert.
#   Der Pool aus Snapshots + bc_policy.onnx ist die "alte Generationen"-
#   Sammlung, gegen die zufällig gespielt wird.
#
# Nutzung:
#   ./rl_loop_league.sh [num_iterations] [lr]
#
# Hinweis: rl_policy.onnx muss bereits existieren (z.B. nach einem
# rl_loop.sh-Run). Sonst wird vom BC-Checkpoint initialisiert.
#

set -e
shopt -s nullglob

NUM_ITER="${1:-30}"
LR="${2:-1e-4}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RL_DATA_DIR="$SCRIPT_DIR/rl_data"
CKPT_DIR="$SCRIPT_DIR/checkpoints"
SNAP_DIR="$CKPT_DIR/snapshots"
OUTCOMES_CSV="$SCRIPT_DIR/rl_outcomes.csv"
SNAPSHOT_EVERY=10

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

mkdir -p "$RL_DATA_DIR" "$SNAP_DIR"

cd "$SCRIPT_DIR"
source .venv/bin/activate

if [ ! -f "$CKPT_DIR/bc_latest.pt" ]; then
  log "❌ checkpoints/bc_latest.pt fehlt"
  exit 1
fi

if [ ! -f "$CKPT_DIR/rl_policy.onnx" ]; then
  log "Initiales ONNX aus BC-Checkpoint..."
  python export_onnx.py --checkpoint "$CKPT_DIR/bc_latest.pt" \
    --out "$CKPT_DIR/rl_policy.onnx"
  cp "$CKPT_DIR/bc_latest.pt" "$CKPT_DIR/rl_latest.pt"
fi

log "════════════════════════════════════════════════════════"
log "TIKITAQ RL League Loop"
log "  Iterationen:        $NUM_ITER"
log "  Lernrate:           $LR"
log "  Pro Iter: 1 self + 1 vs heuristik + 1 vs pool"
log "  Snapshot-Intervall: alle $SNAPSHOT_EVERY Iterationen"
log "════════════════════════════════════════════════════════"

if [ ! -f "$OUTCOMES_CSV" ]; then
  echo "iter,goals_per_match,xg_per_team,shots_per_team,box_presence_pct,corners_per_team,home_win_pct,reward_mean,pg_loss_final,vf_loss_final,explained_var_final" > "$OUTCOMES_CSV"
fi

parse_metric() {
  local label="$1" file="$2"
  grep -E "$label" "$file" | head -1 | grep -oE '[0-9]+\.[0-9]+|[0-9]+' | head -1
}

# Wählt zufällig einen Snapshot/BC aus dem Pool
pick_pool_opponent() {
  local pool=()
  pool+=("$CKPT_DIR/bc_policy.onnx")
  for f in "$SNAP_DIR"/snap_iter*.onnx; do
    pool+=("$f")
  done
  local n=${#pool[@]}
  local idx=$((RANDOM % n))
  echo "${pool[$idx]}"
}

for i in $(seq 1 "$NUM_ITER"); do
  log ""
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "League-Iteration $i / $NUM_ITER"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Welches Team ist RL in den Mixed-Modi diese Iter?
  RL_TEAM=$(( (i % 2) + 1 ))
  log "  RL-Team in Mixed-Modi: $RL_TEAM"

  ITER_STATS_FILE="$RL_DATA_DIR/iter${i}_stats.txt"
  : > "$ITER_STATS_FILE"

  # ── Phase A1: Self-Play ────────────────────────────────
  log "Phase A1: Self-Play Round-Robin..."
  SUB_TRAJ="$RL_DATA_DIR/iter${i}_part1_self.jsonl.gz"
  (cd "$PROJECT_ROOT" && \
    npx tsx scripts/aiArena.ts \
      --roundrobin \
      --bc-policy "$CKPT_DIR/rl_policy.onnx" \
      --sample \
      --export-training "$SUB_TRAJ" \
    > "$ITER_STATS_FILE" 2>&1) || log "  ⚠ Self-Play-Run fehlgeschlagen"

  # ── Phase A2: vs Heuristik ──────────────────────────────
  log "Phase A2: vs Heuristik (RL=Team$RL_TEAM)..."
  SUB_TRAJ="$RL_DATA_DIR/iter${i}_part2_heur.jsonl.gz"
  (cd "$PROJECT_ROOT" && \
    npx tsx scripts/aiArena.ts \
      --roundrobin \
      --bc-policy "$CKPT_DIR/rl_policy.onnx" \
      --bc-team "$RL_TEAM" \
      --sample \
      --export-training "$SUB_TRAJ" \
    > /dev/null 2>&1) || log "  ⚠ vs-Heuristik-Run fehlgeschlagen"

  # ── Phase A3: vs Pool (BC oder alter Snapshot) ──────────
  POOL_OPP=$(pick_pool_opponent)
  log "Phase A3: vs Pool ($(basename "$POOL_OPP"), RL=Team$RL_TEAM)..."
  SUB_TRAJ="$RL_DATA_DIR/iter${i}_part3_pool.jsonl.gz"
  (cd "$PROJECT_ROOT" && \
    npx tsx scripts/aiArena.ts \
      --roundrobin \
      --bc-policy "$CKPT_DIR/rl_policy.onnx" \
      --bc-team "$RL_TEAM" \
      --opponent-policy "$POOL_OPP" \
      --sample \
      --export-training "$SUB_TRAJ" \
    > /dev/null 2>&1) || log "  ⚠ vs-Pool-Run fehlgeschlagen"

  # Outcomes nur aus Self-Play (vergleichbar mit rl_loop.sh-Werten)
  GPM=$(parse_metric "Tore pro Match" "$ITER_STATS_FILE")
  XG=$(parse_metric "xG / Team" "$ITER_STATS_FILE")
  SHOTS=$(parse_metric "Schüsse / Team" "$ITER_STATS_FILE")
  BOX=$(parse_metric "Box-Präsenz / Team" "$ITER_STATS_FILE")
  CORNERS=$(parse_metric "Eckbälle / Team" "$ITER_STATS_FILE")
  HOMEWIN=$(parse_metric "Heimsieg" "$ITER_STATS_FILE")
  log "  Self-Play-Outcomes: Tore/Match=$GPM  xG=$XG  Schüsse=$SHOTS  Box=${BOX}%  Ecken=$CORNERS  Heimsieg=${HOMEWIN}%"

  TRAJ_FILES=("$RL_DATA_DIR"/iter${i}_part*.jsonl.gz)
  if [ ${#TRAJ_FILES[@]} -eq 0 ]; then
    log "❌ Keine Trajectory-Dateien — Iteration übersprungen"
    continue
  fi
  TOTAL_SIZE=$(du -sh "$RL_DATA_DIR" | cut -f1)
  log "  Sammelung: ${#TRAJ_FILES[@]} Dateien, gesamt $TOTAL_SIZE"

  # ── Phase B: PPO-Update ─────────────────────────────────
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

  REWARD_MEAN=$(grep "Reward stats" "$PPO_OUT_FILE" | grep -oE 'mean=[-0-9.]+' | head -1 | sed 's/mean=//')
  FINAL_PG_LOSS=$(grep "pg_loss=" "$PPO_OUT_FILE" | tail -1 | grep -oE 'pg_loss=[-0-9.]+' | sed 's/pg_loss=//')
  FINAL_VF_LOSS=$(grep "vf_loss=" "$PPO_OUT_FILE" | tail -1 | grep -oE 'vf_loss=[-0-9.]+' | sed 's/vf_loss=//')
  FINAL_EV=$(grep "explained_var=" "$PPO_OUT_FILE" | tail -1 | grep -oE 'explained_var=[-0-9.]+' | sed 's/explained_var=//')

  echo "$i,$GPM,$XG,$SHOTS,$BOX,$CORNERS,$HOMEWIN,$REWARD_MEAN,$FINAL_PG_LOSS,$FINAL_VF_LOSS,$FINAL_EV" >> "$OUTCOMES_CSV"

  # ── Phase C: Update + ONNX + Snapshot ───────────────────
  cp "$CKPT_DIR/rl_iter${i}.pt" "$CKPT_DIR/rl_latest.pt"
  python export_onnx.py \
    --checkpoint "$CKPT_DIR/rl_latest.pt" \
    --out "$CKPT_DIR/rl_policy.onnx" > /dev/null

  # Alle SNAPSHOT_EVERY Iter eine Kopie als Snapshot ablegen
  if (( i % SNAPSHOT_EVERY == 0 )); then
    SNAP_PATH="$SNAP_DIR/snap_iter${i}.onnx"
    cp "$CKPT_DIR/rl_policy.onnx" "$SNAP_PATH"
    log "  📌 Snapshot gespeichert: $(basename "$SNAP_PATH")"
  fi

  # Alte Trajectories aufräumen (nur die letzten 3 Iter behalten)
  if [ "$i" -gt 3 ]; then
    OLD_ITER=$((i - 3))
    rm -f "$RL_DATA_DIR/iter${OLD_ITER}_part"*.jsonl.gz 2>/dev/null || true
  fi

  log "Iteration $i fertig."
done

log ""
log "════════════════════════════════════════════════════════"
log "RL-League-Loop abgeschlossen"
log "  Modell:    $CKPT_DIR/rl_latest.pt"
log "  ONNX:      $CKPT_DIR/rl_policy.onnx"
log "  Snapshots: $SNAP_DIR/"
log "════════════════════════════════════════════════════════"
