# TIKITAQ — Liga-Modus Konzept

Stand: 2026-04-18. Konzept zur Umsetzung des Liga-/Saison-Modus. Keine Implementierung, kein Code — reines Design-Dokument. Als Referenz bei der späteren Umsetzung.

---

## 0. Festgezurrte Entscheidungen

- **Eine** Saison gleichzeitig.
- **Keine Quick-Sim** für User-Spiele — jedes User-Spiel wird manuell gespielt. Nur gegnerische Spiele des Spieltags werden per Button simuliert.
- **Zonen-Regel 1. Liga**: Plätze 1–4 Champions League, 5 Europa League, 6 Conference League, 16 Relegation, 17–18 Abstieg.
- **Formsystem**: Nur Team-Form (letzte 5 Ergebnisse), keine Spieler-Form/Verletzungen/Sperren in Phase A.
- **Torschützenliste** ab Phase A (siehe §8).
- **Persistenz**: Cross-Device via Supabase ab Phase A (siehe §7), kein localStorage-Fallback.
- **2. Liga**: Teams + Rosters werden erst angelegt, wenn Phase A steht.
- **3. Liga**: 20 Teams (wie real).
- **Hero League / Continental League**: Platzhalter im Menü, Inhalt später.

---

## 1. Domäne & Namensgebung

Der Menüeintrag **SEASON** existiert bereits (`src/screens/MainMenuScreen.tsx`, Zeilen 13–19, aktuell disabled als „Coming Soon"). Er wird das Einstiegstor.

- **Interner Key**: `season`
- **UI-Label (DE)**: „Saison" / „Liga"
- **WORLD LEAGUE** im Menü wird später die Dach-UI für **Hero League + Continental League**.

---

## 2. Datenmodell (neu)

### 2.1 Liga-Definitionen — `src/data/leagues.ts`

```ts
export type LeagueId = 'de1' | 'de2' | 'de3' | 'hero' | 'continental';

export type ZoneKind =
  | 'champions'           // CL
  | 'europe-a'            // EL
  | 'europe-b'            // UCL (Conference)
  | 'promotion'           // Direkter Aufstieg
  | 'promotion-playoff'   // Aufstiegs-Relegation
  | 'relegation-playoff'  // Abstiegs-Relegation
  | 'relegation'          // Direkter Abstieg
  | 'neutral';

export type LeagueZone = {
  from: number;      // 1-basiert, inkl.
  to: number;        // 1-basiert, inkl.
  kind: ZoneKind;
  label: string;     // z.B. "Champions League"
  color: string;     // UI-Farbstreifen links in Tabelle
};

export type LeagueDef = {
  id: LeagueId;
  name: string;         // "1. Liga"
  shortName: string;    // "1L"
  tier: number;         // 1, 2, 3
  teamCount: number;    // 18, 18, 20
  teamIds: number[];    // Pool-Referenz
  zones: LeagueZone[];
};
```

**1. Liga Zonen (phase A)**:
```
1-4   champions            CL          #0B3D91
5     europe-a             EL          #F39200
6     europe-b             Conference  #00B050
16    relegation-playoff   Relegation  #D46A1E
17-18 relegation           Abstieg     #C0392B
```

### 2.2 Team-Erweiterung — `src/data/teams.ts`

Additiv, bricht nichts:
```ts
interface Team {
  // … bestehende Felder …
  leagueId: LeagueId;
}
```

Alle 18 aktuellen Teams (IDs 0–17) bekommen `leagueId: 'de1'`.

**ID-Bereiche für neue Teams**:
- 2. Liga: `100+` (Plätze 100–117)
- 3. Liga: `200+` (Plätze 200–219)
- International (Hero/Continental): `1000+`

Garantiert kollisionsfrei mit bestehenden 0–17.

---

## 3. Saison-State

### 3.1 Store — `src/stores/seasonStore.ts`

Neuer Store, analog bestehender Struktur (ein Store pro Domäne). Persistierung via `zustand/middleware` → `persist()` (ist in Zustand 5 enthalten, **keine neue Dependency**).

```ts
type Season = {
  id: string;                   // "de1-2025/26"
  leagueId: LeagueId;
  year: number;                 // 2025 (für Saisonlabel "2025/26")
  userTeamId: number;
  currentMatchday: number;      // 1..34 (bei 18 Teams), 1..38 (bei 20 Teams)
  schedule: Fixture[];
  results: MatchResult[];       // alle gespielten + simulierten Matches
};

type Fixture = {
  id: string;                   // "md01-0v1"
  matchday: number;
  homeId: number;
  awayId: number;
};

type MatchResult = {
  fixtureId: string;
  matchday: number;
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
  simulated: boolean;           // false = vom User live gespielt
  goalScorers: GoalEntry[];     // siehe §8
  stats?: MatchStatsSnapshot;   // optional, nur bei Live-Matches
};

type GoalEntry = {
  playerName: string;           // denormalisiert, roster-Änderungen brechen nichts
  playerId?: string;            // optional, für spätere Profile
  teamId: number;
  minute?: number;              // bei Live-Matches exakt, bei sims per Zufall 1-90
  ownGoal?: boolean;
};
```

### 3.2 Store-Actions

```ts
type SeasonStore = {
  season: Season | null;

  // Lifecycle
  startSeason(leagueId: LeagueId, userTeamId: number): void;
  abortSeason(): void;                     // mit Confirmation-Modal
  advanceMatchday(): void;                 // für Tests / Debug

  // Nach User-Match
  finishUserMatch(result: MatchResult): void;
  simulateRemainingOfMatchday(): void;     // simuliert alle Nicht-User-Spiele des current matchday

  // Ganzer Spieltag simulieren (wenn User-Team Freilos/Pause — beim Hinrunden-Muster nie, aber für Sicherheit)
  simulateCurrentMatchday(): void;
};
```

### 3.3 Abgeleitete Selektoren (keine Persistenz)

- `getStandings(season): StandingsRow[]` — Tabelle aus `results`.
- `getForm(season, teamId): MatchOutcome[5]` — letzte 5 Spiele.
- `getTopScorers(season, limit=20): Array<{playerName, teamId, goals}>` — aus `results[].goalScorers`.
- `getFixturesForMatchday(season, md): Fixture[]`.
- `getUserFixtureForMatchday(season, md): Fixture | null`.

```ts
type StandingsRow = {
  teamId: number;
  played: number;
  won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number;
  goalDiff: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
  rank: number;
  zone?: ZoneKind;                    // berechnet aus LeagueDef.zones
};
```

**Sortierung**: Punkte → Tordifferenz → erzielte Tore → alphabetisch (direkter Vergleich erst in Phase B).

---

## 4. Simulations-Engine

### 4.1 Lokation

`src/engine/simulation/simulateMatch.ts` — pure, keine React-/Store-Imports, folgt `engine/`-Hausregel.

### 4.2 Formel (Phase A)

```
attack   = team.levels.att * 0.45 + team.levels.mid * 0.30 + team.levels.def * 0.25
defense  = team.levels.def * 0.60 + team.levels.tw  * 0.40

homeBonus        = +3 auf attackHome
formDeltaHome    = clamp(-5, +5) aus letzten 5 Spielen (W=+2, D=0, L=-2)
formDeltaAway    = dito

rawAttHome = attackHome + homeBonus + formDeltaHome
rawAttAway = attackAway + formDeltaAway

k         = 0.028  // kalibriert so dass Ø ~2.8 Tore/Spiel
xGHome    = clamp(0.3, 4.5, k * rawAttHome * (100 - defenseAway) / 100 * matchupAdjust)
xGAway    = clamp(0.25, 4.0, k * rawAttAway * (100 - defenseHome) / 100 * matchupAdjust)

goalsHome = poissonSample(xGHome)
goalsAway = poissonSample(xGAway)
```

**Poisson-Sampling**: simple Inverse-Transform, kein neues Package. Implementation ca. 15 Zeilen in `engine/simulation/poisson.ts`.

### 4.3 Seed / Determinismus

Optional: `simulateMatch(home, away, {seed?: number})` — für Replays/Debug. RNG-Helper in `engine/simulation/rng.ts` (Mulberry32, ~5 Zeilen).

### 4.4 Kalibrierung

Nach Implementierung: Via `scripts/simulateSeason.ts` (neues CLI-Tool, ungetrackt analog bestehender Sim-CLIs) eine Saison mit allen 18 Teams durchsimulieren und prüfen:
- Ø Tore/Spiel: 2.5 – 3.2
- Heimquote: 44–48%
- Unentschieden: 22–28%

Falls die Werte abweichen, `k` und `homeBonus` nachjustieren.

---

## 5. Integration in Match-Flow

### 5.1 `MatchConfig`-Erweiterung

In `src/stores/uiStore.ts`:
```ts
interface MatchConfig {
  // … bestehende Felder …
  seasonMatchId?: string;   // Fixture.id
}
```

### 5.2 Match-Start aus der Saison

Aus `SeasonScreen` → Button `[SPIELEN]` → `uiStore.startMatch({ team1Id, team2Id, isVsAI: true, isDuel: false, seasonMatchId })`.

### 5.3 Match-Ende-Hook

In `src/screens/MatchScreen.tsx` (heute prüft das Zeile 60 `state.phase === 'full_time'`):

```ts
if (phase === 'full_time' && matchConfig.seasonMatchId) {
  const result: MatchResult = buildUserMatchResult(state, matchConfig.seasonMatchId);
  seasonStore.finishUserMatch(result);
  seasonStore.simulateRemainingOfMatchday();
  uiStore.navigate('season');
}
```

`buildUserMatchResult()` extrahiert:
- `homeGoals`, `awayGoals` aus `state.score`
- `goalScorers` aus Match-Event-Log (falls nicht vorhanden: leer, später ergänzen)
- `stats` optional aus `state.matchStats`

**Keine Änderung an `engine/`-Logik**. Der Hook liegt ausschließlich im Store/Screen.

---

## 6. UI / Screens

### 6.1 Neue Screens

Erweiterung `src/stores/uiStore.ts` `Screen`-Typ um `'season-setup' | 'season'`.

### 6.2 `SeasonSetupScreen`

Einmalig bei erster Saison:
1. Liga wählen (nur `de1` aktiv, `de2`/`de3` disabled "Coming Soon")
2. Team wählen — bestehender `TeamSelector` (filter auf `leagueId`)
3. Button `[SAISON STARTEN]`

### 6.3 `SeasonScreen` — Haupt-Hub

Mobile-first Tab-Layout (horizontal scrollable Tab-Bar):

| Tab | Inhalt |
|---|---|
| **Tabelle** | `StandingsTable` — Zonen-Farbstreifen links, User-Team hervorgehoben, Form-Dots (letzte 5) rechts |
| **Spieltag** | Aktueller Matchday. Zuerst das User-Spiel mit `[SPIELEN]`, darunter alle anderen Paarungen mit `[SIMULIEREN]` (simuliert alle übrigen dieses Spieltags in einem Rutsch) |
| **Ergebnisse** | Liste vergangener Spieltage, klickbar für Matchday-Detail mit allen Paarungen und Ergebnissen |
| **Spielplan** | Übersicht aller Spieltage (horizontal oder vertikal scrollbar) |
| **Torjäger** | `TopScorersList` — sortiert nach Toren (Phase A neu, siehe §8) |
| **Team** | User-Team-Karte + Saison-Statistiken (Tabellenplatz, Tore, Gegentore, Punkteschnitt) |

### 6.4 Neue Komponenten

- `StandingsTable` (`src/components/StandingsTable/`) — Tabelle mit Zonen-Markierung
- `MatchdayList` (`src/components/MatchdayList/`) — Fixture-Liste
- `ResultRow` (`src/components/ResultRow/`) — einzelne Ergebnis-Zeile
- `TopScorersList` (`src/components/TopScorersList/`) — Torschützenliste

Wiederverwendung: `TeamCard`, `TeamSelector` bleiben unverändert.

### 6.5 MainMenu-Update

`src/screens/MainMenuScreen.tsx`: **SEASON** freischalten. `WORLD LEAGUE` bleibt disabled bis Hero League umgesetzt ist.

---

## 7. Persistenz (Cross-Device, Supabase ab Phase A)

### 7.1 Schema

Neue Migration `supabase/migrations/20260418_season.sql`:

```sql
create table public.seasons (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade not null,
  league_id         text not null,                 -- 'de1' | 'de2' | 'de3' | …
  year              int  not null,                 -- 2025 (für Label "2025/26")
  user_team_id      int  not null,
  current_matchday  int  not null default 1,
  schedule          jsonb not null,                -- Fixture[]
  results           jsonb not null default '[]'::jsonb,  -- MatchResult[]
  status            text not null default 'active',      -- 'active' | 'completed' | 'abandoned'
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Jeder User hat maximal eine aktive Saison
create unique index seasons_user_active_unique
  on public.seasons(user_id)
  where status = 'active';

-- RLS: jeder sieht/ändert nur seine eigenen Saisons
alter table public.seasons enable row level security;

create policy "seasons_select_own"
  on public.seasons for select
  using (auth.uid() = user_id);

create policy "seasons_insert_own"
  on public.seasons for insert
  with check (auth.uid() = user_id);

create policy "seasons_update_own"
  on public.seasons for update
  using (auth.uid() = user_id);

create policy "seasons_delete_own"
  on public.seasons for delete
  using (auth.uid() = user_id);

-- updated_at automatisch pflegen
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger seasons_set_updated_at
  before update on public.seasons
  for each row execute function public.set_updated_at();
```

Hinweis: `set_updated_at()` ggf. schon aus früheren Migrationen vorhanden — `create or replace` ist idempotent.

### 7.2 Client-Flow

- **App-Start** (nach Login): `seasonStore.hydrate()` → `SELECT * FROM seasons WHERE user_id = auth.uid() AND status = 'active' LIMIT 1`. Wenn vorhanden, in lokalen Store laden.
- **Saison starten**: `INSERT` → lokalen State aus Response hydrieren.
- **User-Match fertig / Spieltag simuliert**: Lokaler State sofort aktualisiert (optimistisch), parallel `UPDATE seasons SET schedule, results, current_matchday, status WHERE id = $1`.
- **Saison beenden** (alle Spieltage durch): `UPDATE status = 'completed'`. Damit fällt der Eindeutigkeits-Constraint für die nächste Saison weg.
- **Saison abbrechen** (User-Confirmation): `UPDATE status = 'abandoned'`.

### 7.3 Offline-Verhalten

Phase A ist **online-only** (wie bereits Duel + Perfect Run). Wenn Supabase-Calls fehlschlagen:
- Lesen: Fehler-Screen mit Retry-Button.
- Schreiben: Lokaler State bleibt korrekt, User bekommt Toast „Synchronisation fehlgeschlagen, erneut versuchen"; Action wird beim nächsten erfolgreichen Call mit-übertragen (simple in-memory Queue, kein komplexes Offline-System).

Vollständiges Offline-Queuing / Conflict-Resolution: out of scope.

### 7.4 Kein localStorage als Fallback

Um Divergenz (zwei Geräte, zwei Saisons) zu vermeiden, **keine** lokale Persistenz. Die Cloud ist die Single Source of Truth. Sessionsverlust im Browser (Reload) wird über Hydrate beim App-Start neu aufgebaut.

---

## 8. Torschützensystem

### 8.1 Motivation

Nutzer will Torjägerliste ab Phase A. Live-Matches kennen den echten Torschützen. Simulierte Matches müssen Tore auf Spieler verteilen.

### 8.2 Attribution in simulierten Matches

Jedes simulierte Tor wird einem Spieler des torschießenden Teams zugeordnet. Gewichtung:

| Positionsgruppe | Grund-Anteil | Gewicht pro Spieler |
|---|---|---|
| Stürmer (ST) | 62% | `finishing` |
| Offensives Mittelfeld (OM) | 15% | `finishing * 0.8` |
| Außenbahn (LM, RM) | 10% | `finishing * 0.7` |
| Defensives Mittelfeld (ZDM) | 6% | `finishing * 0.5` |
| Abwehr (4er-Kette) | 5% | `finishing * 0.4` |
| Eigentor (gegnerischer Verteidiger) | 2% | uniform |

Implementation: `engine/simulation/attributeGoal.ts` — pure, deterministisch mit Seed.

### 8.3 Live-Match-Attribution

Aktuell hat `gameStore` Scoring-Events (`makeShoot`). Prüfen ob dort der Schütze identifizierbar ist — falls ja: `state.goalScorers` als Array mitpflegen. Falls der heutige Shoot-Handler das noch nicht explizit tut, minimaler Eingriff ergänzen:

```ts
// in engine/shooting.ts oder im shoot-Action
state.goalScorers.push({
  playerName: shooter.name,
  teamId: shooter.teamId,
  minute: state.minute,
});
```

Dann in `buildUserMatchResult()` nur übernehmen.

### 8.4 Torjägerliste

Selektor `getTopScorers(season, limit)`: aggregiert aus `season.results[].goalScorers`, gruppiert by `playerName + teamId`, absteigend sortiert nach Tor-Count.

---

## 9. Liga-Regeln

### 9.1 Punktesystem (FIFA/DFB)
- Sieg: 3 Punkte
- Remis: 1 Punkt
- Niederlage: 0 Punkte

### 9.2 Tabellensortierung
1. Punkte (absteigend)
2. Tordifferenz (absteigend)
3. Erzielte Tore (absteigend)
4. Alphabetisch nach `shortName` (Phase A — direkter Vergleich später in Phase B)

### 9.3 Auf- und Abstieg (ab Phase B)

**1. ↔ 2. Liga**:
- 1. Liga Platz 17–18: Direkter Abstieg
- 1. Liga Platz 16: Relegation gegen 3. der 2. Liga
- 2. Liga Platz 1–2: Direkter Aufstieg
- 2. Liga Platz 3: Relegation gegen 16. der 1. Liga

**2. ↔ 3. Liga** (ab Phase C):
- 2. Liga Platz 17–18: Direkter Abstieg
- 3. Liga Platz 1–2: Direkter Aufstieg

Relegations-Spiele: ausgetragen als Hin-/Rückspiel mit eigenem Mini-Screen, nach dem regulären Saisonende.

### 9.4 Spielplan-Erzeugung

Round-Robin (Circle Method):
- 18 Teams → 34 Spieltage (Hin- + Rückrunde)
- 20 Teams → 38 Spieltage
- Heim-/Auswärts-Balance: jeder Team spielt gegen jeden anderen einmal zu Hause, einmal auswärts

Implementation: `engine/simulation/scheduler.ts` — pure Funktion `createRoundRobin(teamIds): Fixture[]`.

---

## 10. Phasenplan

### Phase A — Grundgerüst (nur 1. Liga)

1. `supabase/migrations/20260418_season.sql` — `seasons`-Tabelle + RLS + Trigger.
2. `src/data/leagues.ts` mit `LeagueDef` und Zonen-Regel für `de1`.
3. `src/data/teams.ts`: `Team.leagueId = 'de1'` für alle 18 Teams.
4. `src/engine/simulation/` — `simulateMatch.ts`, `poisson.ts`, `rng.ts`, `scheduler.ts`, `attributeGoal.ts`.
5. `src/stores/seasonStore.ts` mit Supabase-Client (`hydrate`, `startSeason`, `finishUserMatch`, `simulateRemainingOfMatchday`, `abortSeason`).
6. Tor-Event-Pflege in Live-Matches (`state.goalScorers`).
7. UI-Screens: `SeasonSetupScreen`, `SeasonScreen` (Tabs: Tabelle, Spieltag, Ergebnisse, Spielplan, Torjäger, Team).
8. Neue Komponenten: `StandingsTable`, `MatchdayList`, `ResultRow`, `TopScorersList`.
9. MainMenu: **SEASON** freischalten.
10. `MatchConfig.seasonMatchId?` + Match-Ende-Hook in `MatchScreen`.
11. `scripts/simulateSeason.ts` zur Kalibrierung (Ø Tore, Heimquote).

**Testbar**: volle Saison (34 Spieltage) mit 1. Liga spielbar, Tabelle + Form + Torjägerliste live.

### Phase B — 2. Liga + Auf-/Abstieg

11. `src/data/teams2.ts` + `src/data/players2.ts` (18 fiktive Vereine + 11-Mann-Rosters).
12. Liga-Def `de2` aktiv schalten.
13. Saisonende-Logik: Auf-/Abstieg, neue Saison mit aktualisierten Liga-Zugehörigkeiten.
14. Relegations-Mini-UI (Hin-/Rückspiel).
15. Direkter Vergleich als 4. Sortierkriterium.

### Phase C — 3. Liga

16. `src/data/teams3.ts` + `src/data/players3.ts` (20 Vereine + Rosters).
17. Liga-Def `de3` aktiv schalten.
18. Auf-/Abstieg 2. ↔ 3. Liga.

### Phase D — Hero League / Continental League

19. `src/data/teamsInternational.ts` + Rosters (Teams später — Nutzer legt sie an).
20. Hero League + Continental League unter `WORLD LEAGUE`-Einstieg.
21. Internationales Zonen-/Qualifikations-System.

---

## 11. Betroffene und neue Dateien (Übersicht)

### Neu (Phase A)
```
supabase/migrations/20260418_season.sql
src/data/leagues.ts
src/engine/simulation/simulateMatch.ts
src/engine/simulation/poisson.ts
src/engine/simulation/rng.ts
src/engine/simulation/scheduler.ts
src/engine/simulation/attributeGoal.ts
src/stores/seasonStore.ts
src/screens/SeasonSetupScreen.tsx
src/screens/SeasonScreen.tsx
src/components/StandingsTable/StandingsTable.tsx + .module.css
src/components/MatchdayList/MatchdayList.tsx + .module.css
src/components/ResultRow/ResultRow.tsx + .module.css
src/components/TopScorersList/TopScorersList.tsx + .module.css
scripts/simulateSeason.ts   (ungetrackt, Kalibrier-Tool)
```

### Editiert (Phase A)
```
src/data/teams.ts                   // Team.leagueId
src/data/players.ts                 // unverändert, wird von simulateMatch importiert
src/stores/uiStore.ts               // Screen-Typ + MatchConfig.seasonMatchId
src/screens/MainMenuScreen.tsx      // SEASON freischalten
src/screens/MatchScreen.tsx         // Match-Ende-Hook
src/App.tsx                         // Routing für neue Screens
```

### Unverändert / nicht anzurühren
```
src/canvas/**                       // keine Änderung
src/engine/ai/**                    // keine Änderung
src/engine/passing/**               // keine Änderung
src/engine/shooting.ts              // ggf. goalScorer-Event ergänzen (minimal)
src/stores/gameStore.ts             // ggf. goalScorer-Event ergänzen (minimal)
```

---

## 12. Offene Punkte für später (out of scope)

- **Hero League / Continental League** — internationale Teams, eigener Pokal-Modus (Gruppenphase + KO)
- **Echte Supabase-Persistenz** — Cross-Device, Multi-Season-History
- **Spielerverletzungen/-sperren** — sobald Spieler-Form eingebaut wird
- **Transfermarkt** — Sommer-/Winterpause mit Transfers zwischen Ligen
- **Pokal-Modus** (DFB-Pokal-Äquivalent) — parallel zur Liga-Saison
- **Saison-Historie** — Meister/Absteiger der letzten 10 Saisons, Rekorde
- **Direkter-Vergleich-Sortierung** in der Tabelle (ab Phase B)
- **Live-Matchday-Übersicht** — alle User- und Sim-Spiele eines Matchdays synchron mit Phantom-Ticker
- **Form-Gewichtung konfigurierbar** — aktuell Konstanten, später evtl. Difficulty-Setting

---

## 13. Design-Prinzipien

- **Bestehende Funktionen bleiben intakt** — Liga ist additiv, nicht invasiv.
- **`engine/` bleibt pure** — auch `engine/simulation/`. Keine React-/Store-/DOM-Imports.
- **Keine neuen Runtime-Dependencies** — `zustand/persist` ist eingebaut, Poisson und RNG werden minimal selbst implementiert.
- **Multi-Platform intakt** — keine neuen Plattform-spezifischen APIs. `localStorage` funktioniert in Web und Capacitor.
- **Mobile-First UI** — Tab-Layout der `SeasonScreen`, scrollbare Tabelle, Touch-große Buttons.
- **Single-Entry pro Action** — `seasonStore` hat klare öffentliche Actions, keine verteilte Logik.
