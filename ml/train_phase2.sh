#!/bin/bash
#
# Restart-Skript: führt nur Phase 2 (Training) + Phase 3 (Export) aus.
# Wird genutzt, wenn Phase 1 (Dataset-Generation) bereits fertig ist.
#

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NUM_EPOCHS="${1:-10}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

cd "$SCRIPT_DIR"
source .venv/bin/activate

DS_COUNT=$(ls datasets/run*.jsonl.gz 2>/dev/null | wc -l | tr -d ' ')
log "════════════════════════════════════════════════════════"
log "Phase 2 Restart — Training only"
log "  Datasets verfügbar: $DS_COUNT"
log "  Epochen: $NUM_EPOCHS"
log "════════════════════════════════════════════════════════"

log "Phase 2: Training (Streaming-Modus)..."
python train_bc.py \
  --data datasets/run*.jsonl.gz \
  --epochs "$NUM_EPOCHS" \
  --batch-size 256 \
  --lr 1e-3 \
  --streaming \
  --shuffle-buffer 8192 \
  --val-split 0.1 \
  2>&1 | tee "$SCRIPT_DIR/train_output.log"

log "Phase 3: ONNX-Export + Evaluation..."
if [ -f "checkpoints/bc_latest.pt" ]; then
  python export_onnx.py \
    --checkpoint checkpoints/bc_latest.pt \
    --out checkpoints/bc_policy.onnx \
    2>&1 | tee -a "$SCRIPT_DIR/train_output.log"

  # Eval auf der ersten Datei (repräsentativ)
  FIRST_DS=$(ls datasets/run*.jsonl.gz | head -1)
  python evaluate_bc.py \
    --checkpoint checkpoints/bc_latest.pt \
    --data "$FIRST_DS" \
    2>&1 | tee -a "$SCRIPT_DIR/train_output.log"
else
  log "⚠ Kein bc_latest.pt gefunden, Export übersprungen"
fi

log "════════════════════════════════════════════════════════"
log "FERTIG"
log "════════════════════════════════════════════════════════"
