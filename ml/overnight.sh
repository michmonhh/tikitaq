#!/bin/bash
#
# TIKITAQ Overnight-Training
# =========================
#
# Führt den kompletten BC-Workflow autonom aus:
#   1. Generiert N Round-Robin-Datensätze
#   2. Trainiert das Policy-Netz mit Streaming
#   3. Exportiert ONNX + Evaluiert
#
# Nutzung:
#   cd ml/
#   ./overnight.sh [num_round_robins] [num_epochs]
#
# Default: 200 RRs, 25 Epochen (~6-7 h auf M1 MacBook Air)
#
# Start mit caffeinate, damit der Mac nicht in Sleep geht:
#   caffeinate -i ./overnight.sh 200 25 2>&1 | tee overnight.log
#
# Der Prozess läuft auch beim zugeklappten Laptop weiter, solange das
# Netzteil angeschlossen ist (caffeinate -i verhindert System-Sleep).

set -e
set -o pipefail

NUM_RRS="${1:-200}"
NUM_EPOCHS="${2:-25}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATASETS_DIR="$SCRIPT_DIR/datasets"
CHECKPOINTS_DIR="$SCRIPT_DIR/checkpoints"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "════════════════════════════════════════════════════════"
log "TIKITAQ Overnight Training"
log "  Round Robins:  $NUM_RRS"
log "  Epochs:        $NUM_EPOCHS"
log "  Project root:  $PROJECT_ROOT"
log "════════════════════════════════════════════════════════"

# ── Phase 1: Dataset-Generation ───────────────────────────────
log ""
log "Phase 1: Generating $NUM_RRS round-robin datasets..."

mkdir -p "$DATASETS_DIR"

# Bestimme Startnummer: falls schon Dateien da, weiter zählen
EXISTING=$(ls "$DATASETS_DIR"/run*.jsonl.gz 2>/dev/null | wc -l | tr -d ' ')
log "  Existing runs: $EXISTING"
START_IDX=$((EXISTING + 1))
END_IDX=$((EXISTING + NUM_RRS))

for i in $(seq "$START_IDX" "$END_IDX"); do
  OUTFILE="$DATASETS_DIR/run${i}.jsonl.gz"
  log "  [${i}/${END_IDX}] → $(basename "$OUTFILE")"
  (cd "$PROJECT_ROOT" && \
    npx tsx scripts/aiArena.ts --roundrobin --export-training "$OUTFILE" \
    > /dev/null 2>&1) || {
    log "  ⚠ Arena-Run fehlgeschlagen bei $i, mache weiter"
    continue
  }

  # Zwischen-Check: Disk-Space?
  AVAIL=$(df -k "$DATASETS_DIR" | awk 'NR==2 {print $4}')
  AVAIL_GB=$((AVAIL / 1024 / 1024))
  if [ "$AVAIL_GB" -lt 5 ]; then
    log "  ⚠ Weniger als 5 GB frei — Abbruch Dataset-Gen bei $i"
    break
  fi
done

TOTAL_DATASETS=$(ls "$DATASETS_DIR"/run*.jsonl.gz 2>/dev/null | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$DATASETS_DIR" | cut -f1)
log ""
log "Datasets fertig: $TOTAL_DATASETS Dateien, gesamt $TOTAL_SIZE"

# ── Phase 2: Training ─────────────────────────────────────────
log ""
log "Phase 2: Training ($NUM_EPOCHS Epochen, Streaming-Modus)..."

cd "$SCRIPT_DIR"
source .venv/bin/activate

python train_bc.py \
  --data datasets/run*.jsonl.gz \
  --epochs "$NUM_EPOCHS" \
  --batch-size 256 \
  --lr 1e-3 \
  --streaming \
  --shuffle-buffer 8192 \
  --val-split 0.1 \
  2>&1 | tee "$SCRIPT_DIR/train_output.log"

# ── Phase 3: Export + Eval ────────────────────────────────────
log ""
log "Phase 3: ONNX-Export + Evaluation..."

if [ -f "$CHECKPOINTS_DIR/bc_latest.pt" ]; then
  python export_onnx.py \
    --checkpoint "$CHECKPOINTS_DIR/bc_latest.pt" \
    --out "$CHECKPOINTS_DIR/bc_policy.onnx" \
    2>&1 | tee -a "$SCRIPT_DIR/train_output.log"

  python evaluate_bc.py \
    --checkpoint "$CHECKPOINTS_DIR/bc_latest.pt" \
    --data datasets/run1.jsonl.gz \
    2>&1 | tee -a "$SCRIPT_DIR/train_output.log"
else
  log "⚠ Kein bc_latest.pt gefunden, Export übersprungen"
fi

log ""
log "════════════════════════════════════════════════════════"
log "FERTIG"
log "  Checkpoints:  $CHECKPOINTS_DIR/bc_latest.pt, bc_last.pt"
log "  ONNX:         $CHECKPOINTS_DIR/bc_policy.onnx"
log "  Train-Log:    $SCRIPT_DIR/train_output.log"
log "════════════════════════════════════════════════════════"
