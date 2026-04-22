# Briefing: Rundenbasiertes Fußball mit MARL – Browser/Mobile

## Ziel
Rundenbasiertes Fußballspiel mit gelernter KI. Training offline, Inferenz im Browser/auf Mobilgeräten. Modell < 1 MB, Entscheidung < 1 ms pro Spieler auf mittelmäßigen Handys.

## Ausgangslage: Bestehender Code

Es existiert bereits eine Codebase mit:
- **Spielengine** (rundenbasiert, mit angelegten Mannschaften inkl. Spielern und Qualitäten)
- **KI1**: eine bereits entwickelte KI auf einem gewissen Stand, die gegen die angelegten Mannschaften spielt

**Rolle von KI1 im Projekt**
- KI1 ersetzt die im Briefing genannte „scripted Baseline-AI"
- KI1 ist Referenz-Gegner für das PPO-Training (Start-Phase)
- KI1 ist Eval-Maßstab: „Ist die gelernte Policy besser als KI1?"
- KI1 liefert Trajektorien für Imitation-Learning-Pretraining (siehe Abschnitt Plausibilität)
- KI1 liefert die Referenzverteilung für KL-Penalty im PPO (optional)

**Wichtig für Claude Code**
- KI1 und die bestehende Engine sind zu referenzieren, nicht neu zu schreiben
- Vor jeder größeren Änderung den Bestand lesen und verstehen
- Erweiterungen (Formationen, Feature-Encoder, Training-Loop) so ansetzen, dass bestehende Mechanik intakt bleibt
- Falls die Engine fürs vectorized Training nicht schnell genug ist: headless Trainings-Variante erstellen, die mit der Original-Engine deterministisch identisch bleibt (Paritäts-Tests)

## Architektur-Eckpunkte

**Trennung Training / Inferenz**
- Training: Python (PyTorch), lokal oder Colab
- Export: ONNX, int8-quantisiert
- Inferenz: ONNX Runtime Web oder TensorFlow.js

**Hierarchische Policy (Kern-Scope)**
- **Spieler-Policy**: entscheidet pro Zug (bewegen, passen, schießen, etc.). Eine einzige Policy für alle Spieler, Rolle als Input-Feature (Parameter-Sharing).
- **Coach-Policy**: entscheidet seltener (z. B. alle N Runden oder bei Trigger-Events wie Gegentor, Rote Karte, Spielphasen-Wechsel). Wählt Formation, Risiko, Aggressivität, Pressinghöhe.

**Modellgröße**
- Spieler-Policy: MLP mit 2–3 Hidden Layers, 64–128 Units
- Coach-Policy: kleineres MLP, diskreter Aktionsraum (z. B. 6 Formationen × 3 Risikostufen = 18 Aktionen)
- Beide reine Feedforward-Netze, keine Suche zur Laufzeit

## Formationen als Datenstruktur

Formationen sind **reine Daten, kein Code**. Eine Formation = Tabelle mit Sollpositionen pro Rolle, getrennt für Offensive und Defensive:

```
Formation = {
  name: "4-3-3",
  roles: [
    { role: "GK",  anchor_attack: [0.05, 0.5],  anchor_defense: [0.02, 0.5] },
    { role: "LB",  anchor_attack: [0.35, 0.15], anchor_defense: [0.20, 0.15] },
    ...
  ],
  compactness: { vertical: 0.6, horizontal: 0.7 }
}
```

Neue Formationen = neue Tabellenzeilen, kein neuer Code. Die Policy sieht immer nur „meine Sollposition ist (x, y)" und generalisiert über beliebige Formationen.

## State-Repräsentation (ego-zentrisch pro handelndem Spieler)

- Eigene Position, Qualitäten, Rolle (one-hot)
- **Eigene Sollposition** (Formation-Anker für aktuellen Ballbesitzzustand)
- **Offset zur Sollposition** (wie weit weicht der Spieler gerade ab)
- **Formation-Kompaktheit** (vertikale/horizontale Streckung als Skalare)
- Distanz/Winkel zum Ball
- Distanz zu nächstem Gegner pro Rolle
- Distanz zu nächstem Mitspieler pro Rolle
- Team-Strategie: Risiko, Aggressivität, Pressinghöhe
- Spielkontext: Spielstand, verbleibende Runden, Ballbesitz
- Ziel: 30–50 Features, strukturiert, keine Rohkoordinaten-Listen

## Aktionen

**Spieler-Policy (diskret, pro Rolle maskiert)**
- Bewegung in N Richtungen, Pass kurz/lang/zu Rolle X, Schuss, Dribbling, Pressen, Halten
- Torwart hat kein „Schuss aufs Tor", etc.

**Coach-Policy (diskret)**
- Formation (aus Pool definierter Formationen)
- Risikostufe, Aggressivität, Pressinghöhe

## Trainingsverfahren

**PPO mit Self-Play für Spieler-Policy**
- Start gegen KI1 (bestehende Baseline, siehe Ausgangslage)
- Self-Play + League (aktuelle Policy vs. KI1-Varianten vs. eingefrorene ältere Checkpoints) einschalten, sobald KI1 geschlagen wird
- Parameter-Sharing über alle Spieler eines Teams

**Coach-Policy**
- Anfangs scripted (z. B. regelbasiert: bei Rückstand in Schlussphase → offensivere Formation)
- Später separate gelernte Policy (PPO oder DQN), trainiert mit Team-Reward

**Formation in der Trainingsverteilung**
- Zufällig Formationen pro Team samplen, nicht immer 4-3-3 vs. 4-3-3
- Sonst overfittet die Policy auf wenige Matchups

**Formationswechsel im Training**
- Erst flache Policy mit statischen Formationen pro Spiel trainieren
- Dynamische Wechsel innerhalb eines Spiels erst aktivieren, wenn Basis stabil ist
- Nicht zwei bewegliche Teile gleichzeitig – schlecht zu debuggen

**Reward-Hinweis**
- Keinen Reward für „auf Sollposition stehen" geben – führt zu starren Spielern
- Taktische Positionierung soll aus dem Spielziel emergieren, nicht aus Positions-Shaping

**Simulationsgeschwindigkeit ist der Flaschenhals**
- Simulation headless, ohne Rendering
- Vectorized Environments: hunderte bis tausende Spiele parallel
- Keine Abhängigkeiten zur Rendering-Logik im Trainingspfad

## Spielerqualitäten, Form und Formation als Input

Die Spieler-Policy lernt π(a | state, qualities, form, formation_context). Ein Modell deckt alle Aufstellungen, Strategien und Formationen ab – kein Neutraining pro Team oder Formation.

## Plausibilität: fußballartiges Verhalten sicherstellen

Eine Policy, die gewinnt, ist nicht automatisch eine, die wie Fußball aussieht. Plausibilität ist eigenständiges Designziel, nicht Nebenprodukt des Trainings. Hebel, nach Wirkung sortiert:

**1. Simulation als erster Plausibilitäts-Filter**
Der wichtigste Hebel – wichtiger als jede Reward-Funktion. Unrealistische Aktionen sollen durch die Simulationsmechanik unattraktiv sein, nicht durch Strafen:
- Passgenauigkeit fällt mit Distanz und Druck → kurze Pässe emergieren automatisch
- Schussqualität hängt von Position, Winkel, Druck ab → Spieler nähern sich dem Tor
- Kondition/Sprintkosten → Wege werden ökonomisiert
- Gegner-Stellungsspiel fängt Pässe ab → Raumfindung entsteht

**2. Action-Space auf plausible Aktionen beschränken**
- Pässe nicht beliebig, sondern „zu Mitspieler X" oder „in Zone Y"
- Bewegung diskret relativ zu taktischen Zielen (Ball, Sollposition, Gegner, Tor)
- Rollenspezifische Action-Masks (Torwart außerhalb des Strafraums nur in Ausnahmen, IV überschreitet Mittellinie nur situativ, etc.)

**3. Imitation Learning Pretraining auf KI1**
- Bevor PPO startet: Behavioral Cloning auf KI1-Trajektorien
- Policy startet mit fußballartigem Verhalten, PPO verfeinert statt von null
- Abweichungen bleiben kleiner, Trainingszeit kürzer

**4. KL-Penalty zur KI1-Policy (optional)**
- PPO-Reward um Term ergänzen, der zu starke Abweichungen von KI1 bestraft
- Gewicht über die Zeit reduzieren, damit Fortschritt möglich bleibt
- Verhindert, dass die Policy in exotische Exploits driftet

**5. Verhaltensbasierte Evaluation, nicht nur Ergebnisse**
Gewinnrate allein ist irreführend. Zusätzlich messen:
- Passlängenverteilung
- Durchschnittliche Positionsabweichung vom Formations-Anker (sollte existieren, aber plausibel)
- Teamform-Kompaktheit über Spielphasen (Defensive kompakter als Offensive)
- Shot-Distanzverteilung (Großteil aus dem Strafraum)
- Ballbesitzanteile nach Zone
- Distanz zwischen Teammitgliedern (nicht alle auf einem Haufen)

Wenn Gewinnrate steigt, aber diese Metriken Richtung Absurdität driften, ist der Checkpoint kaputt.

**6. Human-in-the-loop Sichtprüfung**
- Nach jedem größeren Trainingslauf 5–10 Spiele gegen KI1 rendern und ansehen
- Unplausibles Verhalten erkennt man in Sekunden, Metriken verstecken es stundenlang
- Wenn es beim Zuschauen weh tut, ist der Checkpoint untauglich

**7. Moderates Reward-Shaping**
Sparsam und nur emergente Muster belohnen, keine spezifischen Aktionen:
- OK: kleiner Ballbesitz-Reward, Feldprogression, Raumkontrolle auf Teamebene
- Nicht OK: Reward fürs Einhalten der Sollposition (starre Spieler), Reward pro Pass (Ping-Pong), Reward fürs Nicht-Verlieren des Balls (passive Spieler)

**8. League-Training mit diversen Gegnern**
- Nicht nur Self-Play: KI1 und KI1-Varianten regelmäßig als Gegner im League halten
- Verhindert Overfitting auf Self-Play-Artefakte
- Hält die Policy in plausiblem Verhaltensraum

## Projektstruktur (Vorschlag)

```
/sim            Headless Spielengine (TypeScript, dieselbe Codebase wie Client)
/sim-py         Python-Binding oder Reimplementierung fürs Training
/formations     Formations-Definitionen als Daten (JSON/YAML)
/train          PPO-Training, Self-Play-Loop, Checkpoints
/eval           Baseline-AI, Matches gegen alte Checkpoints, Metriken
/export         ONNX-Export, int8-Quantisierung
/web            Browser-Client mit ONNX Runtime Web
/models         Trainierte, quantisierte Gewichte (Spieler- und Coach-Policy)
```

Die Spielengine muss zwischen Training (Python) und Runtime (Browser) deterministisch identisch sein. Entweder eine Engine in Rust/WASM für beide Seiten, oder TypeScript-Engine + Python-Port mit Paritäts-Tests.

## Umsetzungsreihenfolge

1. **Bestand sichten** – Engine und KI1 lesen, Schnittstellen verstehen, Paritäts-Tests schreiben
2. **Headless Trainings-Variante der Engine** (falls nötig) – deterministisch identisch zur Original-Engine, vectorized lauffähig
3. **Formations-Datenstruktur** + initialer Pool (z. B. 4-3-3, 4-4-2, 3-5-2, 5-3-2)
4. **KI1 formations-fähig machen** – sodass sie auch mit den neuen Sollpositionen sinnvoll spielt (kann rein regelbasiert sein)
5. **State-/Action-Encoder** – Feature-Vektor (inkl. Sollpositionen) und Action-Masking
6. **Trajektorien von KI1 sammeln** – für Imitation-Learning-Pretraining
7. **Behavioral Cloning Pretraining** – Policy lernt KI1-artiges Verhalten als Startpunkt
8. **PPO-Loop für Spieler-Policy** – gegen KI1, statische zufällig gesampelte Formationen pro Spiel, optional KL-Penalty zu KI1
9. **Verhaltens-Evaluation** – Metriken und Sichtprüfung pro Checkpoint
10. **Self-Play + League** – aktivieren, wenn KI1 geschlagen; KI1 und -Varianten bleiben im League
11. **Scripted Coach** – regelbasierte Formationswechsel, Spieler-Policy lernt Übergangsphasen
12. **Gelernte Coach-Policy** – ersetzt scripted Coach, trainiert mit Team-Reward
13. **ONNX-Export + int8-Quantisierung** (beide Policies)
14. **Browser-Integration** – ONNX Runtime Web, Inferenz-Benchmark auf Mobile

## Nicht-Ziele (bewusst ausgeschlossen)
- Training im Browser
- CNN-/Transformer-Architekturen
- MCTS zur Inferenzzeit auf Spielerebene
- Separate Modelle pro Team/Taktik/Formation
- Rohkoordinaten als Input
- Positions-Rewards fürs Einhalten der Formation

## Offene Entscheidungen für die erste Session mit Claude Code
- Genaue Aktionsmenge pro Rolle
- Reward-Shaping: nur Tore + Spielergebnis, oder Zwischen-Rewards (Ballbesitz, Progression, Torschüsse)
- Turn-Struktur: alle Spieler gleichzeitig, sequenziell nach Initiative, oder nur ballführender Spieler + Reaktionen
- Initialer Formations-Pool (welche 4–6 Formationen als Start?)
- Coach-Trigger: feste Intervalle (alle N Runden) oder Event-getrieben (Gegentor, Rote Karte, Spielphase)?
- Kann die bestehende Engine direkt vectorized laufen, oder braucht es eine headless Parallel-Variante?
- Wie viele Trajektorien von KI1 für Behavioral Cloning sammeln? (Größenordnung: 10k–100k Spiele)

Erste konkrete Aufgabe für Claude Code: Bestand (Engine + KI1) sichten und dokumentieren, Formations-Datenstruktur einführen, KI1 formations-fähig erweitern, Feature-Encoder implementieren. Ziel: 1000 Spiele KI1 vs. KI1 parallel mit zufällig gesampelten Formationen laufen lassen und Trajektorien speichern können. Training selbst kommt erst danach.
