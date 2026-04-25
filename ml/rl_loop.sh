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

NUM_ITER="${1:-10}"
RR_PER_ITER="${2:-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RL_DATA_DIR="$SCRIPT_DIR/rl_data"
CKPT_DIR="$SCRIPT_DIR/checkpoints"

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
log "════════════════════════════════════════════════════════"

for i in $(seq 1 "$NUM_ITER"); do
  log ""
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "RL-Iteration $i / $NUM_ITER"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # ── Phase A: Trajectory-Sammlung ─────────────────────────
  TRAJ_FILE="$RL_DATA_DIR/iter${i}.jsonl.gz"
  log "Phase A: $RR_PER_ITER × Round-Robin mit Sampling..."

  for j in $(seq 1 "$RR_PER_ITER"); do
    SUB_TRAJ="$RL_DATA_DIR/iter${i}_part${j}.jsonl.gz"
    log "  Round-Robin $j/$RR_PER_ITER → $(basename "$SUB_TRAJ")"
    (cd "$PROJECT_ROOT" && \
      npx tsx scripts/aiArena.ts \
        --roundrobin \
        --bc-policy "$CKPT_DIR/rl_policy.onnx" \
        --sample \
        --export-training "$SUB_TRAJ" \
      > /dev/null 2>&1) || log "  ⚠ Run $j fehlgeschlagen"
  done

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
  python train_rl.py \
    --bc-checkpoint "$CKPT_DIR/rl_latest.pt" \
    --data "${TRAJ_FILES[@]}" \
    --output "$CKPT_DIR/rl_iter${i}.pt" \
    --epochs 4 \
    --lr 3e-4 \
    --clip-eps 0.2 \
    --entropy-beta 0.01 \
    2>&1 | tee -a "$SCRIPT_DIR/rl_loop.log"

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
