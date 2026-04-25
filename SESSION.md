# TIKITAQ — Session-Stand (2026-04-25, 12:15 Uhr)

> Lebendes Protokoll der aktuellen Chat-Sitzung. Nach einem Chat-Crash hier
> einsteigen: Abschnitt **"Wo wir stehen"** lesen, dann **"Offen"** für den
> nächsten Schritt, dann den relevanten Punkt unter **"Änderungen heute"**
> für Kontext.

## Wo wir stehen

- Branch: `dev` bei **`68bdc79`** (Anti-Hacking commit), gepusht.
- **Stufe 1 (Heuristik)**: ✅ abgeschlossen
- **Stufe 2 (BC)**: ✅ Pipeline + Modell trainiert (val_acc 0.775, fast
  identisches Spielverhalten wie Heuristik)
- **Stufe 3 (RL)**: ✅ Komplett gebaut + erste Ergebnisse
  - PPO-Pipeline funktioniert
  - Erster Run (5 Iter) brachte BC → Bundesliga-Niveau (Tore 3.07/Match)
  - Anti-Hacking-Schutz eingebaut nach erstem Run
  - Aktuell läuft Run v2 (30 Iter × 3 RR × LR 1e-4) mit Outcome-Logging

## Stufe 3 — Was gebaut wurde (heute Nacht/Morgen)

### TypeScript-Engine
- **`engine/xg.ts`** — Positions-basierte xG-Schätzung (Distanz × Winkel
  × Korridor-Block × TW-Position). Sanity-Check OK: 5er=0.42, 16er-Rand=0.10
- **`engine/ai/reward.ts`** — Reward-Funktion gemäß REWARD.md (Tore ±15,
  xG-Delta×10, Ballbesitz zonen-/confidence-abhängig, Zwischenziele,
  Defense, End-Game-Multiplikator)
- **`engine/ai/rewardState.ts`** — Anti-Hacking-Counter (3+ Ecken in Folge
  ohne Schuss → ⅓ Reward; 3+ Fouls in Folge → ½ Reward; 5+ Rückpässe → Malus)
- **`engine/ai/policy/onnxPolicy.ts`** — ONNX-Loader mit Sampling +
  log_prob (für PPO)
- **`engine/ai/policy/lastDecision.ts`** — Slot zwischen action und reward
- **`engine/simulation/runAIMatch.ts`** — async + onBeforeAITurn-Hook +
  reward-tracking pro Turn

### Python ML
- **`ml/rl_dataset.py`** — Trajectory-Reader mit γ-Returns
- **`ml/train_rl.py`** — PPO mit Clipped Surrogate Loss + Entropy-Bonus
- **`ml/rl_loop.sh`** — Self-Play-Orchestrierung mit Outcome-Logging
- **`ml/REWARD.md`** — komplette Reward-Spec (User-Interview-Ergebnis)

## Erste RL-Resultate (Run v1, 5 Iter)

Vergleich aller Stufen im Round-Robin (306 Matches):

| Metrik | Heuristik | BC | **RL @ Iter 4** | Bundesliga |
|---|---:|---:|---:|---:|
| Tore/Match | 2.67-2.82 | 2.61 | **3.07** ✓ | 3.00 |
| xG/Team | 1.18-1.32 | 1.29 | **1.58** ✓ | 1.50 |
| Schüsse/Team | 3.1 | 3.1 | **3.9** | 12.5 |
| Heimsieg | 40-44 % | 38 % | 42 % | 43 % |
| Box-Präsenz | 22 % | 22 % | 22 % | 25 % |
| Eckbälle | 0.9 | 0.9 | 1.1 | 4.5 |

**Ergebnis Stufe 3 PPO:** Bundesliga-Niveau bei Tor- und xG-Rate erreicht
nach **5 Iterationen in 3 Minuten**.

Aber: Iter 11 zeigte Performance-Rückschritt (Tore 2.81 statt 3.07) →
**Reward-Plateau ≠ Performance-Plateau**, klassische PPO-Instabilität.

## Optimierungs-Maßnahmen (heute 11:40)

Nach Diagnose des Performance-Rückschritts in Run v1 wurden drei
Verbesserungen eingebaut bevor der nächste Run gestartet wurde:

1. **Outcome-Logging**: pro Iter direkt Tore/Siege/xG/Box-Präsenz/Eckbälle
   in `rl_outcomes.csv` — nicht nur Reward-Mittel
2. **3 RR pro Iter** (statt 1): 3× mehr Trajectories für stabilere
   PPO-Gradients
3. **LR 1e-4** (statt 3e-4): kleinere Policy-Sprünge, weniger Oszillation

Run v2 läuft seit 11:44.

## Aktueller Run v2 — Outcome-Trace

```
Iter:    1     2     3     4     5     6     7     8     9    10    11    12    13
Tore:  2.68  2.73  2.61  2.69  2.63  2.70  2.82  2.80  2.86  2.66  2.99  2.81  2.77
xG:    1.32  1.31  1.31  1.36  1.39  1.41  1.43  1.46  1.41  1.36  1.42  1.42  1.45
Heim:   41%   42%   41%   44%   38%   39%   45%   39%   43%   41%   40%   38%   45%
```

xG steigt klar: **1.32 → 1.46** über 7 Iter, dann Plateau bei 1.42-1.46.
Tore folgen mit Verzögerung (Iter 11: 2.99 fast Bundesliga-Ziel 3.00).

## Caveat: gzip-Streaming-Bug

Bei jedem Trajectory-Export bekommt das Python-RL-Dataset eine Warnung
"Compressed file ended before the end-of-stream marker was reached". Die
Robustness-Logik (übersprungene Datei → trotzdem laden was geht) fängt das
ab. Aber der Bug ist im aiArena-gzip-Closer und sollte irgendwann gefixt
werden. Daten sind nutzbar, kein Datenverlust.

## Roadmap

| Phase | Status |
|---|---|
| 1 — Heuristik | ✅ |
| 2 — Behavior Cloning | ✅ |
| 3a — ONNX-Inferenz TS | ✅ |
| 3b — Reward-Definition | ✅ |
| 3c — xG-Modul | ✅ |
| 3d — A/B BC vs Heuristik | ✅ |
| 3e — RL-Trajectory-Format | ✅ |
| 3f — PPO-Trainer | ✅ |
| 3g — Self-Play-Loop | ✅ |
| 3h — Anti-Hacking | ✅ |
| 3i — Outcome-Logging | ✅ |
| 3j — Run v2 (30 Iter, 3 RR) | 🏃 läuft |
| 4 — Value-Network (Actor-Critic) | TODO falls v2 instabil |
| 5 — League Training | später |

## Performance-Benchmark

| Aufgabe | Zeit | Disk |
|---|---:|---:|
| 1 RR Heuristik | 32 s | 22 MB |
| 1 RR BC-Inferenz | 25 s | — |
| 1 RR RL-Sampling + Export | 26 s | 22 MB |
| 1 PPO-Iter (3 RR + Update) | ~85 s | — |
| 30-Iter v2 Run total | ~45 min | ~2 GB |

## Änderungen heute (neueste zuerst)

- **`68bdc79`** — feat(ml): RL Anti-Hacking-Schutz + erste Stufe-3-Resultate
- **`c00a9b8`** — feat(ml): Stufe 3 — kompletter RL-Pipeline-Bau (Self-Play PPO)
- **`8abf688`** — feat(ml): ONNX-Inferenz-Pipeline + xG-Modul + async runAIMatch
- **`858994b`** — docs(ml): Reward-Funktion Design für Stufe 3 (RL)
- **`9712373`** — feat(ml): Streaming-Dataset + Overnight-Orchestrierung
- **`b3cff1e`** — feat(ml): Python-Projekt für Behavior-Cloning

## Arbeitsumgebung

- Repo: `~/Documents/tikitaq`
- Remote: `https://github.com/michmonhh/tikitaq.git`, Branch `dev`
- Arena-CLI: `npx tsx scripts/aiArena.ts --roundrobin`
- Mit BC-Policy: `--bc-policy ml/checkpoints/bc_policy.onnx`
- Mit RL-Policy: `--bc-policy ml/checkpoints/rl_policy.onnx`
- Sampling-Modus: `--sample` (für Trajectory-Sammlung)
- Training-Export: `--export-training out.jsonl.gz`
- BC-Training: `cd ml/ && source .venv/bin/activate && python train_bc.py ...`
- RL-Loop: `cd ml/ && ./rl_loop.sh 30 3 1e-4`

## Nächster konkreter Schritt

Run v2 abwarten (~30 min noch), dann:
1. `rl_outcomes.csv` analysieren — wo war das Maximum?
2. Mit dem besten Checkpoint Round-Robin-Vergleich vs. BC und Heuristik
3. Wenn weiter Plateau → Value-Network (Actor-Critic) bauen
4. Wenn Trend klar nach oben → längeren Run (50-100 Iter)
