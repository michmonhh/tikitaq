"""
TIKITAQ ML — Policy-Netz für Behavior Cloning.

Architektur:
- Context-Encoder: MLP über die Global-Features → Kontext-Vektor
- Option-Scorer: MLP über (Context, Option-Features) → Skalar pro Option
- Softmax über alle gültigen Options → Wahrscheinlichkeitsverteilung

Das ist strukturell analog zur Heuristik-KI, die jede Option einzeln
bewertet und dann das Argmax wählt — nur dass der Scorer gelernt ist
statt handgeschrieben.

Invariante Eigenschaften:
- Funktioniert mit variabler Anzahl Options (dank mask + padding).
- Output-Dimension = max_options, Softmax respektiert den Mask.
- Differenzierbar durchgehend, inkl. torch.onnx.export-tauglich.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class PolicyNet(nn.Module):
    """Option-basiertes Behavior-Cloning-Netz."""

    def __init__(
        self,
        global_dim: int,
        option_dim: int,
        context_dim: int = 128,
        hidden_dim: int = 64,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.global_dim = global_dim
        self.option_dim = option_dim
        self.context_dim = context_dim

        # Context-Encoder: global features → kontext vector
        self.context_enc = nn.Sequential(
            nn.Linear(global_dim, 256),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(256, context_dim),
            nn.ReLU(),
        )

        # Option-Scorer: (context, option) → score
        # Shared MLP wird für jede Option separat angewendet (broadcasting)
        self.option_scorer = nn.Sequential(
            nn.Linear(context_dim + option_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )

    def forward(
        self,
        global_feat: torch.Tensor,   # [B, global_dim]
        options: torch.Tensor,       # [B, max_options, option_dim]
        mask: torch.Tensor,          # [B, max_options]
    ) -> torch.Tensor:
        """Gibt Logits pro Option zurück, gemasked für Padding."""
        B, N, _ = options.shape

        # Context: [B, context_dim]
        context = self.context_enc(global_feat)

        # Broadcast context auf alle Options: [B, N, context_dim]
        context_expanded = context.unsqueeze(1).expand(-1, N, -1)

        # Concat mit option features: [B, N, context_dim + option_dim]
        combined = torch.cat([context_expanded, options], dim=-1)

        # Score jede Option: [B, N, 1] → [B, N]
        scores = self.option_scorer(combined).squeeze(-1)

        # Invalide Options auf -inf setzen, damit sie nach Softmax 0 sind
        neg_inf = torch.finfo(scores.dtype).min
        scores = scores.masked_fill(mask == 0, neg_inf)

        return scores

    def predict(
        self,
        global_feat: torch.Tensor,
        options: torch.Tensor,
        mask: torch.Tensor,
    ) -> torch.Tensor:
        """Gibt das Argmax pro Sample zurück — Inferenz-Hilfsfunktion."""
        scores = self.forward(global_feat, options, mask)
        return scores.argmax(dim=-1)


def bc_loss(logits: torch.Tensor, chosen: torch.Tensor) -> torch.Tensor:
    """Standard Cross-Entropy gegen die vom Heuristik-Lehrer gewählte Option."""
    return F.cross_entropy(logits, chosen)


def accuracy(logits: torch.Tensor, chosen: torch.Tensor) -> float:
    """Top-1 Accuracy — stimmt mit Lehrer überein?"""
    pred = logits.argmax(dim=-1)
    return (pred == chosen).float().mean().item()
