# TIKITAQ RL — Reward-Funktion Design

Dokumentiert die Reward-Struktur für Stufe 3 (Reinforcement Learning).
Basiert auf User-Entscheidungen vom 2026-04-25.

## Design-Prinzipien (aus User-Interview)

| Aspekt | Entscheidung |
|---|---|
| **Stil** | Kontext-sensitiv, nicht pauschal. Abhängig von Team-Confidence. |
| **Risiko** | Zonen-abhängig: Ballverlust in eigener Hälfte teurer als in gegnerischer. |
| **Führung** | Dynamisch: hohe Confidence → weiter angreifen, niedrige → verwalten. |
| **Zwischenziele** | Stark belohnt: Ecken, Tackles, Fouls-Ziehen, Box-Präsenz. |
| **Defense im 16er** | Situativ: Tackle bei klarer Torchance, sonst stellen. |

Roter Faden: **Alle Reward-Komponenten sind Team-Identity-sensitiv**
(Confidence auf Skala 0–100, direkt aus `plan.identity.confidence` gelesen).

## Reward-Werte

### Terminal-Rewards (am Match-Ende, pro Team)

| Ereignis | Reward |
|---|---:|
| Sieg | +20 |
| Unentschieden | +5 |
| Niederlage | −10 |

Asymmetrie: Niederlage schmerzt doppelt so stark wie ein Unentschieden.

### Tore (pro Tor)

| Ereignis | Reward |
|---|---:|
| Eigenes Tor | +15 |
| Gegentor | −15 |

### xG-Delta (pro Zug, wenn eigenes Team am Ball)

Kern-Signal für "wir kommen dem Tor näher". Erfordert eine neue Funktion
`xgFromPosition(pos, attackingTeam, opponents)`, die pro Ball-Position
eine Tor-Wahrscheinlichkeit schätzt (Distanz × Winkel × Gegner-Dichte).

```
Δ xG eigenes Team: +xG_delta × 10
Δ xG Gegner:       -xG_delta × 10
```

Typische xG-Delta-Range: −0.05 bis +0.20 pro Zug. Skaliert mit Faktor
10 → Signal zwischen −0.5 und +2.0 pro Turn.

### Ballbesitz-Dynamik (zonen-abhängig)

```
Ballgewinn eigene Hälfte (y>50 für Team 1):  +2.0
Ballgewinn gegn.  Hälfte (y<50 für Team 1):  +1.0

Ballverlust eigene Hälfte:    −2.0 × (1 + confidence/200)
                              → conf=0:   −2.0
                              → conf=50:  −2.5
                              → conf=100: −3.0

Ballverlust gegn.  Hälfte:    −0.5 × (1 − confidence/200)
                              → conf=0:   −0.5
                              → conf=50:  −0.375
                              → conf=100: −0.25
```

Interpretation: Je selbstbewusster das Team, desto mehr "stört" es ein
Ballverlust hinten (es weiß, dass es den Ball halten sollte). Vorne ist
Ballverlust ohnehin billig und für schwache Teams sogar akzeptabler
(sie dürfen Risiken eingehen um Chancen zu erzeugen).

### Zwischenziele (starke Rewards)

```
Ecke erarbeitet:                 +2.0
Zweikampf gewonnen (Tackle):     +1.0
Foul gezogen (kein Elfmeter):    +0.5
Pass in den 16er (cross/through):+1.0
Box-Präsenz (eigener Spieler):   +0.5  (pro Turn, max 1× pro Spieler)
```

### Defensive Aktionen

```
Tackle won (allgemein):          +1.5
Tackle won im eigenen 16er:      +3.0   (klare Chance vereitelt)
Erfolgreicher Schuss-Block:      +1.5
TW-Parade:                       +2.0

Elfmeter verursacht:             −8.0
Foul (kein Elfmeter):            −0.5
Gelbe Karte:                     −2.0
Rote Karte:                     −10.0
```

### Führungs-/Rückstand-Multiplikator (dynamisch, letzte 15 min)

Greift nur in `gameTime > 75 min`.

```python
goal_diff  = own_score - opp_score
time_left  = 90 - gameTime
conf_norm  = confidence / 100   # 0 bis 1

if goal_diff > 0:   # Führung
    xg_mult = 0.5 + conf_norm * 0.5
    # high conf (1.0) → mult 1.0 (angreifen)
    # low  conf (0.0) → mult 0.5 (verwalten)
    ballverlust_malus_mult = 1.5 - conf_norm * 0.5
    # high conf → 1.0; low conf → 1.5 (sicher spielen!)

elif goal_diff < 0:  # Rückstand
    xg_mult = 1.0 + conf_norm * 0.5
    # high conf → 1.5 (all-in)
    # low  conf → 1.0 (versuchen aber nicht zerbrechen)
    ballverlust_malus_mult = 1.0 - conf_norm * 0.5
    # high conf → 0.5 (Risiko OK)
    # low  conf → 1.0

else:  # Unentschieden
    xg_mult = 1.0
    ballverlust_malus_mult = 1.0
```

### Anti-Hacking-Schutz

```
3. Ecke in Folge ohne Torschuss:     Ecken-Reward × 0.33
> 5 Rückpässe in Folge:              -0.2 pro weiterem
> 3 Fouls in Folge vom selben Team:  Foul-Reward *= 0.5
                                     (verhindert "künstlich Fouls ziehen")
```

## Offene Implementierungs-Punkte

Zu tun vor dem ersten RL-Training:

1. **`xgFromPosition()` Funktion** in TypeScript — pro Ball-Position eine
   Tor-Wahrscheinlichkeit. Kann adaptiert aus `calculateShotAccuracy`
   gebaut werden.

2. **Reward-Tracker im GameState** — ein `rewardAccumulator: { team1, team2 }`,
   der pro Turn die Delta-Rewards sammelt. Wird am Turn-Ende ins
   Trainings-Log geschrieben.

3. **Trajectory-Format erweitern** — das existierende JSONL-Format um
   ein `reward` und `done`-Feld ergänzen, pro Entscheidung. Für PPO
   brauchen wir auch `log_prob` der gewählten Aktion.

4. **Python-Reader erweitern** — bestehender `dataset.py` muss auch
   reward/done/log_prob lesen können (neue RL-Trajectory-Klasse).

## Reward-Engineering-Budget

Erwartung: 3–5 Reward-Iterationen bis das Training sauber konvergiert.
Klassische Pathologien, die dann auftreten:

- **Reward-Hacking**: z.B. Netz lernt Ecken zu "fishen" (Pass ins Aus)
  um +2 abzukassieren. Anti-Hacking-Schutz oben adressiert das.
- **Zu passives Spiel**: Ballverlust-Malus in eigener Hälfte zu hoch
  → Netz lernt nur Rückpässe. Kalibrierung nötig.
- **Zu aggressives Spiel**: xG-Bonus zu hoch → Netz schießt zu früh.
  Kalibrierung nötig.
- **Keine Konvergenz**: Rewards insgesamt zu sparse → shaping verstärken.

Bei jeder Iteration: Round-Robin laufen lassen, Tor-Verteilung mit
Heuristik-Basis vergleichen, anpassen.

## Status

| | Status |
|---|---|
| Reward-Design | ✅ dokumentiert (dieses File) |
| `xgFromPosition()` | TODO |
| Reward-Tracker in GameState | TODO |
| Trajectory-Format-Erweiterung | TODO |
| Python PPO-Setup | TODO |
| ONNX-Inferenz in TS-Arena | TODO |

Nächster Schritt: nach dem overnight BC-Run am 2026-04-25 morgen.
