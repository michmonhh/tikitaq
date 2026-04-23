# TIKITAQ — Session-Stand (2026-04-22)

> Lebendes Protokoll der aktuellen Chat-Sitzung. Nach einem Chat-Crash hier
> einsteigen: Abschnitt **"Wo wir stehen"** lesen, dann **"Offen"** für den
> nächsten Schritt, dann den relevanten Punkt unter **"Änderungen heute"**
> für Kontext.

## Wo wir stehen

- Branch: `dev` bei **`32c3557`** (lokal, noch NICHT gepusht).
- Arena-CLI: `npx tsx scripts/aiArena.ts --roundrobin` läuft 306 Matches in
  ~25 s und gibt am Ende eine Bundesliga-Vergleichstabelle + Tor-Typen aus.
- Neu: `--export-training <file>` schreibt State-Action-Paare als JSONL.
- Replay-Viewer im Browser (Arena → Match simulieren → "Replay anschauen")
  nutzt 1:1 die Match-Renderer. Team-Farben, Tor-Overlay, Geschwindigkeits-
  regler 30 % / 50 % / 1× / 2× / 4× alle funktional.

## Architektur der KI (Stand Stufe 4)

Vier Schichten arbeiten zusammen:

1. **TeamPlan** (`ai/teamPlan.ts`) — Spielphasen-Strategie (riskAppetite,
   Attack/Defense). Wird alle 22.5 min überprüft.
2. **MatchIntent** (`ai/matchIntent.ts`, NEU) — Angriffsachse (left/center/
   right) über 3–5 Züge kohärent gehalten. GOAP-light.
3. **PlayerDecision mit T=2 Lookahead** (`ai/playerDecision.ts` +
   `playerDecision/lookahead.ts`) — Ballführer-Optionen mit 1-Zug-
   Minimax + Mitspieler- und Gegner-Antizipation.
4. **Positioning** (`ai/positioning/*`) — pro Turn, reagiert auf
   MatchIntent via `getIntentPositionShift`.

Plus: FieldReading (pro Turn), MatchMemory (pro Match), Confidence
(per-Spieler dynamisch).

## Aktuelle Arena-Metriken (306 Matches, Commit 32c3557)

| Metrik | Simuliert | Bundesliga-Ziel |
|---|---:|---:|
| Tore/Match | **2.57** | 3.00 |
| Heimsieg/Remis/Auswärts | **37 / 25 / 38 %** | 43 / 25 / 32 % |
| xG/Team | ~1.0 | 1.50 |
| Passquote | **84.7 %** ✓ | 82 % |
| Schüsse/Team | 2.2 | 12.5 |
| Pässe/Team | 35 | 450 |
| Gelbe / Rote Karten | 1.0 / 0.01 | 1.8 / 0.05 |
| Eckbälle/Team | 0.7 | 4.5 |
| **Elfmeter-Anteil an Toren** | **23 %** | 10 % |
| **Steilpass-Anteil an Open-Play** | **60 %** | ~15 % |
| **Flanken-Anteil an Open-Play** | **6.9 %** | 18 % |

Passquote, Remis-Quote im Bundesliga-Band. Heim/Remis/Auswärts-Split je
nach Stufe-4-Run 37–43/20–25/33–40 (Varianz mit Intent-Fixierung). Tor-
und Schussraten strukturell gedeckelt durch 1 Aktion/Team/Turn.

## ML-Readiness: Training-Data-Export

Neu mit Stufe 4: Arena kann jede Entscheidung als JSONL speichern:

```bash
npx tsx scripts/aiArena.ts --roundrobin --export-training matches.jsonl
```

Pro Zeile: match_id, turn, team, carrier, teammates, opponents, ball,
intent, options (alle mit score/successChance/reward/target), und
chosen_option_index. Ein Round-Robin produziert ~22k Entscheidungen.

Python-Einlesebeispiel:

```python
import json
with open('matches.jsonl') as f:
    records = [json.loads(line) for line in f]
# Features: state (carrier + 10 teammates + 11 opponents + ball)
# Labels: chosen_option_index
# → Behavior-Cloning oder Policy-Distillation
```

Damit ist die ML-Fallback-Option etabliert, die der User explizit wollte.

## Offen — Priorität absteigend

1. **Torrate unter Ziel (2.57 vs 3.00).** Strukturell begrenzt durch
   1 Aktion/Team/Turn. Weitere KI-Tuning-Schritte haben marginale
   Rendite. Hebel: Schuss-Conversion-Boost (Box-Schüsse Saves drücken),
   Mehr Situationen in denen geschossen wird (anders als Through-Ball).
2. **Steilpass-Anteil 60 % (Ziel ~15 %).** Trotz Through-Ball-Defense-
   Fix von Stage-0 noch dominant, weil absolute Schusszahl strukturell
   niedrig ist. Intent-Shift zum Zentrum beim Flankenziel könnte helfen.
3. **Heimsieg-Quote 37 % (Ziel 43 %).** Nach Stufe 4 unter Ziel. Run-zu-
   Run-Varianz hoch (37–43 %). Mehrere Runs mitteln, evtl. Intent-Malus
   für Gegen-Richtung von -4 auf -2 senken, damit situative Option-
   Auswahl nicht zu stark unterdrückt wird.
4. **Echte T=3 Alpha-Beta-Suche** statt unseres pragmatischen "T=2 mit
   Gegner-Shift". Würde echten Verzweigungsraum durchsuchen inklusive
   mehrerer Gegnerantwort-Kandidaten. Nächster Schritt falls die
   Qualität noch höher muss.
5. **Vollwertige GOAP-Pläne** (nicht nur Angriffsachse, sondern
   Aktionskette `Pass → Flanke → Kopfball` als deklarativer Plan).
   Deutlich komplexer, aber der echte Schritt Richtung "Spielzug zu
   Ende denken".
6. **ML-Trainings-Pipeline** (Python): Baseline aufsetzen, das
   Behavior-Cloning auf den exportierten JSONL-Datensätzen. ONNX-Export
   für Browser-Inferenz via `onnxruntime-web`.

## Änderungen heute (chronologisch, neueste zuerst)

Alle commits sind auf `dev`:

- **`32c3557`** — feat(ai): ML-readiness — State-Action-Paare als JSONL
  exportieren. `training.ts` browser-kompatibel (nur Puffer), Arena-CLI
  schreibt per fs. `--export-training <file>` als Flag.
- **`0945c12`** — feat(ai): Stufe-4-MatchIntent — GOAP-light Team-Absicht
  über mehrere Züge. Angriffsachse (left/center/right) für 4 Turns
  stabil; Pass- und Positionierungs-Bonusse darauf ausgerichtet.
- **`8a5a954`** — feat(ai): Stufe-3-Lookahead — Mitspieler- und Gegner-
  Antizipation. Stürmer ziehen im Simulator in die Box bei Flankensit.,
  nächste Gegner rücken Richtung neuen Ballbesitzer.
- **`dc483bf`** — feat(ai): 1-Zug-Lookahead für Ballführer (Stufe 1 von
  Minimax-Ausbau). Light-Clone-Simulator, 14-Option-Lookahead pro Zug,
  LOOKAHEAD_WEIGHT=0.15 als Tiebreaker.
- **`a7c1cb1`** — docs: session status update (pre-Minimax-Ausbau).
- **`6ffb724`** — tune(tackle): penalty foul rate 0.5× → 0.35×.
- **`9e3f095`** — tune(ai): wings run to byline + strikers pull into
  box for crosses.
- **`6b6b62f`** — fix(passing): through-balls can be intercepted +
  ground/high split.
- **`5bf16b5`** — tune(tackle): foul in box 1.5× → 0.5×.
- **`91e7921`** — fix(arena): preserve set-piece phase across turn
  boundary.

## Erkenntnisse aus diesem Tiefbau

Wir haben in dieser Sitzung vier KI-Schichten aufgebaut (Stufen 1–4) und
gelernt:

1. **Lookahead-Simulatoren müssen Mitspieler-Positioning simulieren.**
   Stufe 1 allein war zu grob (nur Ballträger wird bewegt). Stufe 3
   musste Stürmer in die Box schieben, damit Flanken-Lookahead Sinn
   ergibt.
2. **Heuristik-Bonusse sind komplementär, nicht redundant.** Stufe 2
   (Halbierung) hat Tore verringert — die Bonusse decken Bereiche ab,
   die der Lookahead strukturell nicht sehen kann (z. B. „ST in
   der Box bei Flanken", weil der Simulator das nicht positioniert).
3. **Strukturelle Limits dominieren.** 1 Aktion/Team/Turn × 180 Turns
   gibt ~2.5 Schüsse/Team. Jede KI-Verbesserung kann das absolute
   Torvolumen nur marginal erhöhen; der Hebel liegt bei Entscheidungs-
   qualität pro Zug (Conversion), nicht bei Entscheidungsmenge.
4. **GOAP-light (Stufe 4) bringt qualitatives Verhalten.** Heimsieg-
   Quote nähert sich dem Bundesliga-Band, Flanken-Nutzung steigt. Das
   ist der erwartbare Effekt kollektiver Muster gegenüber isolierter
   Einzelentscheidungen.

## Arbeitsumgebung

- Repo: `~/Documents/tikitaq`.
- Remote: `https://github.com/michmonhh/tikitaq.git`, Branch `dev`.
- Main-Branch (`origin/main`) unverändert seit 18. April — bewusst nicht
  pushen damit Cloudflare nichts auto-deployt.
- Dev-Server: `npm run dev` auf http://localhost:5173/
- Arena-CLI: `npx tsx scripts/aiArena.ts --roundrobin`
- Training-Export: `npx tsx scripts/aiArena.ts --roundrobin --export-training out.jsonl`

## Nächster konkreter Schritt

Push nach `origin/dev` (5 neue Commits lokal). Dann User-Replay-
Verifikation: Wirken die Stufen im Live-Spiel? Hat die KI sichtbare
Muster (Links-Angriff über mehrere Züge statt Zufalls-Richtung)?

Falls qualitativ noch nicht ausreichend: Python-ML-Baseline aufsetzen
(Offline-Skript liest das JSONL, trainiert ein einfaches PyTorch-Policy-
Net, exportiert als ONNX, Browser lädt es per `onnxruntime-web` und
ruft es in der KI-Entscheidung auf). Dann vergleichen wir Arena-Metriken
der Heuristik-KI gegen die gelernte Policy.
