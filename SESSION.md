# TIKITAQ — Session-Stand (2026-04-26)

> Lebendes Protokoll. Nach Chat-Crash hier einsteigen: **"Wo wir stehen"** →
> **"Offen"** → falls nötig **"Änderungen-Historie"** für Commit-Kontext.

## Wo wir stehen

- Branch: `dev` bei **`91e068b`** (Disc-Farben + Auswärts-Kit-Logik)
- **Stufe 1 (Heuristik)**: ✅ — siehe Defense-Verbesserungen heute
- **Stufe 2 (BC)**: ✅ val_acc 0.775
- **Stufe 3 (RL v3)**: ✅ deployed, archiviert in `archive_v3/` weil
  Encoder-Dim änderte (ZM kam dazu) → bestehende Modelle inkompatibel
- **Stufe 3 League v3.5**: ✅ trainiert, in archive
- **UI**: MatchPlanningScreen mit Drag&Drop, Mini-Pitch-Modal,
  Bench (max 9), zweite Disc-Farbe für Auswärts
- **Gameplay-Mechanik**: substanziell überarbeitet heute (Tackle-Radius,
  Reception-Tackle, Pass-Mechanik, Set-Piece-Aufstellung)
- **Tier 2 (Off-Ball Movement)**: Phase 1 Skeleton steht — TS + Python +
  Trajectory-Recording aktiv. Training noch nicht angeschoben.
- **ML-Browser**: aktuell **kein** ONNX deployed, läuft auf Heuristik.
  Browser fällt graceful auf Heuristik wenn `public/rl_policy.onnx` fehlt.

## Heutige Sessions auf einen Blick (2026-04-26)

| Bereich | Status | Highlights |
|---|---|---|
| 7 Formationen | ✅ | 4-3-3, 4-2-3-1, 4-4-2, 3-5-2, 4-1-4-1, 5-3-2, 3-4-1-2 |
| 22-Mann Roster | ✅ | 18 Teams × 22 Spieler, ZM neue Position |
| MatchPlanningScreen | ✅ | Pitch + Bench (9) + Stats + Drag&Drop + Modal |
| Encoder v4 (ML) | ✅ | ROLE_LABELS um ZM erweitert, alte Modelle archiviert |
| Heuristik-Defense v4 | ✅ | Catenaccio, Coordinated Press, Review-Trigger |
| Reward v4 | ✅ | Cleansheet+30, xG-conceded-Delta, höhere Tackle-Werte |
| Mechanik-Korrekturen | ✅ | xG-Tor-Kalibrierung, Tackle-Radius -70%, cannotTackle |
| Set-Piece-Layout | ✅ | Defense-Linie, max 1 Spieler nah am Schützen, Rolle-X |
| Reception-Challenge | ✅ | Tackle-Trigger beim Pass-Empfang |
| Disc-Farben + Auswärts | ✅ | colorAlt pro Team + dynamischer Text-Kontrast |
| Tier 2 Phase 1 (MARL) | ✅ | Skeleton + Trajectory-Recording, opt-in |
| Tier 2 Phase 2 (BC) | ⏳ | wartet auf manuellen Trigger |

## Architektur-Schnellüberblick

```
src/
├── data/
│   ├── teams.ts         — 18 Teams + colorAlt + defaultFormation
│   ├── teamColors.ts    — pickDiscColors(home, away) + Kontrast-Helper
│   └── players.ts       — 18 × 22 PlayerTemplates (verfälschte Namen)
├── engine/
│   ├── formation.ts     — 7 FORMATION_xxx + createFormationDetailed
│   │                      mit customLineup + starterRosterIndices
│   ├── geometry.ts      — getTackleRadius (BASE 1.8) + getInterceptRadius
│   ├── constants.ts     — TACKLING/SHOOTING-Tuning v4
│   ├── tackle.ts        — resolveTackle (won/lost/foul-Outcomes)
│   ├── movement.ts      — Tackle-Trigger (Move + Run-through)
│   ├── shooting.ts      — Schuss-Phasen (Block, Accuracy, Save)
│   ├── ai/
│   │   ├── reward.ts    — v4: Cleansheet, xG-conceded-Delta,
│   │   │                  Defensive-Tiefe-Malus
│   │   ├── teamPlan.ts  — Coach: 16 Combos inkl. Catenaccio,
│   │   │                  erweiterte Review-Trigger
│   │   ├── positioning/ — defensive.ts, offensive.ts, gegenpress,
│   │   │                  marking, threats, anticipation, roles
│   │   ├── policy/      — Carrier-Policy: types/manager/onnxPolicy*
│   │   └── movement_policy/    — TIER 2: Off-Ball Movement-Policy
│   │       ├── types.ts        — MovementOption, 10 Sub-Skill-Types
│   │       ├── options.ts      — generateMovementOptions kontextabh.
│   │       ├── features.ts     — Per-Player-Encoder (291 dim)
│   │       ├── manager.ts      — Active-Policy-Slot
│   │       ├── override.ts     — Sync-Async-Bridge
│   │       ├── runner.ts       — Pre-Turn-Hook in executeAITurn
│   │       └── heuristicMovementPolicy.ts — Default = max-score
│   └── ai/setPieceFreeKick.ts — neu: Defense-Linie + Rolle-Layout
├── screens/
│   ├── MatchPlanningScreen.tsx — Pitch + Bench + Drag&Drop + Modal
│   └── ...
└── canvas/
    └── PlayerRenderer.ts — getContrastTextColor pro Disc

ml/
├── movement_features.py — 1:1-Spiegel zu features.ts (291 dim)
├── movement_dataset.py  — In-Memory + Streaming-Reader
└── movement_model.py    — Actor + Critic (analog Carrier-PolicyNet)
```

## Detail-Stand pro Bereich

### A) Formationen + Roster
- 7 FormationTypes mit y-Staffelung Bayern (cf=0.74) bei
  ST 50 → OM 52 → LM/RM 54 → ZDM 57 → LV/RV 62 → IV 69 → TW 82.
- Bochum (cf=0.40): noch ausgeprägter (ST 50 → IV 75 → TW 86).
- Push-Werte moderat, damit Staffelung auch bei starken Teams sichtbar.
- Roster: 22 Spieler pro Team — 2 TW, 2 LV, 3 IV, 2 RV, 2 ZDM, 2 ZM,
  2 LM, 2 RM, 2 OM, 3 ST. Verfälschte Namen (Manuel Neuhaus,
  Joshua Kimmler, Florian Wiertz etc.).

### B) MatchPlanningScreen (UI)
- 3-Spalten-Layout: Bench/Stats — Pitch — Bench/Stats
- Pitch: SVG-Hintergrund + HTML-Discs absolut positioniert
- Drag&Drop:
  - Pitch ↔ Pitch (Spieler-Tausch)
  - Bench ↔ Pitch (Auswechslung)
- Klick auf Spieler → Stats-Panel
- Klick auf "Formation ▼" → Modal mit 7 Mini-Pitch-Karten
- Bench-Limit: 9 Spieler (Bundesliga-Regel), nach Quality sortiert
- customLineup wird ans Match durchgereicht (über MatchConfig)

### C) Heuristik-Defense v4
- Coach-Layer (`teamPlan.ts`):
  - 5 DefenseStrategies (high_press, mid_press, deep_block,
    man_marking, **catenaccio**) + 5 Attack + 2 Transition
  - 16 Valid-Combos
  - Review-Trigger erweitert: zugelassene Schüsse/xG-conceded,
    schnelle 2 Gegentore in 1. HZ → Catenaccio aufziehen
- Pressing-Cascade (positioning.ts):
  - Zweiter Presser identifiziert gefährlichsten Pass-Empfänger
    (Y-Tor-Position + ungedeckt-Bonus) und schließt die Lane
- Defensive Line Synchronization (existing): MAX_SPREAD=8 +
  zentrale-nicht-höher
- Catenaccio: 5er-Block, Defender-Ceiling y=22, kein Pressing

### D) Reward v4 (für künftiges Training)
- CONCEDE_REWARD: -15 → -25
- TACKLE_WON: 1.5 → 3.0; im 16er: 3.0 → 6.0
- POSSESSION_LOSS_OWN_HALF: -2.0 → -3.0
- xG-Conceded-Delta (NEU): -15 × Δ pro Turn (dichtes Defense-Signal)
- Cleansheet-Bonus: +30 in computeTerminalReward
- Defensive-Tiefe-Malus: bis -1.5/Turn

### E) Mechanik-Korrekturen
- **xG-Tor-Kalibrierung**: BASE_SAVE_CHANCE 0.35 → 0.38
  (Tor:xG ratio 2:1 → näher an 1:1)
- **Tackle-Radius -70%**: BASE_RADIUS 6 → 1.8
  (defensiveRadius=85: 8.1 → 2.43; nur noch Disc-Disc-Kontakt)
- **cannotTackle nach gescheitertem Tackle**: vorher nur bei
  gewonnenem Tackle gesetzt; jetzt symmetrisch (Loser → cannotTackle)
- **Reception-Challenge**: nach erfolgreichem Pass-Empfang prüft
  applyPass auf Defender im Tackle-Radius des Empfängers → Tackle
- **ZM in 5 Position-Listen ergänzt**: getInterceptRadius,
  isMidfielder, fieldReading.midLabels, identity ownMidfield/oppMidfield,
  playerDecision Carrier-Penalty

### F) Set-Piece-Layout (Freistöße)
- Offensiver Freistoß:
  - Verteidiger rücken auf (y=58 statt 75 in Mittelfeld-Modus)
  - Short-Option NUR im Angriffsdrittel (max 1 Spieler nah am Schützen)
  - In Mittelfeld+eigener Hälfte: alle Spieler keep-out
    (SHOOTER_KEEPOUT_RADIUS=12)
- Defensiver Freistoß:
  - Rolle-basierte Aufstellung (LV=18, RV=82, IV-Slots zentral)
  - IVs am tiefsten (ownGoal-8 bzw. ballPos+14)
  - Wall-Modus: 4 Mids bilden Mauer + Rest rolle-positioniert

### G) Disc-Farben + Auswärts-Kit
- Pro Team: `color` (Heim) + `colorAlt` (Auswärts)
- `pickDiscColors(home, away)`: wenn Heim-Distanz < 110 →
  Auswärts wechselt auf colorAlt
- Plus pro Disc dynamische Text-Farbe (WCAG-Luminanz):
  helle Disc → schwarze Schrift, dunkle Disc → weiße Schrift
- Greift in: PlayerRenderer (Match), MatchPlanningScreen
  (Pitch + Mini-Pitch + Bench), Header

### H) Tier 2 Phase 1 — Off-Ball Movement-Policy Skeleton
**Architektur (option-basiert, NICHT 9 abstrakte Richtungen):**
- 10 semantische Action-Types: defensive_position,
  offensive_position, press_carrier, block_pass_lane, man_marking,
  cover_counter, overlap_run, cut_inside, support_carrier, stay
- Pro Spieler kontextabhängig 3-7 Optionen
- Sub-Heuristiken aus positioning/ als Sub-Skills wiederverwendet

**Files (TS):**
- `src/engine/ai/movement_policy/{types,options,features,manager,override,runner,heuristicMovementPolicy}.ts`

**Files (Python, in `ml/`):**
- `movement_features.py`, `movement_dataset.py`, `movement_model.py`

**Trajectory-Recording aktiv:**
- Pro Off-Ball-Spieler pro Turn ein Record
- Output in `*_movement.jsonl.gz` (parallel zum Carrier-File)
- Volumen ~10× Carrier (3000 Records vs ~180 pro Match)

**Default-Verhalten:**
- Heuristic-Policy = max-score-pick (= bisheriges Engine-Verhalten)
- ML-Policy noch nicht trainiert → Phase 2 ausstehend

### I) ML-Status
- **v3-pure (80 Iter)** + **League v3.5 (30 Iter)** trainiert,
  Resultat im `archive_v3/`
- Encoder v4 (ZM erweitert) macht alte Modelle inkompatibel —
  bewusste Entscheidung für sauberere Architektur
- Browser hat **keine** ONNX-Files mehr → Heuristik-Modus

## Roadmap

| Phase | Status |
|---|---|
| 1 — Heuristik | ✅ + heute substantiell verbessert |
| 2 — Behavior Cloning | ✅ |
| 3 — RL (v3 + League) | ✅ archiviert |
| 3 v4 — RL mit neuem Encoder | TODO via `nightly_v4.sh` |
| 4 — UI Match-Planning | ✅ |
| 5 — Tier 2 MARL Phase 1 (Skeleton) | ✅ |
| 5 — Tier 2 Phase 2 (BC auf Movement-Heuristik) | TODO (1-2 Tage) |
| 5 — Tier 2 Phase 3 (MAPPO) | TODO (3-4 Tage) |
| 5 — Tier 2 Phase 4 (Deploy + Eval) | TODO (1-2 Tage) |

## Performance-Benchmark

| Aufgabe | Zeit | Disk |
|---|---:|---:|
| 1 RR Heuristik (mit Movement-Recording) | ~30 s | 22 MB Carrier + 200 MB Movement |
| 1 RR ohne Recording | ~28 s | — |
| 1 PPO-Iter v3 (3 RR + Update) | ~110 s | — |
| Match (Browser, gegen Heuristik) | live | — |

## Arbeitsumgebung

- Repo: `~/Documents/tikitaq` — Branch `dev`
- Remote: `https://github.com/michmonhh/tikitaq.git`
- Dev-Server: `npm run dev` → http://localhost:5173 oder 5174
- Production-Build: `npm run build` (1.10 MB JS + 25 MB WASM)
- Arena-CLI: `npx tsx scripts/aiArena.ts --roundrobin`
- Mit Trajectory-Export (Carrier + Movement parallel):
  `--export-training out.jsonl.gz`
- Mit ML-Policy: `--bc-policy ml/checkpoints/rl_policy.onnx --sample`
- Nightly v4 (BC + RL + League): `caffeinate -i ./ml/nightly_v4.sh`

## Nächster konkreter Schritt

**Im Browser testen** (dev-Server läuft auf :5173 oder :5174):
1. Quick Game oder Arena starten
2. MatchPlanningScreen — Drag&Drop + Formations-Modal probieren
3. Match starten — neue Defense-Mechanik im Replay anschauen:
   - Tackles nur bei direktem Kontakt (≤ 2.5 Einheiten)
   - Reception-Challenge bei Pass-Empfang
   - Set-Piece-Aufstellung mit Defense aufgerückt
   - Disc-Farben automatisch differenziert (z.B. Bayern vs Mainz)

**Wenn alles passt:**
- Nightly Training: `caffeinate -i ./ml/nightly_v4.sh` →
  ~6h für vollen v4-Stack (BC + RL self-play + League)
- Plus parallel: Tier 2 Phase 2 (BC auf Movement-Heuristik) anstoßen,
  sobald genug Movement-Trajectories gesammelt

## Open Issues für später

- **GAE-λ statt MC-Returns** in `compute_returns()` — λ=0.95 würde
  Returns-Variance reduzieren. Wenn Plateau → nächster Hebel.
- **Reward-Normalisierung** über running stats (statt roh).
- **Tier 2 Coach-Conditioning**: Coach-Output in
  `movement_features.py:_encode_coach` ist noch Default-Werte
  (nur Intent kommt aus dem Record). TS-Recorder müsste Coach-State
  explizit anhängen — Priorität niedrig solange Heuristik dominiert.
- **Duel/Multiplayer-Planning**: aktuell läuft Duel via direktem
  `startMatch`, kein Planning-Screen — bräuchte Mehrspieler-Sync.

## Änderungen-Historie (heute, 2026-04-26)

Alle in `dev` gepusht. Neueste zuerst:

- **`91e068b`** — feat(colors): zweite Disc-Farbe pro Team + dynamischer Text-Kontrast
- **`91af6e2`** — fix(positions+tackle): ZM in alle Position-Listen + Tackle-Radius -70%
- **`6772c31`** — fix(pass): Tackle-Trigger beim Pass-Empfang (Reception-Challenge)
- **`2dc5c30`** — fix(tackle): cannotTackle nach gescheitertem Tackle setzen
- **`232c46a`** — fix(formations+setpiece): Aufstellungs-Staffelung + Defensive-FK-Rollen-Layout
- **`266d338`** — fix(setpiece): Short-Option NUR im Angriffsdrittel
- **`1fbef83`** — fix(setpiece): Freistoß-Defense aufrücken + max 1 Spieler nahe Schützen
- **`a24aa5b`** — feat(marl): Tier 2 Phase 1 — Off-Ball Movement-Policy Skeleton
- **`a39fe27`** — fix(ui): MatchPlanningScreen — Hover, Bench-Limit, Modal, Drag&Drop
- **`b3ff6d4`** — ops: nightly_v4.sh — autonomer Trainings-Pipeline-Wrapper
- **`6ea0771`** — feat(defense): Catenaccio + Reward v4 + Mechanik-Kalibrierung
- **`3d376a2`** — feat(ml): ROLE_LABELS um ZM erweitert (Encoder v4)

Davor (2026-04-25, RL v3 + League + Browser-Integration):
- `c7d28d0`, `8defaf4`, `a11173b`, `5e05c75`, `d739133`, `07227cc`,
  `b0488eb`, `1e0965f`, `a123690`, `204f646`

## Reward-Spec (v4-Stand)

```
Tor                         +15
Gegentor                    -25
Cleansheet (Match-Ende)     +30  ← neu v4
Sieg / Unentschieden / Niederlage  +20 / +5 / -10

xG-Delta eigenes Team        ×10
xG-Conceded-Delta            -15 × Δ  ← neu v4

Ballgewinn eigene Hälfte    +2.0
Ballgewinn gegn. Hälfte     +1.0
Ballverlust eigene Hälfte   -3.0 × (1 + conf/200) × end-game-mult  ← v4
Ballverlust gegn. Hälfte    -0.5 × (1 - conf/200) × end-game-mult

Tackle won (allgemein)      +3.0  ← v4 (vorher 1.5)
Tackle won im 16er          +6.0  ← v4 (vorher 3.0)
Schuss on target            +3.0
Schuss off target           +1.0
Ecke gewonnen               +2.0
Foul gezogen                +0.5
Pass in gegn. Box           +1.0
Box-Präsenz (eigene Stürmer) +0.15 × n (cap 3)

Defensive-Tiefe-Malus       bis -1.5 (Verteidiger zu nah am Stürmer)
Penalty verursacht          -8.0
Foul committed              -0.5
Gelbe Karte                 -2.0
Rote Karte                  -10.0

Anti-Hacking:
  3+ Ecken in Folge ohne Schuss  → Reward × 0.33
  3+ Fouls gezogen in Folge       → Reward × 0.5
  6+ Rückpässe in Folge           → -0.2 pro weiterem
```
