# TIKITAQ — Handoff (rekonstruiert 2026-04-22, erweitert 2026-04-22)

> **Kontext:** Das iCloud-Repo ist beim Verschieben verloren gegangen. Der letzte GitHub-Push war am **18. April 2026, 15:16 UTC** (Commit `e35f2e2` "Add Saison-Modus Phase A (1. Liga)"). Dies ist eine Rekonstruktion des KI-Status aus dem vorhandenen Code. Die ungetrackten Dateien `Handoff.md`, `Handoff2.md`, `Handoff3.md`, `KI.md`, `SESSION-AUTONOMOUS.md`, `scripts/` und der komplette `training/`-Ordner (Python PPO-Pipeline inkl. ~33 MB Rollout-Daten) sind nicht mehr vorhanden.
>
> **Update:** `claude-code-briefing.md` wurde zwischenzeitlich wiedergefunden und enthält die komplette Spec für die MARL-Pipeline (hierarchische Policy, Formations-als-Daten, Behavioral Cloning + PPO + Self-Play). Roadmap-Abschnitt weiter unten entsprechend überarbeitet. Seit der Rekonstruktion ist außerdem Folgendes gebaut:
>   - Auth-Login/Sign-up-Button auf localhost
>   - Vollständige Event-Verdrahtung: `pass_complete/failed`, `tackle_won/lost`, `save` in MatchMemory + TeamIdentity
>   - Arena-Pipeline: headless `runAIMatch` + CLI round-robin + `ArenaScreen` + animierter `ReplayScreen`
>   - dev/main-Branch-Trennung, Push-Disziplin etabliert

## Was gerettet wurde

- `src/engine/ai/` — komplette AI-v2-Architektur, Stand 18. April
- `CLAUDE.md` — Projekt-Kontext
- `LigaModus.md` — Saisonmodus-Spezifikation (20 KB)
- Alles in `src/`, `public/`, `supabase/` bis zum 18. April
- MCP-Logs vom 4.–20. April unter `~/Library/Caches/claude-cli-nodejs/...TIKITAQ/` (Tool-Call-Metadata, keine Inhalte)

## Was verloren ist

| Bereich | Was konkret |
|---|---|
| Rolling Handoffs | `Handoff.md`, `Handoff2.md`, `Handoff3.md` — Tages-Übergabestände |
| KI-Spec | `KI.md` — detaillierte Spezifikation der KI-Architektur |
| Autonomous-Mode | `SESSION-AUTONOMOUS.md`, `autonomous_run.sh`, `mega_run.log` |
| KI-Tuning CLIs | `scripts/` komplett (`ppoRollout.ts`, `ppoSelfPlay.sh`, `collectTrajectories.ts`, `simulate-mega.ts`, `parityTest.ts`, `ki2Smoke.ts`, `bcEncoderSmoke.ts`, `encoderSmoke.ts`, `policySmoke.ts`, `rewardsSmoke.ts`, `trajectorySmoke.ts`, `coachTriggerSmoke.ts`, `actionsSmoke.ts`, `simulate.ts`, `simulate-mega.ts`, `simulateSeason.ts`, `team-dna-test.ts`, `test-spacing.ts`, `arena-runs/`) — einziger neu gebauter Ersatz ist `scripts/aiArena.ts`. |
| Python-Training | `training/` komplett: `bc_train.py`, `ppo_train.py`, `dataset.py`, `ppo_dataset.py`, `model.py`, `export_onnx.py`, `export_weights.py`, `smoke.py`, `requirements.txt`, `tikitaq_train/__init__.py` |
| Trainingsdaten | 100 Rollout-Dateien (`training/ppo_rollouts/rollout-31000.jsonl` bis `-31099.jsonl`, ~33 MB) |
| Arbeit 18.–21. April | Ca. 3 Tage lokale Arbeit nie gepusht (Inhalt unbekannt — MCP-Logs zeigen viel Live-Preview-Testing) |
| KI-Plan | `~/.claude/plans/snuggly-frolicking-cray.md` (laut CLAUDE.md) |

---

## AI v2 — Architektur-Stand (aus Code)

Drei-Schichten-Modell in `src/engine/ai/`, Einstieg: `executeAITurn(state)` aus `index.ts`.

### Öffentliche API

```ts
// index.ts
export function initAIPlan(allPlayers: PlayerData[], aiTeam: TeamSide): void
export function resetOpponentModel(): void
export function executeAITurn(state: GameState): PlayerAction[]
export function getAIReasoning(): Map<string, string>
export function getAIPlan(team: TeamSide): TeamPlan | null
export function getLastFieldReading(): FieldReading | null
export function getAITickerMessages(): string[]
```

### Modul-State (privat in `index.ts`)

```ts
let teamPlans       = new Map<TeamSide, TeamPlan>()
let matchMemories   = new Map<TeamSide, MatchMemory>()
let lastFieldReading: FieldReading | null = null
let pendingTickerMessages: string[] = []
let lastReasoning   = new Map<string, string>()
let reviewedMinutes = new Set<number>()
let lastKnownScore  = { team1: 0, team2: 0 }
let hadBallLastTurn = false
```

---

### Schicht 1 — Mannschaftsplan (`teamPlan.ts`, 273 Zeilen)

**Status: implementiert.**

- **14 gültige Strategie-Kombos** (`VALID_COMBOS`): Kreuzprodukt aus `DefenseStrategy × AttackStrategy × TransitionBehavior` mit Hand-kuratierten Kombinationen.
  - Defense: `high_press | mid_press | deep_block | man_marking`
  - Attack: `possession | counter | wing_play | switch_play | direct`
  - Transition: `gegenpress | fall_back`
- **Strategiewahl** (`chooseStrategy`): `scoreDefense + scoreAttack + synergyBonus + ±5 Rauschen` → best.
- **Synergie-Boni** fest kodiert (Guardiola, Klopp, Mourinho, Simeone, Rangnick-Bezeichnungen im Code).
- **Viertel-Überprüfung** bei Minuten `[23, 45, 68]` (`REVIEW_MINUTES`). Trigger für Taktikwechsel:
  - Possession ohne Torschüsse nach Min 20
  - Deep Block mit ≥2 Gegentoren nach Min 20
  - High Press wird laut Memory überspielt (`avoiding` enthält `'press_high'`)
  - Rückstand + Min 60 + Deep Block
  - Rückstand ≥2 Tore + Min 55 (Brechstange)
- **Confidence-Boost** (+2, bis `confidenceMax`) wenn Strategie funktioniert.
- **Klartext-Ticker-Begründung** via `buildReason()`.

### Mannschaftsidentität (`identity.ts`, 164 Zeilen)

**Status: implementiert.**

- **Liga-Referenzwerte** fest kodiert (Bundesliga 18 Teams):
  - `LEAGUE_MIN_QUALITY = 71` (Bochum)
  - `LEAGUE_MAX_QUALITY = 87` (München)
- **`selfImage`** = linear skaliert 25–90 aus durchschnittlicher Teamqualität, geclampt [20, 95].
- **Confidence** startet bei `selfImage`, Rahmen `[selfImage-25, selfImage+25]`, wird bei Dominanz/Zusammenbruch geweitet (`widenConfidenceRange` +2 pro Viertel).
- **Stärken-Vergleich** (`compareStrength`) berechnet 5 Werte `[-1,+1]`: `pace`, `passing`, `defense`, `attack`, `overall` + 5 bool-Flags (`opponentHasFastAttack`, `ownDefenseIsFast`, `ownPassingStrong`, `ownWingsStrong`, `opponentHasStarPlayer`).
- **Confidence-Events** mit Basis-Deltas:
  - `goal_scored +12`, `goal_conceded -12`
  - `pass_complete +0.3`, `pass_failed -0.8`
  - `tackle_won +1.5`, `tackle_lost -1.5`
  - `save +2`, `possession_turn +0.2`
- **Risiko-Multiplikator**: `updateConfidence(identity, event, riskLevel)` → `base * (1 + riskLevel)` — riskante Aktionen die klappen boosten stärker.
- ⚠️ **Im Code aktiv genutzt nur `goal_scored`/`goal_conceded`** (index.ts:108–112). Die restlichen Events sind definiert, aber keine Call-Sites im AI-Modul gefunden. **Mögliche offene Baustelle:** Event-Hooks in Engine/Store einbauen.

---

### Schicht 2 — Spielerentscheidung (`playerDecision.ts` + `playerDecision/`)

**Status: implementiert, gut strukturiert.**

Dispatcher in `playerDecision.ts` (188 Zeilen), Submodule:

| Submodul | Inhalt |
|---|---|
| `playerDecision/types.ts` | `BallOption`, `BallOptionType` (shoot, short_pass, long_ball, through_ball, cross, dribble, advance, hold) |
| `playerDecision/scoring.ts` | `getStrategyBonus`, `getFieldBonus`, `getMemoryBonus` — 76 Zeilen, Strategie-Boni als Record-Tabelle |
| `playerDecision/helpers.ts` | `toAction`, `getReceiverLabel` |
| `playerDecision/evaluators/` | Ein File pro Option: `shoot`, `pass`, `through_ball`, `dribble`, `advance`, `hold` |

**Kernformel** (in `decideBallAction`):

```
optionScore = (reward × riskAppetite + successChance × (1 − riskAppetite)) × 100
           + strategyBonus + fieldBonus + memoryBonus
           + context-boosts (Torentfernung, Steilpass) + ±3 Rauschen
```

- `riskAppetite = min(0.90, baseRisk + goalUrgency × 0.35)`, `goalUrgency` eskaliert unter 21 Einheiten zum Tor.
- **Max 2 Pässe pro Zug** (`state.passesThisTurn < 2`).
- **Torschuss-Bonus**: +25 unter 12 Einheiten, +12 unter 18 Einheiten.
- **Through-Ball-Bonus**: +8 flat.

**Sonderfälle** (erzwungener Pass):
- `state.mustPass` (Anstoß) → nur Pass-Optionen, alle Mitspieler
- `carrier.positionLabel === 'TW'` (Torwart) → dto. + spezielle Reason

**Strategy-Bonus-Tabelle** (`scoring.ts:7–13`) fest kodiert pro AttackStrategy × Option. Z.B. `counter → through_ball: +18`, `wing_play → cross: +20`.

---

### Schicht 3 — Positionierung (`positioning.ts` + `positioning/`)

**Status: implementiert, komplexestes Modul.**

Dispatcher in `positioning.ts` (108 Zeilen). Entscheidungsbaum in `decidePositioning`:

1. Torwart → `goalkeeperPosition`
2. Presser (inkl. Gegenpress + loser Ball) → Ball-Position bzw. Passweg-Cut-Off
3. Eigener Ballbesitz → `offensivePosition`
4. Manndeckung aktiv → `manMarkingPosition`
5. Sonst → `defensivePosition`

| Submodul | Zeilen | Inhalt |
|---|---:|---|
| `positioning/config.ts` | 83 | Verhaltens-Tabellen `DEF_BEHAVIOR`, `ATK_BEHAVIOR`, `PRESS_CONFIG`, `GEGENPRESS_CONFIG`. Je `RoleGroup` (defender/midfielder/attacker) × Strategie: `verticalOffset`, `ballAttractionY/X`, `widthScale`. |
| `positioning/state.ts` | 31 | Gegenpress-Flag + Manndeckungs-Map (Modul-state). |
| `positioning/roles.ts` | 64 | `getRoleGroup`, `getFormationHome`, `getHomeSide`, `isOnLeftSide` — leitet Rolle aus `positionLabel` (TW/IV/LV/RV/ZDM/LM/RM/OM/ST) ab. |
| `positioning/anticipation.ts` | 33 | `getAnticipation`, `getTeamAnticipation` aus Stats. |
| `positioning/threats.ts` + `threats/` | 2 + 415 | Bedrohungsvorhersage in 3 Submodulen: `dangerousSpace` (114), `predict` (160 — Gegner-Projektion), `nearest` (141). |
| `positioning/gegenpress.ts` | 109 | `updateGegenpress`, `isFirstPresser`, `selectPressers`. |
| `positioning/marking.ts` | 64 | `computeMarkingAssignments` (Hungarian-light 1:1-Zuordnung). |
| `positioning/offensive.ts` | 145 | Angriffs-Position mit Konter-Absicherung. |
| `positioning/defensive.ts` | 325 | Größtes Submodul — Defensive + Manndeckung + Torwart. Enthält u.a. Tiefenbegrenzung pro Rolle+Strategie, Ballseiten-Kompaktheit, Abwehrketten-Synchronisation. |

**In `index.ts` nachgelagert nach allen Positionen**:

- **Abseits-Vermeidung**: für Nicht-Chaser-Nicht-Torwart wird Target auf Höhe `offsideLine ± 1` gezogen.
- **Abwehrketten-Ausrichtung**: zentrale Verteidiger werden nicht höher gezogen als der tiefste breite Verteidiger.
- **Teammate-Spacing** (`MIN_SPACING = 12`): paarweiser Push, Ball-Jäger fix.
- **Bewegungs-Schwelle < 1 Einheit**: Move-Action wird übersprungen außer loser Ball nah (< 5).

---

### Querschnitt

| Modul | Zeilen | Status |
|---|---:|---|
| `fieldReading.ts` | 196 | 5×5 Raster, abgeleitet: `weakSide`, `centralCongestion`, `gapBetweenLines`, `opponentHighLine`, `opponentCompact`, `attackDirection`. |
| `memory.ts` | 97 | `MatchMemory` (pro Spiel) + `Knowledge` (persistent, aktuell leer). `recordEvent`, `getTrend` (rollender Durchschnitt: 0.7·alt + 0.3·neu), `getAvoiding` (trend<-0.4, ≥3 Versuche), `getWorking` (trend>0.4, ≥2). |
| `types.ts` | 174 | Alle Typen + `PATTERNS`-Konstanten für Memory-Keys. |

⚠️ **`memory.ts` wird fast nur gelesen:** `getAvoiding` nur in `teamPlan.ts:221`. `recordEvent` wird im AI-Modul **nie** aufgerufen — Call-Sites müssten in Engine/Store liegen (Pass/Schuss-Ergebnisse). Wenn das nicht so ist, läuft `MatchMemory` leer. **Zu verifizieren.**

### Set-Pieces

`setPiece.ts` (87) ist Dispatcher für `repositionForSetPiece(state, team, phase)` mit Phasen `free_kick | corner | throw_in`. Plus `repositionForPenalty` aus `setPiecePenalty.ts`. Alle vier Phasen haben offensive + defensive Varianten in eigenen Files (`setPieceFreeKick` 275, `setPiecePenalty` 230, `setPieceCorner` 122, `setPieceThrowIn` 153). Helpers in `setPieceHelpers.ts` (189).

---

## Laufende Arbeit (aus CLAUDE.md interpretiert)

> *Zitat CLAUDE.md §"Laufende Arbeit":*
> *"Phase 1 (Dead Code + archivierte Verzeichnisse), Phase 2 (CLAUDE.md), Phase 3 (Splits von `ai/playerDecision.ts`, `ai/positioning.ts`, `stores/gameStore.ts`) sind erledigt. […] Phase 4 (optional: `scripts/→tools/`, `src/debug/` mit DEV-Guard) steht noch. — KI-Neuaufbau nach Plan unter `~/.claude/plans/snuggly-frolicking-cray.md`."*

### Code-Indizien offener Baustellen

1. ~~**Confidence-Events nur teilweise verdrahtet**~~ ✅ erledigt in Commits `fb66601` (pass) + `52c476e` (tackle + save). Offen bleibt nur `possession_turn` — Turn-Transition-Hook wird später evaluiert.
2. ~~**Memory schreibt nichts**~~ ✅ erledigt in `fb66601` — `recordEvent` wird aus `gameStore/pass.ts` gefüttert mit `PASS_LEFT/CENTER/RIGHT` + `PASS_SHORT/LONG`. `getAvoiding`/`getWorking` haben damit Datengrundlage.
3. **`Knowledge` (persistent)** ist hart auf leeres Dummy gesetzt (`loadKnowledge` gibt leere Map zurück). Wird durch die in `claude-code-briefing.md` beschriebene MARL-Pipeline befüllt — das ist KI2, nicht KI1-Intern.
4. **Hungarian in `positioning/marking.ts`** ist die einfache Variante (64 Zeilen). Im verlorenen `scripts/`-Ordner gab es `positioning/hungarian.ts` als größere Variante. Mögliche Regression; nur relevant falls Manndeckungs-Strategie in Arena-Matches schwach erscheint.
5. **Tor-Armut** (neu, Arena-Befund): Ø 0.54 Tore/Match statt ~2.8, ~62% Remis, München auf Platz 14. Kombiniertes xG ~2.9/Match — Chancen werden erzeugt, Konvertierung scheitert. Verdächtig: `evaluators/shoot.ts` (Schuss-Auswahl) oder `engine/shooting.ts` (Schuss-Mechanik). **Prioritäre Baustelle vor Trajectory-Collection**, weil eine schwache KI1 ein schwaches BC-Pretraining produziert.

### KI2 — MARL-Pipeline (aus `claude-code-briefing.md` wiedergewonnen)

Das Briefing ist zurück und gibt die komplette Spec vor. Zusammenfassung der verbindlichen Eckpunkte:

**Hierarchische Policy (zwei Netze):**
- **Spieler-Policy** — MLP 2–3 Hidden Layers, 64–128 Units. Ein einziges Netz für alle Spieler, Rolle als Input-Feature (Parameter-Sharing). Diskreter Action-Space, pro Rolle maskiert (TW schießt nicht aufs Tor etc.).
- **Coach-Policy** — kleineres MLP, diskreter Action-Space ≈ 18 (6 Formationen × 3 Risikostufen). Feuert seltener (alle N Runden oder Event-getrieben: Gegentor, rote Karte, Phasenwechsel).

**Modellbudget:** < 1 MB, < 1 ms Inferenz pro Spieler auf Mittelklasse-Handys. Export ONNX int8 → ONNX Runtime Web oder TF.js.

**Formationen = Daten, nicht Code:**
```ts
Formation = {
  name: '4-3-3',
  roles: [{ role: 'GK', anchor_attack: [0.05, 0.5], anchor_defense: [0.02, 0.5] }, …],
  compactness: { vertical: 0.6, horizontal: 0.7 },
}
```
Neue Formationen = neue Tabellenzeilen. Die Policy sieht nur die Sollposition und generalisiert über den Pool.

**State-Features (30–50, ego-zentrisch):**
- Eigene Position, Qualitäten, Rolle (one-hot)
- Eigene Sollposition (Formations-Anker nach Ballbesitz-Zustand) + Offset
- Kompaktheit (vertikal/horizontal als Skalare)
- Distanz/Winkel zum Ball
- Distanz zu nächstem Gegner und Mitspieler pro Rolle
- Team-Strategie (Risiko/Aggressivität/Pressing) + Kontext (Stand, verbleibende Runden)

**Trainingsverfahren:**
1. Trajektorien von KI1 sammeln (Größenordnung 10k–100k Spiele)
2. Behavioral Cloning als Pretraining → Policy startet mit fußballartigem Verhalten
3. PPO gegen KI1, statische zufällig gesamplete Formationen pro Spiel, optional KL-Penalty zu KI1
4. Self-Play + League aktivieren wenn KI1 geschlagen (KI1 und Varianten bleiben im League)
5. Erst scripted Coach, dann gelernter Coach

**Plausibilität = explizites Designziel** (nicht nur Winrate):
- Passlängenverteilung, Shot-Distanzen aus dem Strafraum, Position-Abweichung vom Anker (existent, aber plausibel), Teamform-Kompaktheit nach Spielphase, Ballbesitz nach Zone
- Sichtprüfung pro Checkpoint: 5–10 Spiele rendern, hässlicher Fußball = untauglich

**Engine-Determinismus:** Training (Python) und Runtime (Browser) müssen identisch sein. Vorschlag aus Briefing: TypeScript-Engine + Python-Port mit Paritäts-Tests, oder Rust/WASM für beide Seiten.

**Verloren, muss neu:** `bc_train.py`, `ppo_train.py`, `dataset.py`, `ppo_dataset.py`, `model.py`, `export_onnx.py`, `export_weights.py`, plus der Python-Engine-Port unter `/sim-py`, plus die gesammelten Trajektorien (100 Rollouts). Die `ReplaySnapshot`-Infrastruktur aus der Arena ist die halbe Miete — sie braucht nur noch Policy-Feature-Extraction als zusätzliche Schicht.

---

## Roadmap (briefing-basiert, Priorität absteigend)

**KI1 härten, bevor KI2 anfängt** — eine schwache Baseline produziert ein schwaches BC-Pretraining.

1. **Tor-Armut fixen.** Arena zeigt Ø 0.54 Tore/Match, ~62% Remis. Erste Pass (`de72952`) brachte partielle Linderung (Ø 0.63) — Kern-Ursache ist **nicht Schuss-Mechanik, sondern Positionierung**: Box-Präsenz < 2% (Stürmer stehen fast nie im gegnerischen 16er). Nächster Schritt: **Replay eines einzelnen Matches im UI anschauen**, beobachten wie sich Stürmer zwischen Turns verhalten, dann gezielt nachtunen. Zielwert: ~2.5–3 Tore/Match, München im Round-Robin unter Top 3.
2. **Paritäts-Test.** `runAIMatch` (gameStore headless) vs. UI-Match — identischer Seed, identischer Endzustand? Essentiell bevor wir Trajektorien für BC einfrieren. `scripts/parityTest.ts` war genau das verlorene Tool.
3. **Match-Planning-Screen wiederherstellen** (**war vor dem Verlust bereits gebaut**, muss neu). Kam vor jedem Match aller Modi zum Einsatz, mit:
   - Formations-Auswahl (siehe 4)
   - Drag-&-Drop zum Austausch von Startelf ↔ Bank
   - Spieler-Datenbank mit Bankspielern (aktuell nur Startelf vorhanden — `data/players.ts` muss erweitert werden)
4. **Formations-Datenstruktur** (Briefing-Schritt 3): `engine/formation.ts` vom Code-Generator zur Daten-Tabelle umbauen. Start-Pool: **4-4-2, 4-2-3-1, 4-3-3, 5-3-2, 3-5-2, 3-4-1-2**, erweiterbar.
5. **KI1 formations-fähig** (Briefing-Schritt 4): `positioning/roles.ts#getFormationHome` nutzt aktuell `p.origin`. Muss auf ausgewählten Formations-Anker (Attack vs. Defense je nach Ballbesitz) umgestellt werden. Ohne Verhaltens-Änderung für 4-3-3-Default.
6. **State-Encoder** (Briefing-Schritt 5): 30–50 Features ego-zentrisch pro handelndem Spieler. Deterministisch in TypeScript. Tests via bekannter Fixtures.
7. **Trajectory-Collection** (Briefing-Schritt 6): `ReplaySnapshot` um Feature-Vektoren + Action-Labels erweitern, oder parallelen Recorder `TrajectoryRecorder` bauen. Arena/CLI sammelt 10k–100k Spiele.
8. **Plausibilitäts-Metriken** (Briefing-Abschnitt Plausibilität, Punkt 5): Passlängen-Verteilung, Shot-Distanz-Verteilung, mittlere Anker-Abweichung, Team-Kompaktheit pro Phase, Ballbesitz-Heatmap. Pro Arena-Run ausgeben, pro Checkpoint vergleichen.
9. **Python-Pipeline** (Briefing-Schritte 7 ff.): Engine-Port nach Python ODER Rust/WASM-Entscheidung. BC-Pretraining, PPO-Loop, Self-Play + League, Coach (scripted → gelernt), ONNX-Export, Browser-Integration.

**Nebengleis:** Arena-Polish — IndexedDB-Persistenz für Replays, Round-Robin-Ansicht im UI (aktuell nur CLI), mehr Visualisierung (Reasoning-Overlay, Formations-Anker, Bewegungs-Trails).

---

## Repo-Hygiene (Vorschlag)

Der Grund dass so viel verloren ging: zu viele Arbeitsprodukte waren ungetrackt. Gegenmaßnahmen:

- `Handoff*.md`/`KI.md`/`SESSION-*.md` **tracken** (committen) — sie gehören zum Projekt-Kontext.
- `scripts/` in `tools/` umbenennen und **committen** (außer CLI-Output/logs).
- `training/` **committen** (bis auf `.venv/`, `*.pt`, `*.onnx`, `ppo_rollouts/` — das bleibt per `.gitignore` draußen, aber das Python-Setup selbst gehört ins Repo).
- **Nicht in iCloud Drive arbeiten**. Ein Git-Repo hat keinen Platz in iCloud.
- **Push-Disziplin**: nach jeder Session `git push`. 18 Tage ungepushte Arbeit sind 18 Tage Risiko.
