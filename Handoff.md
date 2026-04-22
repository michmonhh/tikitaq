# TIKITAQ — Handoff (rekonstruiert 2026-04-22)

> **Kontext:** Das iCloud-Repo ist beim Verschieben verloren gegangen. Der letzte GitHub-Push war am **18. April 2026, 15:16 UTC** (Commit `e35f2e2` "Add Saison-Modus Phase A (1. Liga)"). Dies ist eine Rekonstruktion des KI-Status aus dem vorhandenen Code. Die ungetrackten Dateien `Handoff.md`, `Handoff2.md`, `Handoff3.md`, `KI.md`, `SESSION-AUTONOMOUS.md`, `claude-code-briefing.md`, `scripts/` und der komplette `training/`-Ordner (Python PPO-Pipeline inkl. ~33 MB Rollout-Daten) sind nicht mehr vorhanden.

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
| Briefing | `claude-code-briefing.md` |
| KI-Tuning CLIs | `scripts/` komplett (`ppoRollout.ts`, `ppoSelfPlay.sh`, `collectTrajectories.ts`, `simulate-mega.ts`, `parityTest.ts`, `aiArena.ts`, `ki2Smoke.ts`, `bcEncoderSmoke.ts`, `encoderSmoke.ts`, `policySmoke.ts`, `rewardsSmoke.ts`, `trajectorySmoke.ts`, `coachTriggerSmoke.ts`, `actionsSmoke.ts`, `simulate.ts`, `simulate-mega.ts`, `simulateSeason.ts`, `team-dna-test.ts`, `test-spacing.ts`, `arena-runs/`) |
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

1. **Confidence-Events nur teilweise verdrahtet** (`identity.ts`): `goal_scored`/`goal_conceded` werden in `index.ts:108–112` gefüttert. Die anderen 6 Events sind definiert aber ungenutzt im AI-Modul. Entweder im gameStore einhaken oder Events entfernen.
2. **Memory schreibt nichts** (`memory.ts`): `recordEvent` hat keinen Call-Sites im AI-Modul. `getAvoiding`/`getWorking` laufen ins Leere bis Events reinkommen. Aufgabe: Pass-/Schuss-Resultate aus `gameStore/pass.ts`/`shoot.ts` in `MatchMemory` schreiben.
3. **`Knowledge` (persistent)** ist hart auf leeres Dummy gesetzt (`loadKnowledge` gibt leere Map zurück) — Kommentar sagt *"Wird durch AI-vs-AI Training befüllt. Vorerst leer."* Das war vermutlich der Zweck der Python PPO-Pipeline (`training/`), die jetzt verloren ist.
4. **Hungarian in `positioning/marking.ts`** ist die einfache Variante (64 Zeilen). Im verlorenen `scripts/`-Ordner gab es `positioning/hungarian.ts` als größere Variante (Dateiname aus iCloud-Listing der vorherigen Session bekannt). Möglicherweise ging dort bessere Zuordnungs-Logik verloren.

### Parallel-Gleis: Python RL-Training (**verloren, war im Aufbau**)

Aus CLAUDE.md + dem vorher gesichteten iCloud-Listing rekonstruierbar:

- **PPO (Proximal Policy Optimization)** + **Behavioral Cloning** in PyTorch
- Rollouts als JSONL geschrieben (100 Rollouts à ~330 KB = ~33 MB zum Zeitpunkt des Absturzes)
- Export via `export_onnx.py` / `export_weights.py` — vermutlich ONNX-Runtime in den Browser / zur Laufzeit geplant
- Autonomous-Self-Play über `autonomous_run.sh` / `ppoSelfPlay.sh`
- `tikitaq_train/dataset.py`, `ppo_dataset.py`, `model.py`, `bc_train.py`, `ppo_train.py`, `smoke.py`, `__init__.py`

**Ziel** laut Typ `Knowledge.strategyHints: Map<string, number>`: Strategie-Muster mit Winrate annotiert (z.B. `"deep_block_vs_fast" → 0.62`), die `teamPlan.chooseStrategy` dann als zusätzlichen Score-Term konsumiert. Im aktuellen Code ist dieser Term nicht verdrahtet.

---

## Vorgeschlagene nächste Schritte (Priorität absteigend)

1. **Repo als Arbeitskopie annehmen.** Current: `~/Documents/tikitaq save/tikitaq`. Reine Umbenennung nach `~/Documents/tikitaq` vorschlagen, falls Pfad stört.
2. **`npm install && npx tsc -b && npm run build`** — verifizieren, dass der 18.-April-Stand clean baut.
3. **Memory-Events verdrahten**: `recordEvent` aus `engine/passing/applyPass.ts` und `engine/shooting.ts` aufrufen. Confidence-Events (`pass_complete`, `tackle_won`, `save`) analog im `gameStore`.
4. **Entscheiden: Python RL-Pipeline neu aufbauen?** Die TypeScript-KI ist voll funktional auch ohne `Knowledge`. Rebuild lohnt erst wenn die regelbasierte Variante in AI-vs-AI-Arenen reproduzierbare Schwächen zeigt.
5. **`scripts/`-Verlust**: Zumindest `aiArena.ts` (AI-vs-AI-Simulator) und `parityTest.ts` (Regressionstest nach Refactor) neu aufbauen — das waren vermutlich die wichtigsten Verifikations-Tools.
6. **Arbeit vom 18.–21. April**: komplett neu machen. MCP-Logs zeigen viel Live-Preview-Klick/Screenshot-Aktivität, wenig Rückschluss auf Code-Änderungen. Kandidaten (spekulativ): Saison-Modus-Tuning, Bugfixes an Set-Pieces, KI-Parameter-Feintuning.

---

## Repo-Hygiene (Vorschlag)

Der Grund dass so viel verloren ging: zu viele Arbeitsprodukte waren ungetrackt. Gegenmaßnahmen:

- `Handoff*.md`/`KI.md`/`SESSION-*.md` **tracken** (committen) — sie gehören zum Projekt-Kontext.
- `scripts/` in `tools/` umbenennen und **committen** (außer CLI-Output/logs).
- `training/` **committen** (bis auf `.venv/`, `*.pt`, `*.onnx`, `ppo_rollouts/` — das bleibt per `.gitignore` draußen, aber das Python-Setup selbst gehört ins Repo).
- **Nicht in iCloud Drive arbeiten**. Ein Git-Repo hat keinen Platz in iCloud.
- **Push-Disziplin**: nach jeder Session `git push`. 18 Tage ungepushte Arbeit sind 18 Tage Risiko.
