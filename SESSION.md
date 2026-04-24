# TIKITAQ — Session-Stand (2026-04-25)

> Lebendes Protokoll der aktuellen Chat-Sitzung. Nach einem Chat-Crash hier
> einsteigen: Abschnitt **"Wo wir stehen"** lesen, dann **"Offen"** für den
> nächsten Schritt, dann den relevanten Punkt unter **"Änderungen heute"**
> für Kontext.

## Wo wir stehen

- Branch: `dev` bei **`9712373`**, gepusht zu `origin/dev`.
- **Stufe 1 (Heuristik)**: abgeschlossen, 14 Iterationen in zwei Tagen.
- **Stufe 2 (Behavior Cloning)**: Python-Pipeline komplett + erster
  Test-Lauf erfolgreich — **75.3 % Top-1 / 95.6 % Top-3**.
- **Aktuell läuft**: overnight D-Run (300 RRs, 10 Epochen, ~7.5 h) im
  Hintergrund. Log: `ml/overnight.log`.
- **Nächster Schritt**: Reward-Funktion für Stufe 3 definieren, dann
  RL-Infrastruktur bauen.

## Fortschritt heute

### Stufe 2 komplett gebaut

Komplette Python-Pipeline in `ml/`:
- `dataset.py`: Streaming- und In-Memory-Dataset (JSONL.gz → PyTorch)
- `features.py`: State → Tensor (296-dim global, 15-dim per option)
- `model.py`: Option-basiertes PolicyNet (122k Parameter)
- `train_bc.py`: Cross-Entropy-Training mit MPS/GPU-Support
- `evaluate_bc.py`: Top-1/Top-3 Accuracy + Per-Option-Typ-Breakdown
- `export_onnx.py`: PyTorch → ONNX (482 KB Modell)
- `overnight.sh`: Orchestrierung für Nacht-Runs (Gen + Training + Export)
- Streaming-Dataset für >1 GB Daten mit konstantem RAM

### Testlauf verifiziert Pipeline

Kleiner Test (10 RRs, 5 Epochen, ~12 Min):
- val_acc Progression: 0.723 → 0.733 → 0.740 → 0.748
- **Top-1 Final: 0.753 / Top-3 Final: 0.956**
- Per-Typ: shoot 96.7 %, through_ball 89.5 %, advance 88 %,
  short_pass 69 %, dribble 55 %, cross 53 %, long_ball 49 %, hold 37 %

### Bugs gefixt
- `set -o pipefail` + `ls`-Glob-Crash bei leerem Datasets-Verzeichnis
  → `shopt -s nullglob` + array-basierte Zählung

## Aktuelle Arena-Metriken (Heuristik, Basis für BC)

| Metrik | Simuliert | Bundesliga-Ziel |
|---|---:|---:|
| Tore/Match | 2.67–2.82 | 3.00 |
| Heimsieg/Remis/Auswärts | 40-44/18-25/34-42 % | 43/25/32 % |
| Passquote | 88.6 % | 82 % |
| Elfmeter-Anteil | 13.4 % | 10 % |
| Corner-Conversion | ~2.5 % | 3-5 % |

Tor-Verteilung ausgewogen: Flanke 31 %, Kurzpass 26 %, Steilpass 23 %,
Langer Ball 14 %, Solo 7 %, Elfmeter 13 %.

## Aktueller overnight D-Run

Start: nach dem Test-Lauf um 00:29
Parameter: 300 RRs, 10 Epochen
Erwartet: ~7.5 h (Gen 2.7 h + Training 5 h + Export 0.1 h)
Erwartete finale Top-1: ~82-85 %

Status-Check: `tail -f ml/overnight.log`

## Roadmap

| Phase | Status | Beschreibung |
|---|---|---|
| **1 — Heuristik** | ✅ | 5-Schicht-KI, alle strukturellen Fixes |
| **2 — Behavior Cloning** | 🏃 läuft | Python-Pipeline + BC-Training |
| 3 — ONNX-Integration | TODO | BC-Netz als TS-Arena-KI einbinden |
| 4 — A/B-Vergleich | TODO | BC vs Heuristik in der Arena |
| 5 — Reward-Definition | **in Arbeit** | Reward-Funktion für PPO/RL |
| 6 — RL-Infrastruktur | TODO | PPO-Setup, ONNX-Inferenz in TS |
| 7 — RL-Finetune | TODO | Self-Play Gen 1 vs BC-Basis |
| 8 — League Training | TODO | Pool aus 3-5 Checkpoints |

## Performance-Benchmark (M1 MacBook Air, 8 GB RAM)

| Aufgabe | Zeit | Disk | RAM Peak |
|---|---:|---:|---:|
| 1 RR mit JSONL-gzip | 32 s | 22 MB | 350 MB |
| 10 RRs + 5 Epochen BC | 11.5 min | 227 MB | 350 MB |
| 300 RRs + 10 Epochen BC | ~7.5 h | 6.6 GB | 2-3 GB |

## Entscheidungsfragen für Reward-Funktion (Stufe 5)

Parallel zum laufenden BC-Training klären:
- Ballbesitz-Philosophie? (Aufbau vs Umschalt)
- Risikofreude? (Ballverlust tolerieren vs. sicher spielen)
- Tor-Jagd vs Ergebnis-Sichern (bei Führung)
- Gewicht von Nebenkriegsschauplätzen (Ecken, Fouls ziehen)

## Änderungen heute (chronologisch, neueste zuerst)

Alle Commits auf `dev`, gepusht zu `origin/dev`:

- **`9712373`** — feat(ml): Streaming-Dataset + Overnight-Orchestrierung.
  IterableDataset für große Datenmengen (konstanter RAM), overnight.sh
  für autonome Nacht-Runs mit Disk-Space-Check.
- **`b3cff1e`** — feat(ml): Python-Projekt für Behavior-Cloning.
  Komplette Pipeline: Dataset-Loader, Feature-Encoder, PolicyNet,
  Training, Eval, ONNX-Export.
- **`ecacc8d`** — feat(arena): gzip-Kompression für Training-Export.
  192 MB → 22 MB pro Round Robin.
- **`d8045b7`** — feat(engine): Corner-Pass in Box = direkter Kopfball.
  Löst das Turn-Modell-Problem (Gegnerzug zwischen Flanke und Abschluss).
- **`25ebbde`** — feat(ai): Grundlinien-Präsenz + Ecken-Verwertung.
- **`5bf51d3`** — feat(engine): sechs neue Ecken-Quellen +
  Emergency-Clearance.
- **`b1691a8`** — fix(ai): Verteidiger stellen statt zuwerfen im 16er.
- **`12da93c`** — fix(ai): Abwehrkette hält zusammen.
- **`310ac17`** — tune(ai): Antizipation abhängig von Verteidiger-Qualität.
- **`8c5bc3d`** — fix(ai): Verteidiger halten Tiefenpuffer.
- **`2e84759`** — feat(replay): MatchIntent-Debug-Overlay.

## Arbeitsumgebung

- Repo: `~/Documents/tikitaq`.
- Remote: `https://github.com/michmonhh/tikitaq.git`, Branch `dev`.
- Main-Branch unverändert seit 18. April.
- Dev-Server: `npm run dev` auf http://localhost:5173/
- Arena-CLI: `npx tsx scripts/aiArena.ts --roundrobin`
- Training-Export: `--export-training out.jsonl.gz` anhängen
- BC-Training:
  ```bash
  cd ml/
  source .venv/bin/activate
  python train_bc.py --data datasets/run*.jsonl.gz --streaming --epochs 10
  ```
- Overnight-Run:
  ```bash
  caffeinate -i bash ml/overnight.sh 300 10 > ml/overnight.log 2>&1 &
  ```
- Diagnose-Skripte:
  - `scripts/analyzeCornerGoals.ts` — Tore aus Ecken zählen
  - `scripts/analyzeCornerFlow.ts` — Corner-Event-Kette
  - `scripts/testBochumBayern.ts` — Qualitätsdifferenzierung

## Nächster konkreter Schritt

Morgen nach dem D-Run:
1. Eval-Metriken prüfen (erwartet Top-1 ~82-85 %)
2. ONNX-Modell in TS-Arena laden (onnxruntime-node)
3. A/B-Vergleich BC vs Heuristik
4. Reward-Funktion basierend auf User-Antworten definieren
5. RL-Infrastruktur aufsetzen
