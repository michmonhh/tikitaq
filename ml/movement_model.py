"""
TIKITAQ ML — Movement-Policy-Netz (Tier 2).

Architektur 1:1 zur Carrier-PolicyNet (model.py):
- Context-Encoder: per-player Global-Features → Kontext-Vektor
- Option-Scorer (Actor): pro Option ein Score
- Value-Head (Critic): V(s) für PPO

Größere Input-Dim (MOVEMENT_GLOBAL_DIM ≈ 270) als Carrier (296), aber
wir nutzen einen kleineren context_dim — Movement-Decisions sind
'lokaler', brauchen weniger globalen Kontext.

Beim BC-Pretraining wird nur der Actor trainiert (Cross-Entropy gegen
heuristische Wahl). Beim PPO später kommt der Critic dazu.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class MovementPolicyNet(nn.Module):
    def __init__(
        self,
        global_dim: int,
        option_dim: int,
        context_dim: int = 96,
        hidden_dim: int = 64,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.global_dim = global_dim
        self.option_dim = option_dim
        self.context_dim = context_dim

        self.context_enc = nn.Sequential(
            nn.Linear(global_dim, 192),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(192, context_dim),
            nn.ReLU(),
        )

        # Actor (Option-Scorer)
        self.option_scorer = nn.Sequential(
            nn.Linear(context_dim + option_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )

        # Critic (V(s)) — wird beim BC-Pretraining nicht trainiert,
        # bleibt aber im Graph für späteren PPO-Use.
        self.value_head = nn.Sequential(
            nn.Linear(context_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )

    def _context(self, global_feat: torch.Tensor) -> torch.Tensor:
        return self.context_enc(global_feat)

    def _scores_from_context(
        self, context: torch.Tensor, options: torch.Tensor, mask: torch.Tensor,
    ) -> torch.Tensor:
        N = options.shape[1]
        ctx = context.unsqueeze(1).expand(-1, N, -1)
        combined = torch.cat([ctx, options], dim=-1)
        scores = self.option_scorer(combined).squeeze(-1)
        neg_inf = torch.finfo(scores.dtype).min
        return scores.masked_fill(mask == 0, neg_inf)

    def forward(
        self,
        global_feat: torch.Tensor,    # [B, global_dim]
        options: torch.Tensor,         # [B, max_options, option_dim]
        mask: torch.Tensor,            # [B, max_options]
    ) -> torch.Tensor:
        """ONNX-fähig — gibt nur Logits zurück (Value-Head nicht im Graph)."""
        context = self._context(global_feat)
        return self._scores_from_context(context, options, mask)

    def forward_with_value(
        self, global_feat: torch.Tensor, options: torch.Tensor, mask: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        context = self._context(global_feat)
        scores = self._scores_from_context(context, options, mask)
        value = self.value_head(context).squeeze(-1)
        return scores, value

    def value(self, global_feat: torch.Tensor) -> torch.Tensor:
        context = self._context(global_feat)
        return self.value_head(context).squeeze(-1)

    def predict(
        self, global_feat: torch.Tensor, options: torch.Tensor, mask: torch.Tensor,
    ) -> torch.Tensor:
        return self.forward(global_feat, options, mask).argmax(dim=-1)


def bc_loss(logits: torch.Tensor, chosen: torch.Tensor) -> torch.Tensor:
    return F.cross_entropy(logits, chosen)


def accuracy(logits: torch.Tensor, chosen: torch.Tensor) -> float:
    return (logits.argmax(dim=-1) == chosen).float().mean().item()
