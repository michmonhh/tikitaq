#!/bin/bash
#
# TIKITAQ — Eval-Tournament nach v3-Run
# =====================================
#
# Testet die finale RL-Policy gegen drei Gegner-Generationen:
#   1. Heuristik (default)
#   2. BC-Policy (bc_policy.onnx)
#   3. v2-RL (archive_v2/rl_v2_final.onnx)
#
# Pro Gegner werden 2 Round-Robins gespielt (RL als Home, RL als Away),
# damit beide Perspektiven abgedeckt sind. Insgesamt 6 RRs ≈ 3 Minuten.
#
# Outputs:
#   - eval_results/<gegner>_team1.txt  (RL spielt als Heim)
#   - eval_results/<gegner>_team2.txt  (RL spielt als Auswärts)
#   - eval_results/summary.txt         (zusammenfassende Tabelle)
#
# Nutzung:
#   ./eval_v3.sh
#

set -e
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CKPT_DIR="$SCRIPT_DIR/checkpoints"
ARCHIVE_DIR="$SCRIPT_DIR/archive_v2"
EVAL_DIR="$SCRIPT_DIR/eval_results"
mkdir -p "$EVAL_DIR"

RL_V3="$CKPT_DIR/rl_policy.onnx"
BC="$CKPT_DIR/bc_policy.onnx"
RL_V2="$ARCHIVE_DIR/rl_v2_final.onnx"

if [ ! -f "$RL_V3" ]; then
  echo "❌ $RL_V3 fehlt"
  exit 1
fi

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# Helper: rennt 2 RRs (RL=team1, RL=team2) gegen einen Opponent
# args: name, opponent_arg (entweder --opponent-policy <path> oder leer für Heuristik)
run_eval() {
  local name="$1"
  local opp_args="$2"
  local out1="$EVAL_DIR/${name}_team1.txt"
  local out2="$EVAL_DIR/${name}_team2.txt"

  log "── Eval gegen $name ──"

  log "  RR mit RL=Team1 ..."
  (cd "$PROJECT_ROOT" && \
    npx tsx scripts/aiArena.ts \
      --roundrobin \
      --bc-policy "$RL_V3" \
      --bc-team 1 \
      $opp_args \
    > "$out1" 2>&1)

  log "  RR mit RL=Team2 ..."
  (cd "$PROJECT_ROOT" && \
    npx tsx scripts/aiArena.ts \
      --roundrobin \
      --bc-policy "$RL_V3" \
      --bc-team 2 \
      $opp_args \
    > "$out2" 2>&1)
}

# Outcome-Extraktion (ähnlich rl_loop.sh's parse_metric)
parse_metric() {
  local label="$1" file="$2"
  grep -E "$label" "$file" | head -1 | grep -oE '[0-9]+\.[0-9]+|[0-9]+' | head -1
}

# Win-Rate aus dem Aggregat extrahieren
parse_winrate() {
  local file="$1" team="$2"  # team = "Heim" oder "Auswärts"
  # Aggregate-Block hat eine Zeile "Siege" mit zwei Zahlen (Home / Away)
  grep -E "^\s*Siege\s" "$file" | head -1 | awk '{print $(NF-1)" "$NF}'
}

run_eval "heuristik" ""
run_eval "bc"        "--opponent-policy $BC"
if [ -f "$RL_V2" ]; then
  run_eval "rl_v2"   "--opponent-policy $RL_V2"
else
  log "  (kein $RL_V2 — überspringe rl_v2-Eval)"
fi

# ── Summary ────────────────────────────────────────────────
SUMMARY="$EVAL_DIR/summary.txt"
{
  echo "TIKITAQ Eval — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "RL v3: $RL_V3"
  echo
  printf "%-12s | %-10s | %-10s | %-10s | %-10s | %-10s\n" \
    "Gegner" "Tore/M" "xG" "Schüsse" "Box%" "Heim%"
  echo "─────────────┼────────────┼────────────┼────────────┼────────────┼────────────"
  for name in heuristik bc rl_v2; do
    f1="$EVAL_DIR/${name}_team1.txt"
    f2="$EVAL_DIR/${name}_team2.txt"
    [ ! -f "$f1" ] && continue

    # Average across both perspectives
    g1=$(parse_metric "Tore pro Match" "$f1")
    g2=$(parse_metric "Tore pro Match" "$f2")
    x1=$(parse_metric "xG / Team" "$f1")
    x2=$(parse_metric "xG / Team" "$f2")
    s1=$(parse_metric "Schüsse / Team" "$f1")
    s2=$(parse_metric "Schüsse / Team" "$f2")
    b1=$(parse_metric "Box-Präsenz / Team" "$f1")
    b2=$(parse_metric "Box-Präsenz / Team" "$f2")
    h1=$(parse_metric "Heimsieg" "$f1")
    h2=$(parse_metric "Heimsieg" "$f2")

    g_avg=$(echo "($g1 + $g2) / 2" | bc -l 2>/dev/null | xargs printf "%.2f")
    x_avg=$(echo "($x1 + $x2) / 2" | bc -l 2>/dev/null | xargs printf "%.2f")
    s_avg=$(echo "($s1 + $s2) / 2" | bc -l 2>/dev/null | xargs printf "%.2f")
    b_avg=$(echo "($b1 + $b2) / 2" | bc -l 2>/dev/null | xargs printf "%.1f")
    h_avg=$(echo "($h1 + $h2) / 2" | bc -l 2>/dev/null | xargs printf "%.0f")

    printf "%-12s | %-10s | %-10s | %-10s | %-10s | %-10s\n" \
      "$name" "$g_avg" "$x_avg" "$s_avg" "$b_avg" "$h_avg"
  done
  echo
  echo "Hinweis: Werte sind gemittelt aus RL-als-Heim + RL-als-Auswärts."
  echo "Heimsieg% = wie oft das spielende Heim-Team gewann (45-50% bei"
  echo "starker Policy unabhängig vom Opponent — bei schwachem Gegner"
  echo "kann RL als Heim deutlich >50% gewinnen)."
} > "$SUMMARY"

log "Eval-Summary: $SUMMARY"
echo
cat "$SUMMARY"
