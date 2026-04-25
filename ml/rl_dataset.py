"""
TIKITAQ ML — RL-Dataset.

Liest die von `aiArena.ts --bc-policy ... --sample --export-training` erzeugten
Trajectories und stellt sie als (state, action, log_prob, reward, return)-
Tupel bereit für Policy-Gradient-Algorithmen.

Unterschied zu `dataset.py` (BC):
- BC nutzt nur (state, options, chosen_index)
- RL braucht zusätzlich (reward, done, log_prob, probs)
- RL berechnet pro Trajektorie den **return** (discounted sum of future rewards)

Ein Datensatz ≈ ein kompletter Match-Verlauf eines Teams. Returns werden
intern pro Match-Trajektorie berechnet (γ-discounted reward-to-go).
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import torch
from torch.utils.data import Dataset

from dataset import _open_maybe_gz
from features import encode_sample, GLOBAL_FEATURE_DIM, OPTION_FEATURE_DIM


def compute_returns(rewards: list[float], gamma: float = 0.99) -> list[float]:
    """Discounted reward-to-go: G_t = r_t + γ G_{t+1}."""
    returns = [0.0] * len(rewards)
    G = 0.0
    for t in range(len(rewards) - 1, -1, -1):
        G = rewards[t] + gamma * G
        returns[t] = G
    return returns


class TikitaqRLDataset(Dataset):
    """
    In-Memory RL-Dataset. Liest alle Records ein, gruppiert sie pro
    (match_id, team) zu Trajektorien, berechnet Returns, und gibt Tensoren
    pro Decision zurück.

    Each item:
        global:    [GLOBAL_DIM]
        options:   [max_options, OPTION_DIM]
        mask:      [max_options]
        chosen:    int
        old_log_prob: float (vom Sampling-Zeitpunkt)
        reward:    float (Step-Reward)
        return_:   float (discounted return-to-go)
    """

    def __init__(
        self,
        paths: list[Path],
        max_options: int = 16,
        gamma: float = 0.99,
        normalize_returns: bool = True,
    ):
        # Records pro (match_id, team) sammeln (in Reihenfolge)
        groups: dict[tuple[str, int], list[dict]] = defaultdict(list)
        skipped = 0
        for path in paths:
            try:
                with _open_maybe_gz(path) as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            rec = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        # Nur RL-Trajectories nutzbar (need reward + log_prob)
                        if 'reward' not in rec or 'log_prob' not in rec:
                            skipped += 1
                            continue
                        key = (rec['match_id'], rec['team'])
                        groups[key].append(rec)
            except (EOFError, OSError) as e:
                print(f"⚠ Skipping {path.name}: {e}")

        if skipped > 0:
            print(f"  ⚠ Skipped {skipped} records ohne RL-Felder")

        # Pro Trajectory: returns berechnen
        self.globals: list[torch.Tensor] = []
        self.option_feats: list[torch.Tensor] = []
        self.option_masks: list[torch.Tensor] = []
        self.chosen: list[int] = []
        self.old_log_probs: list[float] = []
        self.rewards: list[float] = []
        self.returns: list[float] = []

        for (_match_id, _team), recs in groups.items():
            rewards = [float(r['reward']) for r in recs]
            returns = compute_returns(rewards, gamma)
            for rec, ret in zip(recs, returns):
                enc = encode_sample(rec, max_options=max_options)
                self.globals.append(enc['global'])
                self.option_feats.append(enc['options'])
                self.option_masks.append(enc['mask'])
                self.chosen.append(enc['chosen'])
                self.old_log_probs.append(float(rec['log_prob']))
                self.rewards.append(float(rec['reward']))
                self.returns.append(ret)

        if not self.globals:
            raise RuntimeError("Keine RL-Records gefunden — wurden mit --sample exportiert?")

        self._g = torch.stack(self.globals)
        self._o = torch.stack(self.option_feats)
        self._m = torch.stack(self.option_masks)
        self._c = torch.tensor(self.chosen, dtype=torch.long)
        self._lp = torch.tensor(self.old_log_probs, dtype=torch.float32)
        self._r = torch.tensor(self.rewards, dtype=torch.float32)
        self._ret = torch.tensor(self.returns, dtype=torch.float32)
        del self.globals, self.option_feats, self.option_masks
        del self.chosen, self.old_log_probs, self.rewards, self.returns

        if normalize_returns and self._ret.std() > 1e-8:
            self._ret = (self._ret - self._ret.mean()) / (self._ret.std() + 1e-8)

        print(f"  Loaded {len(self._c)} RL transitions from {len(groups)} trajectories")
        print(f"  Reward stats: mean={self._r.mean():.3f} std={self._r.std():.3f}")
        print(f"  Return stats (post-normalize): mean={self._ret.mean():.3f} std={self._ret.std():.3f}")

    def __len__(self) -> int:
        return self._c.shape[0]

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        return {
            'global': self._g[idx],
            'options': self._o[idx],
            'mask': self._m[idx],
            'chosen': self._c[idx],
            'old_log_prob': self._lp[idx],
            'reward': self._r[idx],
            'return': self._ret[idx],
        }

    @property
    def global_dim(self) -> int:
        return GLOBAL_FEATURE_DIM

    @property
    def option_dim(self) -> int:
        return OPTION_FEATURE_DIM
