# TIKITAQ — Session-Stand (2026-04-25, 01:10 Uhr)

> Lebendes Protokoll der aktuellen Chat-Sitzung. Nach einem Chat-Crash hier
> einsteigen: Abschnitt **"Wo wir stehen"** lesen, dann **"Offen"** für den
> nächsten Schritt, dann den relevanten Punkt unter **"Änderungen heute"**
> für Kontext.

## Wo wir stehen

- Branch: `dev` bei **`8abf688`**, gepusht zu `origin/dev`.
- **Stufe 1 (Heuristik)**: abgeschlossen, 14 Iterationen in zwei Tagen.
- **Stufe 2 (Behavior Cloning)**: Python-Pipeline komplett + Test-Lauf
  mit 10 RRs erfolgreich: **75.3 % Top-1 / 95.6 % Top-3**.
- **Stufe 3 Vorarbeit**: ONNX-Inferenz in TS-Arena + xG-Modul gebaut,
  `--bc-policy <path>` Flag für Arena-CLI.
- **Aktuell läuft**: overnight D-Run (300 RRs neue + 47 bereits vorhanden
  = 347 total, 10 Epochen, ~7.7 h). Start: 01:07 Uhr, Ende erwartet ~08:45.

## Fortschritt heute (2026-04-25 Nacht-Session)

### Stufe 3 Vorarbeit — parallel zum D-Run gebaut

Drei neue Module in einem Commit (8abf688):

**1. xG-Modul** (`src/engine/xg.ts`):
- Positions-basierte Tor-Wahrscheinlichkeit (Distanz × Winkel × Korridor-
  Block × TW-Position)
- Sanity-Check bestanden: 5m zentral → 0.42, 16er-Rand → 0.10,
  Mittelfeld → 0.02
- `xgDelta()` für späteres Reward-Shaping

**2. ONNX-Policy-Adapter** (`src/engine/ai/policy/`):
- `features.ts` — 1:1-Spiegel von `ml/features.py`
- `onnxPolicy.ts` — onnxruntime-node-Loader
- `override.ts` — sync-async Bridge für decideBallAction

**3. `runAIMatch` wird async:**
- Neuer `onBeforeAITurn`-Hook für Policy-Inferenz vor jedem Zug
- Alle Scripts angepasst (await)
- Arena-CLI neue Flags: `--bc-policy <path>` + `--bc-team <1|2>`

### Smoke-Test erfolgreich

```
npx tsx scripts/aiArena.ts --home 0 --away 1 --runs 1 \
  --bc-policy ml/checkpoints/bc_policy.onnx
→ MUC 1:2 DOR, 157 ms, beide Teams BC-Policy, realistische Stats
```

### Reward-Funktion definiert (REWARD.md, Commit 858994b)

User-Interview mit 5 Fragen beantwortet. Kernpunkte:
- Alle Reward-Komponenten sind **team-identity-sensitiv** (confidence)
- Ballverlust zonen-abhängig
- Führungs-Verhalten dynamisch mit Confidence
- Zwischenziele (Ecken, Tackles, Fouls) stark belohnt
- Defense im 16er: situativ

### Bug: Async-Umbau hat laufenden D-Run gebrochen

Der frühere D-Run wurde durch den runAIMatch-Signature-Wechsel
(sync → async) unterbrochen bei Run 47. **47 Datasets konnten gerettet
werden** — leere Fail-Dateien wurden gelöscht. Overnight neu gestartet
um 01:07, erkennt die 47 existierenden und zählt ab 48 weiter.

## Aktueller overnight D-Run (Status-Snapshot)

- Start: 2026-04-25 01:07
- Parameter: 300 neue RRs, 10 Epochen Training
- Gesamt nach Ende: 347 RRs = ~7.6 GB gzip
- Monitor läuft persistent mit **10-min-Heartbeat** + Meilenstein-Events
- Erwartetes Ende: ~08:45 morgen
- Erwartete Top-1 Accuracy: ~82–85 %

Status-Checks möglich via:
```bash
tail -f ~/Documents/tikitaq/ml/overnight.log
ls ~/Documents/tikitaq/ml/datasets/ | wc -l
```

## Aktuelle Arena-Metriken (Heuristik)

| Metrik | Simuliert | Bundesliga-Ziel |
|---|---:|---:|
| Tore/Match | 2.67–2.82 | 3.00 |
| Heimsieg/Remis/Auswärts | 40-44/18-25/34-42 % | 43/25/32 % |
| Passquote | 88.6 % | 82 % |
| Elfmeter-Anteil | 13.4 % | 10 % |
| Corner-Conversion | ~2.5 % | 3-5 % |

Tor-Verteilung ausgewogen: Flanke 31 %, Kurzpass 26 %, Steilpass 23 %,
Langer Ball 14 %, Solo 7 %, Elfmeter 13 %.

## Roadmap

| Phase | Status | Beschreibung |
|---|---|---|
| **1 — Heuristik** | ✅ | 5-Schicht-KI, alle strukturellen Fixes |
| **2 — Behavior Cloning** | 🏃 läuft | Python-Pipeline + BC-Training (D-Run) |
| 3a — ONNX-Integration TS | ✅ | Bereit, Code gepusht |
| 3b — Reward-Definition | ✅ | REWARD.md |
| 3c — xG-Modul | ✅ | xgFromPosition + xgDelta |
| 4 — A/B BC vs Heuristik | TODO | nach D-Run |
| 5 — RL-Trajectory-Format | TODO | reward/done/log_prob in JSONL |
| 6 — PPO-Training | TODO | Python stable-baselines3 |
| 7 — League Training | TODO | Pool aus 3-5 Checkpoints |

## Performance-Benchmark (M1 MacBook Air, 8 GB RAM)

| Aufgabe | Zeit | Disk | RAM Peak |
|---|---:|---:|---:|
| 1 RR mit JSONL-gzip | 32 s | 22 MB | 350 MB |
| 10 RRs + 5 Epochen BC | 11.5 min | 227 MB | 350 MB |
| 300 RRs + 10 Epochen BC | ~7.5 h | 6.6 GB | 2-3 GB |
| BC-Policy Match-Inferenz | 157 ms / Match | — | — |

## Änderungen heute (neueste zuerst)

Alle Commits auf `dev`, gepusht zu `origin/dev`:

- **`8abf688`** — feat(ml): ONNX-Inferenz-Pipeline + xG-Modul + async
  runAIMatch. 14 files changed, +884 LOC.
- **`858994b`** — docs(ml): Reward-Funktion Design für Stufe 3.
- **`2b4e4df`** — docs: BC-Pipeline fertig, D-Run läuft.
- **`9712373`** — feat(ml): Streaming-Dataset + Overnight-Orchestrierung.
- **`b3cff1e`** — feat(ml): Python-Projekt für Behavior-Cloning.
- **`ecacc8d`** — feat(arena): gzip-Kompression für Training-Export.
- **`d8045b7`** — feat(engine): Corner-Pass in Box = direkter Kopfball.
- **`25ebbde`** — feat(ai): mehr Grundlinien-Präsenz + Ecken-Verwertung.
- **`5bf51d3`** — feat(engine): sechs neue Ecken-Quellen +
  Emergency-Clearance.

## Arbeitsumgebung

- Repo: `~/Documents/tikitaq`.
- Remote: `https://github.com/michmonhh/tikitaq.git`, Branch `dev`.
- Main-Branch unverändert seit 18. April.
- Dev-Server: `npm run dev` auf http://localhost:5173/
- Arena-CLI: `npx tsx scripts/aiArena.ts --roundrobin`
- Arena mit BC-Policy: `... --bc-policy ml/checkpoints/bc_policy.onnx`
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

## Nächster konkreter Schritt

Morgen nach dem D-Run:
1. Eval-Metriken prüfen (erwartet Top-1 ~82-85 %)
2. A/B-Vergleich: `--bc-policy` vs Heuristik in Round-Robin
3. Wenn BC ≥ 95 % Heuristik-Qualität: weiter zu RL
4. RL-Trajectory-Format bauen (reward/done/log_prob)
5. Reward-Tracker in GameState einbauen (`xgDelta` + team-confidence)
6. Python PPO-Setup (stable-baselines3)
