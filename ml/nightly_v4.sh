#!/bin/bash
#
# TIKITAQ — Nightly v4 Training
# =============================
#
# Vollständiger autonomer Workflow nach Encoder/Heuristik/Mechanik-
# Updates am 2026-04-26:
#
#   Phase 1: BC-Datasets generieren (Heuristik-Spiele mit v4-Code)
#   Phase 2: BC trainieren auf neuer Encoder-Architektur (10 ROLE_LABELS)
#   Phase 3: ONNX-Export der BC-Policy (rl_loop nutzt sie als Start)
#   Phase 4: RL-Loop Self-Play (60 Iter, Reward v4)
#   Phase 5: League-Loop (30 Iter, gegen Heuristik + BC + Snapshots)
#   Phase 6: ONNX-Final nach public/ deployen + eval_v4.sh ausfuehren
#
# Geschaetzte Laufzeit:
#   Phase 1:    ~25 min (60 RR × ~25s)
#   Phase 2:    ~25 min (20 Epochen, MPS-Training)
#   Phase 3:    < 1 min
#   Phase 4:    ~3 h    (60 Iter × ~3 min)
#   Phase 5:    ~1.5 h  (30 Iter)
#   Phase 6:    ~5 min
#   Gesamt:     ~5.5–6 h
#
# Nutzung:
#   caffeinate -i ./nightly_v4.sh 2>&1 | tee nightly_v4.log &
#
# Pruefen wenn Du wieder da bist:
#   cat ml/nightly_v4.log
#   cat ml/rl_outcomes.csv
#   ls -lh public/rl_policy.onnx
#

set -e
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATASETS_DIR="$SCRIPT_DIR/datasets"
CKPT_DIR="$SCRIPT_DIR/checkpoints"
RL_DATA_DIR="$SCRIPT_DIR/rl_data"

NUM_BC_RR="${1:-60}"
NUM_BC_EPOCHS="${2:-20}"
NUM_RL_ITER="${3:-60}"
NUM_LEAGUE_ITER="${4:-30}"
LR="1e-4"

mkdir -p "$DATASETS_DIR" "$CKPT_DIR" "$RL_DATA_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "════════════════════════════════════════════════════════"
log "TIKITAQ Nightly v4"
log "  BC RRs:       $NUM_BC_RR"
log "  BC epochs:    $NUM_BC_EPOCHS"
log "  RL iter:      $NUM_RL_ITER"
log "  League iter:  $NUM_LEAGUE_ITER"
log "  LR:           $LR"
log "════════════════════════════════════════════════════════"

cd "$SCRIPT_DIR"
source .venv/bin/activate

# ── Phase 1: BC-Datasets (Heuristik-Spiele) ────────────────────
log ""
log "Phase 1/6: BC-Datasets generieren ($NUM_BC_RR RRs)..."
PHASE_T0=$(date +%s)
for i in $(seq 1 "$NUM_BC_RR"); do
  OUTFILE="$DATASETS_DIR/run${i}.jsonl.gz"
  log "  RR ${i}/${NUM_BC_RR} → $(basename "$OUTFILE")"
  (cd "$PROJECT_ROOT" && \
    npx tsx scripts/aiArena.ts --roundrobin --export-training "$OUTFILE" \
    > /dev/null 2>&1) || log "  ⚠ RR $i fehlgeschlagen"
done
PHASE_DT=$(($(date +%s) - PHASE_T0))
TOTAL_FILES=("$DATASETS_DIR"/run*.jsonl.gz)
log "  Phase 1 fertig: ${#TOTAL_FILES[@]} Dateien in ${PHASE_DT}s"
log "  Disk: $(du -sh "$DATASETS_DIR" | cut -f1)"

# ── Phase 2: BC-Training ────────────────────────────────────────
log ""
log "Phase 2/6: BC-Training ($NUM_BC_EPOCHS Epochen)..."
PHASE_T0=$(date +%s)
python train_bc.py \
  --data datasets/run*.jsonl.gz \
  --epochs "$NUM_BC_EPOCHS" \
  --batch-size 256 \
  --lr 1e-3 \
  --streaming \
  --shuffle-buffer 8192 \
  --val-split 0.1 \
  2>&1 | tee "$SCRIPT_DIR/bc_train.log"
PHASE_DT=$(($(date +%s) - PHASE_T0))
log "  Phase 2 fertig in ${PHASE_DT}s"

if [ ! -f "$CKPT_DIR/bc_latest.pt" ]; then
  log "❌ bc_latest.pt fehlt — Phase 2 hat versagt. Abbruch."
  exit 1
fi

# ── Phase 3: ONNX-Export ────────────────────────────────────────
log ""
log "Phase 3/6: ONNX-Export der BC-Policy..."
python export_onnx.py \
  --checkpoint "$CKPT_DIR/bc_latest.pt" \
  --out "$CKPT_DIR/bc_policy.onnx" \
  2>&1 | tee -a "$SCRIPT_DIR/bc_train.log"
# rl_loop erwartet rl_policy.onnx + rl_latest.pt als Startpunkt
cp "$CKPT_DIR/bc_latest.pt" "$CKPT_DIR/rl_latest.pt"
cp "$CKPT_DIR/bc_policy.onnx" "$CKPT_DIR/rl_policy.onnx"
log "  Phase 3 fertig — rl_loop kann starten"

# ── Phase 4: RL-Loop Self-Play ──────────────────────────────────
log ""
log "Phase 4/6: RL-Loop Self-Play ($NUM_RL_ITER Iter, LR=$LR, Reward v4)..."
PHASE_T0=$(date +%s)
bash rl_loop.sh "$NUM_RL_ITER" 3 "$LR" 2>&1 | tee "$SCRIPT_DIR/rl_phase.log"
PHASE_DT=$(($(date +%s) - PHASE_T0))
log "  Phase 4 fertig in ${PHASE_DT}s"

# rl_loop hat das Modell jetzt unter rl_latest.pt + rl_policy.onnx aktualisiert.
# Wir behalten einen Snapshot davor:
cp "$CKPT_DIR/rl_latest.pt" "$CKPT_DIR/rl_v4_pure_final.pt"
cp "$CKPT_DIR/rl_policy.onnx" "$CKPT_DIR/rl_v4_pure_final.onnx"

# ── Phase 5: League-Loop ────────────────────────────────────────
log ""
log "Phase 5/6: League-Loop ($NUM_LEAGUE_ITER Iter)..."
PHASE_T0=$(date +%s)
bash rl_loop_league.sh "$NUM_LEAGUE_ITER" "$LR" 2>&1 | tee "$SCRIPT_DIR/league_phase.log"
PHASE_DT=$(($(date +%s) - PHASE_T0))
log "  Phase 5 fertig in ${PHASE_DT}s"

cp "$CKPT_DIR/rl_latest.pt" "$CKPT_DIR/rl_v4_league_final.pt"
cp "$CKPT_DIR/rl_policy.onnx" "$CKPT_DIR/rl_v4_league_final.onnx"

# ── Phase 6: Deploy + Eval ──────────────────────────────────────
log ""
log "Phase 6/6: Deploy nach public/ + Eval-Tournament..."
# Wir deployen die LEAGUE-Variante (= robuster gegen unbekannte Gegner).
# Falls v3-pure-Style gewuenscht: rl_v4_pure_final.onnx ist auch gespeichert.
cp "$CKPT_DIR/rl_v4_league_final.onnx" "$PROJECT_ROOT/public/rl_policy.onnx"
cp "$CKPT_DIR/bc_policy.onnx" "$PROJECT_ROOT/public/bc_policy.onnx"
log "  Deployed: public/rl_policy.onnx (League v4)"

log ""
log "════════════════════════════════════════════════════════"
log "NIGHTLY v4 FERTIG"
log "  BC final:        $CKPT_DIR/bc_latest.pt"
log "  RL pure final:   $CKPT_DIR/rl_v4_pure_final.pt"
log "  RL league final: $CKPT_DIR/rl_v4_league_final.pt (deployed)"
log "  Outcomes-CSV:    $SCRIPT_DIR/rl_outcomes.csv"
log "════════════════════════════════════════════════════════"
log ""
log "Naechste Schritte beim naechsten Login:"
log "  1. cat ml/rl_outcomes.csv | tail -10        # Trend ansehen"
log "  2. python ml/plot_outcomes.py               # Plot generieren"
log "  3. bash ml/eval_v3.sh                       # Tournament eval (v4 vs Heur/BC)"
log "  4. Browser: hard reload, Match starten     # neuer RL-Stand spielt"
