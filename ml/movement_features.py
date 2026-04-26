"""
TIKITAQ ML — Movement-Feature-Encoder (Tier 2).

Spiegel zu src/engine/ai/movement_policy/features.ts. Konvertiert einen
Movement-JSONL-Record in Tensoren für das Movement-Policy-Netz.

Pro Record:
  - `global`: Per-Player-Observation (self + carrier + 5 Mit + 5 Gegner +
    Coach-Output + Globale Match-Features)
  - `options`: pro Option ein Feature-Vektor (type one-hot + target + score)
  - `mask`, `chosen`: wie bei Carrier-Policy

Achtung: dieser Encoder muss IMMER 1:1 mit features.ts synchron bleiben.
"""

from __future__ import annotations

from typing import Any

import torch

# ── Konstanten (spiegeln features.ts) ─────────────────────────

ROLE_LABELS = ["TW", "IV", "LV", "RV", "ZDM", "ZM", "LM", "RM", "OM", "ST"]
DEFENSE_STRATEGIES = ["high_press", "mid_press", "deep_block", "man_marking", "catenaccio"]
ATTACK_STRATEGIES = ["possession", "counter", "wing_play", "switch_play", "direct"]
TRANSITION_BEHAVIORS = ["gegenpress", "fall_back"]
INTENT_SIDES = ["left", "center", "right"]
MOVEMENT_OPTION_TYPES = [
    "defensive_position", "offensive_position", "press_carrier",
    "block_pass_lane", "man_marking", "cover_counter", "overlap_run",
    "cut_inside", "support_carrier", "stay",
]

# 2 (pos) + 10 (role) + 8 (stats) + 1 (fitness) + 1 (confidence) = 22
PLAYER_FEAT_DIM = 2 + len(ROLE_LABELS) + 8 + 1 + 1

# 5 + 5 + 2 + 3 + 1 + 1 + 1 + 1 = 19
COACH_FEAT_DIM = (
    len(DEFENSE_STRATEGIES) + len(ATTACK_STRATEGIES) + len(TRANSITION_BEHAVIORS)
    + len(INTENT_SIDES) + 1 + 1 + 1 + 1
)

# 3 (ball x/y/has_owner) + 1 (owner_is_own) + 4 (score_diff/time/team_ind/mustDecide)
GLOBAL_FEAT_DIM = 3 + 1 + 4

# Total per-Player observation:
#   self + carrier + 5 mates + 5 opps + coach + global
MOVEMENT_GLOBAL_DIM = (
    PLAYER_FEAT_DIM
    + PLAYER_FEAT_DIM
    + 5 * PLAYER_FEAT_DIM
    + 5 * PLAYER_FEAT_DIM
    + COACH_FEAT_DIM
    + GLOBAL_FEAT_DIM
)

# Option: 10 (type) + 2 (target) + 1 (score) + 2 (offset xy) + 1 (in_own_half)
MOVEMENT_OPTION_DIM = len(MOVEMENT_OPTION_TYPES) + 2 + 1 + 2 + 1
MOVEMENT_MAX_OPTIONS = 10


def _one_hot(value: str | None, vocab: list[str]) -> list[float]:
    out = [0.0] * len(vocab)
    if value is not None and value in vocab:
        out[vocab.index(value)] = 1.0
    return out


def _encode_player(p: dict[str, Any] | None) -> list[float]:
    if p is None:
        return [0.0] * PLAYER_FEAT_DIM
    pos = p.get("position", [0.0, 0.0])
    stats = p.get("stats", {})
    return [
        pos[0] / 100.0,
        pos[1] / 100.0,
        *_one_hot(p.get("position_label"), ROLE_LABELS),
        stats.get("pacing", 50) / 100.0,
        stats.get("finishing", 50) / 100.0,
        stats.get("shortPassing", 50) / 100.0,
        stats.get("highPassing", 50) / 100.0,
        stats.get("tackling", 50) / 100.0,
        stats.get("defensiveRadius", 50) / 100.0,
        stats.get("ballShielding", 50) / 100.0,
        stats.get("dribbling", 50) / 100.0,
        p.get("fitness", 100) / 100.0,
        p.get("confidence", 50) / 100.0,
    ]


def _encode_coach(rec: dict[str, Any]) -> list[float]:
    """Coach-Features sind im Movement-Record nicht direkt enthalten;
    wir nutzen den intent-Block + heuristische Defaults. Im PPO-Training
    auf Self-Play-Daten reicht das initial — später kann der TS-Recorder
    das Coach-State explicit anhängen.
    """
    intent = rec.get("intent")
    intent_side = intent["attack_side"] if intent else None
    intent_turns = (intent.get("turns_valid") if intent else 0) or 0
    # Default-Coach: balanced (mid_press + counter + fall_back), ohne
    # spezifische Identity. Wenn der TS-Recorder Coach-State später
    # mitliefert, hier echte Werte einsetzen.
    return [
        *_one_hot(None, DEFENSE_STRATEGIES),  # alle 0
        *_one_hot(None, ATTACK_STRATEGIES),
        *_one_hot(None, TRANSITION_BEHAVIORS),
        *_one_hot(intent_side, INTENT_SIDES),
        intent_turns / 5.0,
        0.5,  # riskAppetite default
        0.5,  # selfImage default
        0.5,  # confidence default
    ]


def _pick_nearest(target_pos: list[float], candidates: list[dict[str, Any]], n: int) -> list[dict[str, Any] | None]:
    """Wählt die n nächsten Spieler nach Euklid-Distanz, paddt mit None."""
    def dist(p: dict[str, Any]) -> float:
        cp = p.get("position", [0.0, 0.0])
        dx = cp[0] - target_pos[0]
        dy = cp[1] - target_pos[1]
        return (dx * dx + dy * dy) ** 0.5
    sorted_c = sorted(candidates, key=dist)
    out: list[dict[str, Any] | None] = list(sorted_c[:n])
    while len(out) < n:
        out.append(None)
    return out


def _encode_option(opt: dict[str, Any], self_pos: list[float], team: int) -> list[float]:
    target = opt.get("target", [0.0, 0.0])
    offset_x = (target[0] - self_pos[0]) / 50.0
    offset_y = (target[1] - self_pos[1]) / 50.0
    in_own_half = (target[1] > 50) if team == 1 else (target[1] < 50)
    return [
        *_one_hot(opt.get("type"), MOVEMENT_OPTION_TYPES),
        target[0] / 100.0,
        target[1] / 100.0,
        opt.get("score", 0.0),
        offset_x,
        offset_y,
        1.0 if in_own_half else 0.0,
    ]


def encode_movement_sample(
    rec: dict[str, Any],
    max_options: int = MOVEMENT_MAX_OPTIONS,
) -> dict[str, torch.Tensor]:
    self_p = rec["self"]
    carrier = rec.get("carrier")
    teammates = rec.get("teammates", [])
    opponents = rec.get("opponents", [])
    team = rec.get("team", 1)
    self_pos = self_p.get("position", [0.0, 0.0])

    self_feats = _encode_player(self_p)
    carrier_feats = _encode_player(carrier)

    nearest_mates = _pick_nearest(self_pos, [t for t in teammates if t.get("position_label") != "TW"], 5)
    nearest_opps = _pick_nearest(self_pos, [o for o in opponents if o.get("position_label") != "TW"], 5)

    mates_feats: list[float] = []
    for m in nearest_mates:
        mates_feats.extend(_encode_player(m))
    opps_feats: list[float] = []
    for o in nearest_opps:
        opps_feats.extend(_encode_player(o))

    coach_feats = _encode_coach(rec)

    score = rec.get("score", {"team1": 0, "team2": 0})
    own_score = score["team1"] if team == 1 else score["team2"]
    opp_score = score["team2"] if team == 1 else score["team1"]
    score_diff = (own_score - opp_score) / 10.0
    ball = rec.get("ball", {"position": [0.0, 0.0]})
    ball_pos = ball.get("position", [0.0, 0.0])
    ball_owner_team = rec.get("ball_owner_team")
    has_owner = 1.0 if ball_owner_team is not None else 0.0
    owner_is_own = 1.0 if ball_owner_team == team else 0.0

    global_feats = [
        ball_pos[0] / 100.0,
        ball_pos[1] / 100.0,
        has_owner,
        owner_is_own,
        score_diff,
        rec.get("game_time_min", 0.0) / 90.0,
        float(team),
        0.0,  # mustDecide nicht im Record — Default 0
    ]

    all_feats = (
        self_feats
        + carrier_feats
        + mates_feats
        + opps_feats
        + coach_feats
        + global_feats
    )

    if len(all_feats) != MOVEMENT_GLOBAL_DIM:
        raise RuntimeError(
            f"Movement global dim mismatch: expected {MOVEMENT_GLOBAL_DIM}, got {len(all_feats)}"
        )

    raw_opts = rec.get("options", [])
    num_opts = min(len(raw_opts), max_options)
    option_matrix = torch.zeros(max_options, MOVEMENT_OPTION_DIM, dtype=torch.float32)
    mask = torch.zeros(max_options, dtype=torch.float32)
    for i in range(num_opts):
        option_matrix[i] = torch.tensor(
            _encode_option(raw_opts[i], self_pos, team), dtype=torch.float32
        )
        mask[i] = 1.0

    chosen = rec.get("chosen_option_index", 0)
    if chosen >= max_options:
        chosen = 0

    return {
        "global": torch.tensor(all_feats, dtype=torch.float32),
        "options": option_matrix,
        "mask": mask,
        "chosen": chosen,
    }
