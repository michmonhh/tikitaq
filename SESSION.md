# TIKITAQ — Session-Stand (2026-04-24)

> Lebendes Protokoll der aktuellen Chat-Sitzung. Nach einem Chat-Crash hier
> einsteigen: Abschnitt **"Wo wir stehen"** lesen, dann **"Offen"** für den
> nächsten Schritt, dann den relevanten Punkt unter **"Änderungen heute"**
> für Kontext.

## Wo wir stehen

- Branch: `dev` bei **`ecacc8d`**, gepusht zu `origin/dev`.
- Arena-CLI: `npx tsx scripts/aiArena.ts --roundrobin` läuft 306 Matches
  in ~32 s. Ohne Export-Flag noch schneller (~25 s, keine Disk I/O).
- **Training-Export** mit gzip: `--export-training out.jsonl.gz` schreibt
  alle State-Action-Paare in komprimiertes JSONL (192 MB → 22 MB).
- Replay-Viewer im Browser zeigt Team-Farben, Tor-Overlay, MatchIntent-
  Debug-Chips pro Team, alle Speeds 30 %–4×.

## Architektur-Status (Kernzeile)

Die Heuristik-KI hat **fünf Schichten**:

1. **TeamPlan** (`ai/teamPlan.ts`) — Spielphasen-Strategie, alle 22.5 min Review
2. **MatchIntent** (`ai/matchIntent.ts`) — Angriffsachse left/center/right
   für 3–5 Züge stabil (GOAP-light)
3. **PlayerDecision mit Minimax T=2** (`ai/playerDecision.ts` +
   `playerDecision/lookahead.ts`) — Ballführer-Entscheidung mit 1-Zug-
   Lookahead + Mitspieler-/Gegner-Antizipation
4. **Positioning** (`ai/positioning/*`) — pro Turn, reagiert auf
   MatchIntent, mit Antizipations-Tiefenpuffer bei nahem Stürmer
5. **Training-Data-Export** (`ai/training.ts`) — optional, schreibt
   State-Action-Paare via Arena-CLI

Plus: Corner-Header-Intercept (`stores/gameStore/shared/cornerHeader.ts`)
— Corner-Pass in Box wird als direkter Kopfball-Schuss aufgelöst, kein
Zwischenturn.

## Aktuelle Arena-Metriken (306 Matches, Commit `ecacc8d`)

| Metrik | Simuliert | Bundesliga-Ziel |
|---|---:|---:|
| Tore/Match | **2.67–2.82** | 3.00 |
| Heimsieg / Remis / Auswärts | **40-44 / 18-25 / 34-42 %** | 43 / 25 / 32 % |
| xG/Team | ~1.2 | 1.50 |
| Passquote | **88.4 %** | 82 % |
| Schüsse/Team | 3.2 | 12.5 |
| Pässe/Team | 33 | 450 |
| Gelbe / Rote Karten | 0.9 / 0.005 | 1.8 / 0.05 |
| Eckbälle/Team | 1.0 | 4.5 |
| **Elfmeter-Anteil an Toren** | **13.4 %** | 10 % |
| **Corner-Conversion** | **~2.5 %** | 3-5 % |

Tor-Verteilung (Open-Play) — **fußballerisch plausibel**:
- Flanke 30.8 % (inkl. Corner-Header)
- Kurzpass 26.0 %
- Steilpass 22.6 %
- Langer Ball 13.7 %
- Alleingang 7.0 %

Qualitätsdifferenzierung verifiziert: **Bayern vs Bochum 200 Matches**:
- Bayern 86 / 10 / 4 % (Siege/Remis/Niederlagen), 3.03 Tore/Match
- Bochum 4 / 10 / 86 %, 0.58 Tore/Match

## Strukturelle Limits (nicht mit Heuristik lösbar)

| Metrik | Problem |
|---|---|
| Schüsse 3.2 vs 12.5 | 1 Aktion/Team/Turn × 180 Turns = karges Schuss-Volumen |
| Pässe 33 vs 450 | dasselbe |
| Ecken 1.0 vs 4.5 | zu wenig Ball-Traffic an der Grundlinie |
| Corner-Anteil an Toren | Conversion gut, aber absolute Ecken-Zahl niedrig |

## ML-Readiness: gemessen

| Runs | Zeit | gzip-Datei | Entscheidungen |
|---|---:|---:|---:|
| 1 RR | 32 s | 22 MB | 23k |
| 10 RRs | 5.5 min | 220 MB | 230k |
| 50 RRs | 27 min | 1.1 GB | 1.1M |
| 100 RRs | 55 min | 2.2 GB | 2.3M |

**RAM Peak**: 348 MB mit gzip, ~170 MB ohne. Beides problemlos.

Nutzung:
```bash
npx tsx scripts/aiArena.ts --roundrobin --export-training out.jsonl.gz
# oder SSD-Pfad: /Volumes/<Name>/tikitaq-run01.jsonl.gz
```

## Planned ML-Roadmap (User-Entscheidung)

Der User hat ausdrücklich bestätigt: Heuristik erst ausreizen, dann ML.
Fictitious Self-Play / League Training als Ziel:

1. **Phase 0**: BC-Vortraining auf Heuristik-Daten (Netz lernt aktuelle
   KI nachzuahmen) — 1 Woche Setup + Training
2. **Phase 1**: RL-Gen-1 vs BC-Basis, sucht Exploits — 1–2 Tage
3. **Phase 2**: Exploit-Analyse → Engine/Heuristik-Fix → Gen-2 vs Gen-1
4. **Phase 3+**: League — Pool aus 3–5 Checkpoints

Der User startet Phase 0 wenn die Heuristik sich "grundsolide anfühlt".

## Offen — Priorität absteigend

1. **User-Verifikation im Replay**: fühlen sich die Änderungen (Corner-
   Header, Grundlinien-Präsenz, Stellen-im-16er) flüssig an?
2. **Python-Projekt-Skelett** für BC-Training setup (wenn User freigibt)
3. **Externe SSD-Pfad** vom User liefern, falls er große Trainings-Runs
   will (ab ~50 RRs aufwärts)
4. **Structural caps** akzeptieren (Schüsse, Pässe, Ecken-Anzahl). Diese
   würde nur ein Turn-Modell-Umbau lösen.

## Änderungen heute (chronologisch, neueste zuerst)

Alle Commits auf `dev`, gepusht zu `origin/dev`:

- **`ecacc8d`** — feat(arena): gzip-Kompression für Training-Export.
  192 MB → 22 MB pro Round Robin. Streaming-gzip, sauberer Abschluss.
- **`d8045b7`** — feat(engine): Corner-Pass in Box = direkter Kopfball.
  Löst das Turn-Modell-Problem: Flankenankunft und Abschluss im selben
  Zug, kein Gegnerzug dazwischen. Corner-Conversion 1.2 % → 2.5 %,
  Corner-Tore 7 → ~12-21 pro Round Robin.
- **`25ebbde`** — feat(ai): Grundlinien-Präsenz + Ecken-Verwertung.
  Stürmer-yFloor 35→28, Stürmer-in-Box auch bei zentralem Ballbesitz,
  LM/RM aggressiver Grundlinienlauf, Ecken-Taker +25 für Flanke,
  Corner-Cooldown-Schuss-Bonus.
- **`5bf51d3`** — feat(engine): sechs neue Ecken-Quellen. Tackle nahe
  Grundlinie, geblockter Schuss, abgefälschte Flanke, TW-Faust-Parade,
  Pass-Deflection im 16er, Emergency-Clearance als KI-Option. Ecken
  0.7/Team → 0.9/Team.
- **`b1691a8`** — fix(ai): Verteidiger stellen statt zuwerfen im 16er.
  Elfmeter-Anteil 33 % → 16 %. Strukturelle Anti-Elfmeter-Lösung.
- **`12da93c`** — fix(ai): Abwehrkette hält zusammen. Max-Spread=8,
  zentrale-nicht-höher. Steilpass-Monokultur aufgelöst.
- **`310ac17`** — tune(ai): Antizipations-Qualität differenziert. Bayern
  verteidigt enger, Bochum bekommt längeren Puffer, setzt ihn aber
  nur teilweise um.
- **`8c5bc3d`** — fix(ai): Verteidiger halten Tiefenpuffer gegen
  Angreifer an Abseitslinie. Adressiert User-Befund "0:3 in 16 Min
  durch Tiefenbälle".
- **`2e84759`** — feat(replay): MatchIntent-Debug-Overlay pro Team.
- **`3f3715a`** — docs: session status (vor heutigen Iterationen).
- **`32c3557`** — feat(ai): ML-readiness, JSONL-Export.
- **`0945c12`** — feat(ai): Stufe-4-MatchIntent (GOAP-light).
- **`8a5a954`** — feat(ai): Stufe-3-Lookahead mit Antizipation.
- **`dc483bf`** — feat(ai): 1-Zug-Lookahead für Ballführer (Stufe 1).

## Arbeitsumgebung

- Repo: `~/Documents/tikitaq`.
- Remote: `https://github.com/michmonhh/tikitaq.git`, Branch `dev`.
- Main-Branch unverändert seit 18. April (Cloudflare-Deploy blockieren).
- Dev-Server: `npm run dev` auf http://localhost:5173/
- Arena-CLI: `npx tsx scripts/aiArena.ts --roundrobin`
- Training-Export: `--export-training out.jsonl.gz` anhängen
- Diagnose-Skripte:
  - `scripts/analyzeCornerGoals.ts` — Tore aus Ecken zählen
  - `scripts/analyzeCornerFlow.ts` — Corner-Event-Kette analysieren
  - `scripts/testBochumBayern.ts` — Qualitätsdifferenzierungs-Test
  - `scripts/debugCorner.ts` — Replay-basierter Corner-Frame-Dump

## Nächster konkreter Schritt

Entscheidung liegt beim User:
- **A**: Weiter Heuristik schleifen (aber der sinnvolle Hebelraum ist ausgereizt)
- **B**: Python-ML-Projekt starten (BC-Phase 0)
- **C**: Replay-Verifikation per Browser-Test bevor ML

Aktueller Favorit nach User-Kommentaren: **B**, sobald die Heuristik
sich grundsolide anfühlt.
