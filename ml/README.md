# TIKITAQ ML — Behavior Cloning Pipeline

Python-Projekt, das ein neuronales Netz trainiert, welches die Heuristik-
KI von TIKITAQ nachahmt (Behavior Cloning). Wird später zum Sprungbrett
für Reinforcement Learning (Self-Play / League Training).

## Architektur

```
Round-Robin-Arena (TS)         →  JSONL.gz (State-Action-Paare)
                                  │
                                  ▼
                          dataset.py  (Streaming-Reader)
                                  │
                                  ▼
                         features.py  (State → Tensor)
                                  │
                                  ▼
                           model.py  (Option-basiertes MLP)
                                  │
                                  ▼
                        train_bc.py  (Cross-Entropy-Training)
                                  │
                                  ▼
                     checkpoints/bc_latest.pt
                                  │
                                  ▼
                       export_onnx.py  →  bc_policy.onnx  →  Browser
```

Das Netz ist **option-basiert**: pro State-Option-Paar gibt es einen Score,
der Zug mit dem höchsten Score gewinnt. Damit ist die Policy variabel in
der Anzahl Optionen (8-16 je Situation) und kompatibel mit der bestehenden
`BallOption`-Struktur in TypeScript.

## Setup

```bash
cd ml/
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Python 3.11 oder 3.12 empfohlen (torch-Binaries sind dafür vorgebaut auf macOS).

## Trainings-Daten erzeugen

Aus dem Projekt-Root:

```bash
# Ein Round Robin → 22 MB (gzip) in ~32 s
npx tsx scripts/aiArena.ts --roundrobin --export-training ml/datasets/run01.jsonl.gz

# Für ein solides BC-Training 10-50 Round Robins sammeln:
for i in {1..10}; do
  npx tsx scripts/aiArena.ts --roundrobin --export-training "ml/datasets/run${i}.jsonl.gz"
done
```

Richtwerte:
| Anzahl RRs | Datei-Summe (gzip) | Samples | Trainings-Eignung |
|---|---:|---:|---|
| 1 | 22 MB | 23k | nur Debug |
| 10 | 220 MB | 230k | BC Proof-of-Concept |
| 50 | 1.1 GB | 1.1M | solides BC-Modell |
| 100 | 2.2 GB | 2.3M | Top-Qualität, Diversifizierung |

## Training starten

```bash
cd ml/
source .venv/bin/activate

# Kleiner Probelauf
python train_bc.py --data datasets/run01.jsonl.gz --epochs 5 --batch-size 256

# Full run (10 RRs, 10 Epochen)
python train_bc.py --data datasets/run*.jsonl.gz --epochs 10

# Mit Tensorboard beobachten
tensorboard --logdir runs/
```

Richtwerte pro Epoche (M1 Mac, CPU):
- 230k Samples → 3-5 Min
- 1.1M Samples → 15-20 Min

Erwartete Zielwerte:
- **Top-1 Accuracy 50-65 %** nach 5-10 Epochen (Heuristik-Nachahmung)
- **Top-3 Accuracy 80-90 %** (die 3 „guten" Optionen werden meist richtig erkannt)

## Evaluation

```bash
python evaluate_bc.py --checkpoint checkpoints/bc_latest.pt --data datasets/run01.jsonl.gz
```

Liefert Top-1/Top-3 Accuracy und Per-Option-Typ-Breakdown (wo stimmt das
Netz besser überein — Schüsse, Pässe, Dribblings?).

## ONNX-Export für Browser-Inferenz

```bash
python export_onnx.py --checkpoint checkpoints/bc_latest.pt --out bc_policy.onnx
```

Typische ONNX-Dateigröße: 1-3 MB (abhängig von Netz-Dimensionen). Für den
Browser wird sie dann mit `onnxruntime-web` geladen:

```ts
import * as ort from 'onnxruntime-web'
const session = await ort.InferenceSession.create('/bc_policy.onnx')
const result = await session.run({ global, options, mask })
```

Die Integration in die TypeScript-KI ist ein separater Schritt (kommt
nach dem ersten erfolgreichen Training).

## Roadmap

| Phase | Status | Beschreibung |
|---|---|---|
| 0 | ✅ ready | Setup + Dataset-Pipeline + BC-Training |
| 1 | TODO | Erste BC-Runs, Accuracy-Baseline messen |
| 2 | TODO | ONNX-Integration in TS-Arena, A/B vs Heuristik |
| 3 | future | PPO-basiertes RL-Finetune gegen BC-Checkpoint |
| 4 | future | League Training (Pool aus 3-5 Checkpoints) |

## Design-Entscheidungen

**Warum flache Features statt Grid-CNN?**
Pragmatisch. Mit ~280 globalen Features + 14 pro Option haben wir < 1000
Dimensionen, das läuft auch ohne spezialisierte Architekturen. Wenn BC
schlecht performt, upgraden wir auf Grid-Encoding (Spieler-Positionen als
Dichte-Map) oder Set-Transformer.

**Warum option-basiert statt kategoriale Policy?**
Die Anzahl der Optionen ist zustandsabhängig (8-16). Eine kategoriale
Policy müsste in einen festen Aktionsraum diskretisieren (z.B. 100 Pass-
Ziele × 8 Pass-Typen). Das verliert Präzision. Die option-basierte Policy
nimmt die bereits vom Heuristik-Evaluator generierten Kandidaten und
bewertet _welchen davon_ zu nehmen — genau wie die Original-KI.

**Warum Behavior Cloning vor RL?**
1. RL ohne Vortraining erfordert zufällige Exploration — unser Spiel ist
   zu komplex für Tabula-Rasa.
2. BC gibt uns ein funktionierendes Netz in ~1 Woche Arbeit.
3. AlphaStar, OpenAI Five, etc. haben alle so begonnen.

## Dateistruktur

```
ml/
├── README.md              (diese Datei)
├── requirements.txt
├── .gitignore             (datasets/, checkpoints/, .venv/ etc.)
├── dataset.py             (JSONL.gz → PyTorch Dataset)
├── features.py            (State → Tensor)
├── model.py               (PolicyNet-Klasse)
├── train_bc.py            (Training-Loop)
├── evaluate_bc.py         (Test-Metriken)
├── export_onnx.py         (ONNX-Export)
├── datasets/              (ignoriert, hier landen .jsonl.gz)
├── checkpoints/           (ignoriert, hier landen .pt)
└── runs/                  (ignoriert, Tensorboard-Logs)
```
