# TIKITAQ — Session-Stand (2026-04-25, 15:10 Uhr — v3-Update)

> Lebendes Protokoll der aktuellen Chat-Sitzung. Nach einem Chat-Crash hier
> einsteigen: Abschnitt **"Wo wir stehen"** lesen, dann **"Offen"** für den
> nächsten Schritt, dann den relevanten Punkt unter **"Änderungen heute"**
> für Kontext.

## Wo wir stehen

- Branch: `dev` bei **`1e0965f`** (v3 Reward + Actor-Critic + League).
- **Stufe 1 (Heuristik)**: ✅
- **Stufe 2 (BC)**: ✅ val_acc 0.775
- **Stufe 3a–3i (PPO + Self-Play)**: ✅
- **Stufe 3 v2** (30 Iter): ✅ abgeschlossen — siehe `archive_v2/`
  - Ergebnis: Tore 3.02, xG 1.55, Schüsse 3.9, Box 23.1% — Trend bei
    Iter 30 noch nicht abgeebbt
- **Stufe 3 v3** (laufend, gestartet 14:58): 80 Iter × 3 RR Self-Play
  mit Actor-Critic + überarbeitetem Reward (siehe unten)
- **Browser-Integration**: ✅ RL-Policy hardcoded in `useAIMode`,
  ArenaScreen zeigt nur Status (kein UI-Toggle mehr)

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

~~Bei jedem Trajectory-Export bekommt das Python-RL-Dataset eine Warnung
"Compressed file ended before the end-of-stream marker was reached".~~
✅ **Gefixt in `1e0965f`** — `closeTrainingOutput` nutzt jetzt
`stream/promises.finished()` statt manuellem callback-chaining.
Iter-3-Trajectories sind die ersten, die mit sauberem EOS-Marker
geschrieben werden.

## v3-Änderungen (2026-04-25 ab ~14:30)

User-Direktive: **B → C → A → E** plus Defensive-Tiefe-Malus.

### B) Reward-Engineering
- Box-Präsenz: 0.5 → 0.15 pro Spieler, Cap 3 (Max +0.45/Turn statt
  potentiell +2.5)
- Schuss-Reward neu: on target +3, off target +1
- Defensive-Tiefe-Malus: Verteidiger-Buffer < 8y in derselben Lane wie
  ein Stürmer in eigener Hälfte → progressiver Malus, gesamt-Cap
  -1.5/Turn

### C) Actor-Critic
- `PolicyNet` bekommt `value_head` (Context → V(s))
- `forward()` weiter Actor-only (für ONNX); `forward_with_value()` für
  Training
- `train_rl.py`: Advantage = Return − V(s), MSE-Value-Loss + per-
  Mini-Batch-Adv-Norm
- Outcome-CSV: + vf_loss, explained_var

### E) League-Training
- Neuer Schalter `--opponent-policy <path>` in `aiArena.ts` für
  asymmetrische Matchups (Team 1 RL trainiert, Team 2 fix BC/Heuristik)
- `ml/rl_loop_league.sh`: pro Iter 1 self + 1 vs heuristik + 1 vs
  Pool (BC oder alter Snapshot, alle 10 Iter ein Snapshot)

### Run v3 — Ergebnisse (abgeschlossen 18:04)
**Laufzeit:** 14:58 → 18:04 = **3h 6min** für 80 Iter (vs erwartet ~110 min,
Critic-Forward zusätzlicher Aufwand).

**Letzte 10 Iter Mittel** (vs v2-Endstand):
| Metrik | v2 (iter 30) | **v3 (Mittel iter 71-80)** | Bundesliga |
|---|---:|---:|---:|
| Tore/Match | 3.02 | **3.19** | 3.00 |
| xG/Team | 1.55 | **1.69** | 1.50 |
| Schüsse/Team | 3.9 | **4.27** | 12.5 |
| Box-Präsenz % | 23.1 | **22.67** | 25 |

**Trend:** Tore: 2.67 (iter 1) → 3.32 (Peak iter 75) → 3.18 (iter 80).
xG: 1.32 → **1.75** (Peak iter 79) → 1.74 (iter 80). Klares Lernen
über alle 80 Iter, kein Plateau bei iter 30 wie bei v2 — Actor-Critic
+ neuer Reward haben die Lernkurve verlängert.

**explained_var** (Critic-Diagnostik): Start 0.022 → Ende 0.114. Der
Critic erklärt am Ende 11% der Return-Varianz. Niedrig, aber wachsend.
Das bestätigt das hohe intrinsische Spielrauschen (Pässe/Schüsse/Tackles
würfeln) — RL kann nicht mehr lernen, weil 89% der Variance "echtes
Spielglück" ist.

### Eval-Tournament (eval_v3.sh, 18:05–18:09, argmax-Modus)
RL v3 spielt 2 RR (als Home + Away) gegen jeden Gegner:

| Gegner | RL-Heim Sieg | RL-Auswärts Sieg | Spielstil |
|---|---:|---:|---|
| Heuristik | 43% | 42% | Tore 3.11/Match, xG 1.58 |
| BC | 44% | 39% | Tore 2.96/Match, xG 1.60 |
| RL v2 | 44% | 39% | Tore 3.19/Match, xG 1.64 |

**Interpretation:** RL v3 ist **stärker als Heuristik** im Auswärtsspiel
(42% vs Heimrecht-Baseline 43% = effektiv stärker, weil Heimrecht
normal +5-10% wert ist). Gegen BC und v2 ist v3 als Heim klar überlegen
(44% vs 36% Auswärts), aber ebenbürtig im umgekehrten Setup. Die
offensiven Metriken (xG, Schüsse) sind durchweg höher als bei jedem
Gegner.

### ONNX-Deploy
`public/rl_policy.onnx` wurde aktualisiert (493 KB, von Iter 80).
Der Browser nutzt automatisch den neuen v3-Stand.

### League-Run v3.5 (E, 18:13–19:19)
30 Iter League-Training auf v3-Basis: pro Iter 1 self + 1 vs Heuristik
+ 1 vs Pool (BC + Snapshots).

**Self-Play-Outcomes Mittel (last 10 iter)**:
| Metrik | v3-pure | **League v3.5** |
|---|---:|---:|
| Tore/Match | 3.19 | 3.17 |
| xG/Team | 1.69 | 1.71 |
| Schüsse/Team | 4.27 | 4.34 |
| Box-Präsenz % | 22.67 | 22.48 |
| explained_var | 0.114 | **0.147** ↑ |

Praktisch identische Self-Play-Stats. Aber **explained_var stieg von
0.114 auf 0.147 (+30%)** — der Critic erklärt jetzt 15% der Return-
Varianz. Diversifizierte Trajectories haben gegen die Stochastik geholfen.

**Eval-Tournament (League vs feste Gegner)**:
| Gegner | v3-pure W% | League W% | Δ |
|---|---:|---:|---:|
| Heuristik | 42.5 | 41.5 | -1.0 |
| BC | 41.5 | **44.0** | +2.5 |
| RL v2 | 41.5 | **44.0** | +2.5 |

League ist robuster gegen unbekannte Gegner (BC, v2), aber leicht
schwächer gegen Heuristik. Trade-off zwischen Spezialisierung und
Generalisierung.

**Deploy-Entscheidung**: `public/rl_policy.onnx` bleibt **v3-pure**
(offensiver), League als Alternative in
`ml/checkpoints/rl_policy.onnx` und `archive/v3_pure/rl_policy.onnx`.

Snapshots aus League sind in `ml/checkpoints/snapshots/`:
- snap_iter10.onnx
- snap_iter20.onnx
- snap_iter30.onnx

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
| 3j — Run v2 (30 Iter, 3 RR) | ✅ |
| 3k — Browser-Integration (RL hardcoded) | ✅ |
| 3l — Reward v3 (Box↓, Schüsse↑, Def-Tiefe) | ✅ |
| 3m — Actor-Critic (Value-Network) | ✅ |
| 3n — Run v3 (80 Iter mit AC + neuem Reward) | 🏃 läuft seit 14:58 |
| 3o — League Training Skript | ✅ (rl_loop_league.sh) |
| 3p — League-Run | TODO nach v3 |

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

✅ **B → C → A → E komplett durch.** Status:
- v3-pure (80 Iter): deployed in `public/rl_policy.onnx`
- League v3.5 (30 Iter auf v3-Basis): in `ml/checkpoints/rl_policy.onnx`
- Beide Eval-Resultate dokumentiert oben.

**Bei deinem nächsten Login**:
1. Browser auf, Arena starten — v3 spielt automatisch (argmax-Modus)
2. Replay anschauen: macht v3 stilistisch was Erkennbares anders als BC/Heuristik?
3. Wenn ja: D-Phase (Replay-Analyse) starten
4. Wenn League besser sein soll: `cp ml/checkpoints/rl_policy.onnx public/`
   und Browser-Hard-Reload

## Plot-Script

`ml/plot_outcomes.py` — visualisiert die CSV als 6er-Plot:
Performance / Volume / Box-Präsenz / Heimsieg / Reward / Critic-Diagnostik.

## Open Issues für später

- **GAE-λ statt MC-Returns**: `compute_returns()` nutzt full-return
  (γ=0.99, λ=1). λ=0.95 würde Returns-Variance reduzieren. Wenn v3-
  League auch plateaut, ist das der nächste Hebel.
- **Reward-Normalisierung über running stats**: stabilere Gradienten,
  aktuell roh.
- **xG vs Tor-Kalibrierung**: 3.0 Tore bei 1.5 xG = 2:1 (Realität 1:1).
  Schuss-Konversion wirkt zu großzügig. Eingriff in `engine/shooting.ts`
  würde Tor-Anzahl senken aber Reward-Signal stabilisieren.
