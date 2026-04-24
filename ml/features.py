"""
TIKITAQ ML — Feature-Encoder.

Konvertiert einen JSONL-Record (Ballführer-Entscheidung) in Tensoren:
- `global`: Kontextfeatures (Ball, Carrier, Intent, alle 22 Spieler-
  Positionen und Rollen)
- `options`: pro Option ein Feature-Vektor (Type, Target, Success,
  Reward, Empfänger-Info)
- `mask`: 1 wenn Option gültig, 0 wenn Padding (wichtig für Softmax)
- `chosen`: Index der gewählten Option

Design-Entscheidungen (Version 1, pragmatisch):
- Flache Vektoren statt Grid-CNN — einfacher, schnell genug
- Spieler werden nach Team × Rollen-Slot sortiert: fester Index 0-10
  für eigenes Team, 11-21 für Gegner. Feature-Engineering-light.
- Positionen werden normalisiert (x, y / 100 → [0, 1])
- Stats auch normalisiert (/ 100 → [0, 1])
- Intent als one-hot

Wenn BC schwach performt, hier verfeinern: Grid-Encoding, Player-
Attention, etc.
"""

from __future__ import annotations

from typing import Any

import torch

# ── Feld-Konstanten ─────────────────────────────────────────────

ROLE_LABELS = ["TW", "IV", "LV", "RV", "ZDM", "LM", "RM", "OM", "ST"]
OPTION_TYPES = [
    "shoot", "short_pass", "long_ball", "through_ball",
    "cross", "dribble", "advance", "hold",
]
INTENT_SIDES = ["left", "center", "right"]

# Player-Feature pro Spieler: 2 pos + 9 role one-hot + fitness + confidence = 13
PLAYER_FEAT_DIM = 13

# Global-Feature-Dimension:
#   3 (ball xy + possession-indicator=1)
#   + 13 (carrier features)
#   + 4 (score_diff, game_time, intent_turns_valid, team)
#   + 3 (intent one-hot)
#   + 10 * 13 (teammates; max 10, Position-Label-basiert einsortiert)
#   + 11 * 13 (opponents; max 11)
GLOBAL_FEATURE_DIM = 3 + PLAYER_FEAT_DIM + 4 + 3 + 10 * PLAYER_FEAT_DIM + 11 * PLAYER_FEAT_DIM

# Option-Feature-Dimension:
#   8 (type one-hot)
#   + 2 (target xy)
#   + 1 (success_chance)
#   + 1 (reward)
#   + 1 (has_receiver flag)
#   + 2 (receiver pos — 0 wenn kein Empfänger)
OPTION_FEATURE_DIM = 8 + 2 + 1 + 1 + 1 + 2


# ── Einzel-Encoder ──────────────────────────────────────────────

def _role_onehot(label: str) -> list[float]:
    """9-dimensional one-hot Vektor für positionLabel."""
    out = [0.0] * len(ROLE_LABELS)
    if label in ROLE_LABELS:
        out[ROLE_LABELS.index(label)] = 1.0
    return out


def _option_type_onehot(t: str) -> list[float]:
    out = [0.0] * len(OPTION_TYPES)
    if t in OPTION_TYPES:
        out[OPTION_TYPES.index(t)] = 1.0
    return out


def _intent_onehot(side: str | None) -> list[float]:
    out = [0.0] * len(INTENT_SIDES)
    if side and side in INTENT_SIDES:
        out[INTENT_SIDES.index(side)] = 1.0
    else:
        # Kein Intent / center = center
        out[INTENT_SIDES.index("center")] = 1.0
    return out


def _encode_player(p: dict[str, Any]) -> list[float]:
    pos = p["position"]
    stats = p.get("stats", {})
    return [
        pos[0] / 100.0,
        pos[1] / 100.0,
        *_role_onehot(p.get("position_label", "")),
        p.get("fitness", 100) / 100.0,
        p.get("confidence", 50) / 100.0,
    ]


def _encode_ghost_player() -> list[float]:
    """Padding für fehlende Spieler (< 11 im Team)."""
    return [0.0] * PLAYER_FEAT_DIM


def _encode_option(opt: dict[str, Any]) -> list[float]:
    target = opt.get("target", [0.0, 0.0])
    receiver = opt.get("receiver_id")
    # Receiver-Position ist im Record nicht separat gespeichert, aber wir
    # nutzen target als Proxy (bei Pässen ist target ≈ receiver position).
    has_receiver = 1.0 if receiver else 0.0
    return [
        *_option_type_onehot(opt.get("type", "hold")),
        target[0] / 100.0,
        target[1] / 100.0,
        opt.get("success_chance", 0.5),
        opt.get("reward", 0.0),
        has_receiver,
        target[0] / 100.0 if has_receiver else 0.0,
        target[1] / 100.0 if has_receiver else 0.0,
    ]


# ── Haupt-Encoder ───────────────────────────────────────────────

def encode_sample(rec: dict[str, Any], max_options: int = 16) -> dict[str, torch.Tensor]:
    """Wandelt einen JSONL-Record in Tensor-Features + Label um."""
    ball = rec["ball"]["position"]

    # Global: Ball + Carrier + Score/Time + Intent + Teammates + Opponents
    carrier_feats = _encode_player(rec["carrier"])
    score = rec.get("score", {"team1": 0, "team2": 0})
    team = rec.get("team", 1)
    own_score = score["team1"] if team == 1 else score["team2"]
    opp_score = score["team2"] if team == 1 else score["team1"]
    score_diff = (own_score - opp_score) / 10.0  # normalize, typical range -3..+3

    intent = rec.get("intent") or {}
    intent_side = intent.get("attack_side")
    intent_turns = (intent.get("turns_valid") or 0) / 5.0  # normalize

    # Teammates & Opponents auffüllen
    teammates = rec.get("teammates", [])
    opponents = rec.get("opponents", [])

    team_feats: list[float] = []
    for i in range(10):  # 10 Mitspieler (ohne carrier)
        if i < len(teammates):
            team_feats.extend(_encode_player(teammates[i]))
        else:
            team_feats.extend(_encode_ghost_player())

    opp_feats: list[float] = []
    for i in range(11):
        if i < len(opponents):
            opp_feats.extend(_encode_player(opponents[i]))
        else:
            opp_feats.extend(_encode_ghost_player())

    global_vec = [
        ball[0] / 100.0,
        ball[1] / 100.0,
        1.0,  # possession indicator (wir haben den Ball)
        *carrier_feats,
        score_diff,
        rec.get("game_time_min", 0.0) / 90.0,
        intent_turns,
        float(team),  # wird durch Symmetrie-Augment später spiegelbar
        *_intent_onehot(intent_side),
        *team_feats,
        *opp_feats,
    ]
    assert len(global_vec) == GLOBAL_FEATURE_DIM, \
        f"global dim mismatch: expected {GLOBAL_FEATURE_DIM}, got {len(global_vec)}"

    # Options
    raw_opts = rec.get("options", [])
    num_opts = min(len(raw_opts), max_options)

    option_matrix = torch.zeros(max_options, OPTION_FEATURE_DIM, dtype=torch.float32)
    mask = torch.zeros(max_options, dtype=torch.float32)

    for i in range(num_opts):
        option_matrix[i] = torch.tensor(_encode_option(raw_opts[i]), dtype=torch.float32)
        mask[i] = 1.0

    chosen = rec.get("chosen_option_index", 0)
    if chosen >= max_options:
        chosen = 0  # fallback

    return {
        "global": torch.tensor(global_vec, dtype=torch.float32),
        "options": option_matrix,
        "mask": mask,
        "chosen": chosen,
    }
