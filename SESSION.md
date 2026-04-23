# TIKITAQ — Session-Stand (2026-04-22)

> Lebendes Protokoll der aktuellen Chat-Sitzung. Nach einem Chat-Crash hier
> einsteigen: Abschnitt **"Wo wir stehen"** lesen, dann **"Offen"** für den
> nächsten Schritt, dann den relevanten Punkt unter **"Änderungen heute"**
> für Kontext.

## Wo wir stehen

- Branch: `dev` bei **`6ffb724`** (lokal, noch NICHT gepusht).
- Arena-CLI: `npx tsx scripts/aiArena.ts --roundrobin` läuft 306 Matches in
  ~16s und gibt am Ende eine Bundesliga-Vergleichstabelle + Tor-Typen aus.
- Replay-Viewer im Browser (Arena → Match simulieren → "Replay anschauen")
  nutzt 1:1 die Match-Renderer. Team-Farben, Tor-Overlay, 30 % / 50 % / 1× /
  2× / 4× Geschwindigkeit alle funktional.
- Debug-Hilfe: `scripts/debugCorner.ts` — scannt Replays nach Set-Piece-
  Phasen und dumpt umliegende Frames. Template für ähnliche Debug-Szenarien.

## Aktuelle Arena-Metriken (306 Matches, Commit 6ffb724)

| Metrik | Simuliert | Bundesliga-Ziel |
|---|---:|---:|
| Tore/Match | **2.66** | 3.00 |
| Heimsieg/Remis/Auswärts | **44 / 23 / 33 %** | 43 / 25 / 32 % ✓ |
| xG/Team | ~1.1 | 1.50 |
| Passquote | **84.5 %** | 82 % ✓ |
| Schüsse/Team | 2.6 | 12.5 |
| Pässe/Team | 34 | 450 |
| Gelbe / Rote Karten | 1.1 / 0.01 | 1.8 / 0.05 |
| Eckbälle/Team | 0.7 | 4.5 |
| **Elfmeter-Anteil an Toren** | **23.9 %** | 10 % |
| **Steilpass-Anteil an Open-Play** | **58.2 %** | ~15 % |
| **Flanken-Anteil an Open-Play** | **8.9 %** | 18 % |

Passquote, Remis-Quote, Heimsieg-Quote, Kartenrate: **im Bundesliga-Band**.
Schüsse und Pässe strukturell gedeckelt durch 1 Aktion/Team/Turn +
0.5 min/turn. Tor-Rate knapp unter dem Ziel (2.66 vs 3.00).

## Fortschritt in dieser Iteration

Vom letzten Commit (`5bf16b5`) zu jetzt (`6ffb724`):
- Steilpass-Tor-Anteil: 74.7 % → **58.2 %** (absolut 578→361)
- Penalty-Anteil: 54.6 % → **23.9 %** (absolut 672→195)
- Flanken-Tor-Anteil: 5.7 % → **8.9 %** (absolut 47→55)
- Solo-Anteil: 8.2 % → **11.9 %**
- Kurzpass-Anteil: 6.5 % → **13.2 %**

## Offen — Priorität absteigend

1. **Steilpass-Anteil weiter runter (58 % → ~15 %).** Noch dominant, aber
   deutlich weniger katastrophal. Möglicher Hebel: Intercept-Score-Cap
   weiter anheben (aktuell 0.70), oder Through-Ball-Reward/Bonus im
   `playerDecision.ts` weiter drosseln. Riskant: Tor-Rate ist bereits
   unter Ziel, weitere Nerfs müssen von Schussrate-Hebeln kompensiert
   werden.
2. **Torrate unter Ziel (2.66 vs 3.00).** Mehr Tore aus anderen Quellen
   nötig. Hebel: Schuss-Zonen-Bonus leicht anheben, Box-Präsenz
   vergrößern, Flanken-Conversion stärken.
3. **Penalty-Anteil 23.9 % vs 10 % Ziel.** Noch zu hoch. Weitere Hebel:
   tackle-Radius im Strafraum verkürzen, Verteidiger im Box zu "stellen
   statt tacklen" zwingen, oder Elfmeter-Success-Rate drosseln.
4. **Eckbälle strukturell niedrig (0.7 vs 4.5).** Aus Turn-Modell heraus
   schwer zu ändern — möglicherweise akzeptabel.
5. **Elfmeter ohne sichtbaren Verteidiger** (alte User-Beobachtung): nach
   den aktuellen Fixes wahrscheinlich seltener. User muss bestätigen.
6. **Replay-Verifikation:** User sieht im Live-Replay ob Flanken jetzt
   wirklich kommen, Grundlinien-Läufe erfolgen und Steilpässe öfter
   abgefangen werden.

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
- **Through-Ball-Interception**: eigener `checkThroughBallInterception`-
  Check in `applyPass.ts`, parallel zum bestehenden ground-Intercept.
  Nutzt `getAnticipation` aus `positioning/anticipation.ts` und ist
  positions-sensitiv (nur IV/LV/RV/ZDM/ZM, nicht Stürmer).

## Änderungen heute (chronologisch, neueste zuerst)

Alle commits sind auf `dev`:

- **`6ffb724`** — tune(tackle): penalty foul rate 0.5× → 0.35×, cap 0.15 → 0.10.
  Senkt Elfmeter-Anteil 32.2 % → 23.9 %.
- **`9e3f095`** — tune(ai): wings run to byline + strikers pull into box.
  LM/RM Wing-Korridor (x=15/85), progressiv Richtung Grundlinie.
  Stürmer+OM werden in 16er-Korridor gezogen bei Flügelangriff.
  Flanken-Bonus +12 im scoring.
- **`6b6b62f`** — fix(passing): through-balls can be intercepted.
  Neuer `checkThroughBallInterception`-Check; Through-Ball kann jetzt
  flach ODER hoch sein (passType je nach Lane). Steilpass-Tore fallen
  von 74.7 % auf 58.2 % Open-Play-Anteil, Passquote landet bei 84.5 %
  (im Bundesliga-Band).
- **`5bf16b5`** — tune(tackle): foul in box 1.5× → 0.5× (cap 0.45 → 0.15).
  Erster Penalty-Fix nach Set-Piece-Phase-Guard.
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

**Push nach `origin/dev`** (3 neue Commits lokal), dann **User-Replay-
Verifikation**: Sieht er jetzt Flanken? Laufen Flügelspieler bis zur
Grundlinie? Werden Steilpässe abgefangen?

Wenn das bestätigt ist, zurück an Punkt 1 der Offen-Liste (Steilpass-
Anteil weiter runter). Alternative: Schuss-/Flanken-Conversion erhöhen,
um Tor-Rate ans 3.00-Ziel zu heben.
