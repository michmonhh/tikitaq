# TIKITAQ — Session-Stand (2026-04-23)

> Lebendes Protokoll der aktuellen Chat-Sitzung. Nach einem Chat-Crash hier
> einsteigen: Abschnitt **"Wo wir stehen"** lesen, dann **"Offen"** für den
> nächsten Schritt, dann den relevanten Punkt unter **"Änderungen heute"**
> für Kontext.

## Wo wir stehen

- Branch: `dev` bei **`91e7921`** (gepusht zu `origin/dev`).
- Arena-CLI: `npx tsx scripts/aiArena.ts --roundrobin` läuft 306 Matches in
  ~8s und gibt am Ende eine Bundesliga-Vergleichstabelle + Tor-Typen aus.
- Replay-Viewer im Browser (Arena → Match simulieren → "Replay anschauen")
  nutzt 1:1 die Match-Renderer. Team-Farben, Tor-Overlay, 30 % / 50 % / 1× /
  2× / 4× Geschwindigkeit alle funktional.
- Debug-Hilfe: `scripts/debugCorner.ts` — scannt Replays nach Set-Piece-
  Phasen und dumpt umliegende Frames. Template für ähnliche Debug-Szenarien.

## Aktuelle Arena-Metriken (306 Matches, Commit 91e7921)

| Metrik | Simuliert | Bundesliga-Ziel |
|---|---:|---:|
| Tore/Match | **4.50** | 3.00 |
| Heimsieg/Remis/Auswärts | ~42 % / 20 % / 38 % | 43 / 25 / 32 % |
| xG/Team | ~1.5 | 1.50 |
| Passquote | ~88 % | 82 % |
| Schüsse/Team | ~3.3 | 12.5 |
| Pässe/Team | ~19 | 450 |
| Gelbe / Rote Karten | 1.4 / 0.02 | 1.8 / 0.05 |
| Eckbälle/Team | 0.8 | 4.5 |
| **Elfmeter-Anteil an Toren** | **54.6 %** | 10 % |
| **Steilpass-Anteil an Open-Play** | **74.7 %** | 15 % |

Passquote, xG, Remis-Quote, Kartenrate: im Bundesliga-Band. Schüsse und
Pässe strukturell gedeckelt durch 1 Aktion/Team/Turn + 0.5 min/turn.

## Offen — Priorität absteigend

1. **Elfmeter-Explosion (54.6 % der Tore).** Entstand als Folge des
   Set-Piece-Phase-Fix in `91e7921`: jetzt werden Penalties korrekt
   aufgelöst (vorher still verworfen). Aber die Foul-im-16er-Rate ist zu
   hoch. **Kandidaten**: `engine/tackle.ts#calculateFoulChance`
   `foulChance *= 1.5` im Penalty Area reduzieren (z. B. auf 0.8x), oder
   tackle-Radius im 16er verkürzen, oder defensive Spieler im 16er zu
   "stellen statt tacklen" zwingen.
2. **Steilpass-Dominanz (74.7 % der Open-Play-Tore).** Ziel ~15 %. Der
   Through-Ball-Buff war nötig damit die KI überhaupt Tore schießt,
   überschießt jetzt aber. Kandidaten: Through-Ball-Scoring-Bonus
   `+15 → +5` in `playerDecision.ts`, oder Cross / Short-Pass-Abschluss
   stärker belohnen statt durch Steilpass balancen.
3. **Ecken gehen jetzt — im Replay verifizieren.** User hatte Corner-
   Hänger gemeldet, `91e7921` sollte das Kernproblem (phase='corner'
   wurde direkt überschrieben) beheben. Noch vom User zu bestätigen.
4. **LM-Grundlinie-Laufen fixed** (Commit 821c57f) — advance zielt jetzt
   auf Tor-Zentrum statt auf Grundlinie. Zu bestätigen im Replay.
5. **Elfmeter ohne sichtbaren Verteidiger** (User-Beobachtung): Fouls
   entstehen nur aus Tackle-Encounter, also muss irgendein Verteidiger
   da sein. Entweder Sicht-Limit im Replay oder anderer Spieler auf dem
   Feld wurde gefoult. Nach Elfmeter-Rate-Fix vielleicht obsolet.

## Wichtige Architektur-Entscheidungen dieser Sitzung

- **Replay-Snapshots = voller `GameState`** (nicht minimale Subset).
  Größer pro Match (~1 MB) aber Replay-Viewer nutzt die echten
  Match-Renderer — Änderungen am Match-Rendering ziehen automatisch mit.
- **Two-target MoveAction** (`target` + optional `secondaryTarget`).
  Nur genutzt vom ersten Presser beim losen Ball (aufnehmen und
  weiterlaufen). Erweiterungsfähig falls wir "Pass und weiter" wollen.
- **`passKind` im `GameEvent`** (optional). Ermöglicht retrograde
  Tor-Herkunfts-Analyse. In `applyPass` gesetzt; vom Arena zur
  Tor-Typ-Statistik korreliert.
- **Arena-Penalty synchron** in `runAIMatch.autoResolvePenalty`. Umgeht
  das setTimeout-basierte `gameStore.shootBall`-Pfad-Konstrukt.

## Änderungen heute (chronologisch, neueste zuerst)

Alle commits sind auf `dev`, gepusht zu `origin/dev`:

- **`91e7921`** — fix(arena): preserve set-piece phase across turn boundary.
  Der Kern-Bug: Orchestrator rief `endCurrentTurn` immer, das überschrieb
  corner/free_kick/penalty-Phasen. Löste Ecken + Elfmeter gleichzeitig.
  scripts/debugCorner.ts als Debug-Tool mitcommitet.
- **`821c57f`** — fix(ai): advance aims at goal centre. LM-Grundlinie-Bug.
- **`9d16d1a`** — tune(ai): defensive players penalise dribbling into
  tackle radius (TW/IV/LV/RV -35, ZDM -25).
- **`939d5fc`** — fix(ai): through-balls work for wide runners too
  (targetX-Zentralisierung entfernt für Flügelläufer).
- **`f2d0382`** — fix(ai): emergency-pass fallback für Set-Piece-Taker.
- **`4ddc5eb`** — fix(set-piece): 9.15 m Gegner-Abstand bei Freistoß/Ecke +
  Abstoß wird als Freistoß simuliert.
- **`c5965c9`** — fix(ai): kein Offside-Check bei Pass direkt aus Ecke.
- **`064e6a7`** — feat(arena): penalty sync-resolve + goal-origin breakdown
  (Tor-Typ-Tabelle im CLI, passKind im event).
- **`22aa0f3`** — feat(arena): goal-kind breakdown (open_play/penalty/own).
- **`115281b`** — fix(replay): score bar reads live state, not final.
- **`30cf47c`** — fix(replay): set team colors on renderer init.
- **`995b41d`** — fix(replay): ball follows dribbler + real team colors.
- **`e10fadc`** — feat(replay): use match-screen renderers.
- **`6b605b3`** — refactor(replay): snapshot stores full GameState.
- **`ca89b7f`** — fix(store): preserve shot_scored event after handleGoalScored.
- **`d63e9fb`** — tune: xG formula, card rates, corner deflection 35→60 %.
- **`3db0901`** — feat(engine): 2× turn rate (MINUTES_PER_TURN 1→0.5) +
  parade deflection corners.
- **`82fe7b7`** — tune(ai): short-range shots only, realistic conversion.
- **`3382641`** — tune(ai): free carrier goes solo instead of passing into
  pressure.
- **`e9be831`** — tune(positioning): striker goes higher, wingers use full
  width.
- **`cb0aabf`** — tune(ai): halve field intercept radii.
- **`5d72481`** — tune(passing): reduce miss rate to 88–95 %.
- **`f7ee85b`** — tune(ai): faster advance step + safer offside margin.
- **`7f17658`** — tune(ai): penalise long shots, reward advancing toward box.
- **`672137e`** — tune(set-piece): keep strikers forward during own FKs.
- **`c373052`** — tune(ai): push AI to try forward risk passes more often.
- **`c1e2122`** — tune(ai): aggressive evasion for offensive players.
- **`2d377ed`** — feat(engine): two-target move — scoop loose ball + keep running.

## Arbeitsumgebung

- Repo: `~/Documents/tikitaq` (aus iCloud gerettet am 22. April — siehe
  Handoff.md für Kontext).
- Remote: `https://github.com/michmonhh/tikitaq.git`, Branch `dev`.
- Main-Branch (`origin/main`) unverändert seit 18. April — bewusst nicht
  pushen damit Cloudflare nichts auto-deployt.
- Dev-Server: `npm run dev` auf http://localhost:5173/
- Arena-CLI: `npx tsx scripts/aiArena.ts --roundrobin`

## Nächster konkreter Schritt

Ich würde mit **Punkt 1 (Elfmeter-Explosion)** starten:

```ts
// engine/tackle.ts calculateFoulChance + resolveTackle:
// foulChance *= 1.5 im Strafraum → 0.8
// + clamp 0.45 → 0.30
```

Das reduziert die Foul-im-16er-Wahrscheinlichkeit ohne Zweikämpfe
generell zu verändern. Erwartung: Penalty-Anteil von 54 % auf ~10 %.
Danach Verification via Round-Robin-Vergleich.
