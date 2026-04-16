# TIKITAQ — Projekt-Kontext für Claude

TIKITAQ ist ein rundenbasiertes Fußballspiel (1v1 taktisch, Canvas-gerendert) mit Singleplayer vs. KI und Online-Duellen via Supabase. Zielplattformen: Web (Cloudflare Pages) + Mobile (Capacitor, iOS/Android). Alles responsiv für Handy und Desktop.

## Stack

- **React 19** + **TypeScript 5.9** (strict, `noUnusedLocals`/`noUnusedParameters` aktiv)
- **Zustand 5** für State (ein Store pro Domäne)
- **Canvas 2D** für Feld/Spieler/Ball-Rendering (keine WebGL/SVG)
- **Supabase** für Auth + Echtzeit-Match-Sync
- **Vite 8** als Build, **Wrangler** für Cloudflare-Deploy
- **Capacitor** für Mobile (`capacitor.config.ts` am Root)
- CSS Modules pro Komponente + globale Tokens unter `src/styles/`

## Verzeichnis-Map

```
src/
  main.tsx                 React-Root, SW-Unregister
  App.tsx                  Auth-Gate + Screen-Switch
  canvas/                  Imperative Klassen: Camera, PitchRenderer,
                           PlayerRenderer, BallRenderer, OverlayRenderer,
                           PossessionArrowRenderer, Animator, InputHandler
  components/              UI-Bausteine (Button, Modal, TeamCard,
                           TeamEditor, TeamSelector, GameSidebar)
                           → jeweils .tsx + .module.css
  data/                    Statische Daten (teams, players, tickerTexts,
                           teamOverrides)
  debug/                   Dev-Tools (TestMenu, testScenarios) — ungetrackt,
                           in tsconfig.app.json excluded, nicht im Prod-Build
  engine/                  Pure Spiel-Logik (keine React/DOM-Imports)
    ai/                    KI: index (Orchestrator), teamPlan, playerDecision,
                           positioning, fieldReading, identity, memory,
                           setPiece/setPieceCorner/setPieceFreeKick/
                           setPiecePenalty/setPieceThrowIn/setPieceHelpers
    geometry, constants, types, movement, passing, shooting, tackle,
    turn, formation, confidence, playerName
  hooks/                   useGameLoop (bindet canvas+input+store),
                           useCanvas (Resize), useMatchSync (Supabase)
  lib/supabase.ts          Supabase-Client
  screens/                 Intro, Auth, MainMenu, QuickGame, Duel, Match
  stores/                  gameStore (Match-State),
                           authStore (Supabase-Auth),
                           uiStore (Screen-Routing)
  styles/                  reset.css, variables.css
```

## Daten-/Kontroll-Fluss

`main.tsx → App.tsx → Screen` — Routing via `uiStore.screen`.
Match-Flow: `MatchScreen → useGameLoop(canvasRef) → gameStore` (State) + `canvas/*` (Render) + `InputHandler` (Pointer/Touch) + `engine/*` (Pure Logik) + `engine/ai/*` (KI-Entscheidungen). Animator sequenziert Übergänge.

Zustand-Store-Muster: Actions mutieren immutable über `set(state => …)`. Pure Engine-Funktionen erhalten `GameState`, geben neuen `GameState` oder Result-Objekt zurück — Store verdrahtet nur.

## Build & Verifikation

```bash
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build
npm run lint     # eslint .
npm run preview  # Vite preview
npm run deploy   # Wrangler deploy (Cloudflare)
```

**Vor jedem Commit Pflicht:** `npx tsc -b && npx vite build` muss clean durchlaufen. Chunk-Size-Warning (>500 kB) ist bekannt und aktuell toleriert.

Dev-Hilfsserver am Root: `dev-server.mjs` (Vite mit HMR, Port 5175), `preview-server.mjs` (Prod-Build, Port 4174).

CLI-Simulatoren für KI-Tuning unter `scripts/` (ungetrackt, via `tsx scripts/<file>.ts`).

## Hausregeln

- **Kein `git push` ohne ausdrückliche Anweisung.** Commits sind ok, Push nur auf explizite Bitte.
- **Alle Funktionen bleiben erhalten.** Refactors sind Struktur-Umordnung, keine Verhaltens-Änderungen. Splits großer Module gehen über Re-Export-Shims, damit Call-Sites unverändert bleiben.
- **Multi-Platform & Responsive MÜSSEN intakt bleiben.** Capacitor-Config, `public/`, `src/styles/`, `src/components/` (CSS-Modules) und die Canvas/Input-Pipeline nicht strukturell anrühren.
- **Deutsche Kommentare sind ok** (sind teils idiomatisch, v.a. FIFA-Regel-Kommentare). Englisch/Deutsch-Mix akzeptiert.
- **`engine/` ist pure.** Keine React-, DOM- oder Store-Imports dort. `canvas/` ist imperativ, klassenbasiert.
- **Keine neuen Dependencies ohne Absprache.** Aktuell nur `react`, `react-dom`, `zustand`, `@supabase/supabase-js` als Runtime-Deps.
- **Tests:** Es gibt aktuell keinen Test-Runner. Verifikation läuft über `tsc -b`, `vite build`, und manuelles Durchspielen.
- **Keine Prosa-Docs im Code.** Kommentare nur bei nicht-offensichtlichem Warum (FIFA-Regel-Referenzen, subtile Invarianten).

## Konventionen

- **Set-Piece-Phasen** (`free_kick`/`corner`/`throw_in`): Direkt-Pass durch den Ausführenden, kein Button. `kickoff` behält expliziten Button. Ausführender-Team wird über `ballOwnerId` bestimmt, nicht über `currentTurn` (MatchScreen kann das für UI-Zwecke temporär flippen — siehe `confirmKickoff`-Kommentar).
- **Abseits-Freistoß** an Empfänger-Position (FIFA Law 12).
- **Pass-Logik:** `applyPass()` in `engine/passing.ts` ist Single-Entry. Interception/Offside/Out-of-Bounds/Through-Ball sind dort zentralisiert.
- **KI-Einstieg:** `engine/ai/index.ts` (`executeAITurn`, `getAIReasoning`, `initAIPlan`, `getAITickerMessages`).
- **Feldkoordinaten:** `y=0` ist Team-2-Tor, `y=100` ist Team-1-Tor. Pitch-Grenzen in `engine/constants.ts` (PITCH).

## Laufende Arbeit

- **Code-Cleanup läuft:** siehe `Handoff.md` (Strategie in 4 Phasen). Phase 1 (Dead Code + archivierte Verzeichnisse) erledigt, Phase 2 (diese Datei) in Arbeit, Phase 3 (Splits von `gameStore.ts`, `ai/positioning.ts`, `ai/playerDecision.ts`) steht an.
- **KI-Neuaufbau** nach Plan unter `~/.claude/plans/snuggly-frolicking-cray.md` (Drei-Schichten-Modell: Mannschaftsplan → Spielerentscheidung → Positionierung + Memory-Service). `src/engine/ai/` ist bereits der aktive Ersatz und teilweise aufgebaut.

## Ungetrackte Dateien im Baum

Bewusst ungetrackt, **nicht ohne Nachfrage committen**:

- `Handoff.md` — rolling Handoff-Dokument
- `scripts/` — KI-Simulator-CLIs (Tool, kein Produkt-Code)
- `src/debug/` — Dev-Only-Test-UI
- `preview-server.mjs` — Dev-Hilfsserver

`OLD/` und `.claude/` sind per `.gitignore` ausgeschlossen.
