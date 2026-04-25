"""
TIKITAQ ML — Policy-Netz für Behavior Cloning + RL Actor-Critic.

Architektur:
- Context-Encoder: MLP über die Global-Features → Kontext-Vektor
- Option-Scorer (Actor): MLP über (Context, Option-Features) → Skalar pro Option
- Value-Head (Critic): MLP über Context → V(s)
- Softmax über alle gültigen Options → Wahrscheinlichkeitsverteilung

Das ist strukturell analog zur Heuristik-KI, die jede Option einzeln
bewertet und dann das Argmax wählt — nur dass der Scorer gelernt ist
statt handgeschrieben.

Value-Head (seit RL v3, 2026-04-25):
- Wird für Actor-Critic-PPO genutzt (Advantage = Return − V(s) statt
  normalisierter Return).
- Im BC-Training nicht aktiv (kein Value-Loss). Wird im RL frisch
  initialisiert wenn BC-Checkpoint keine Value-Weights hat.
- Beim ONNX-Export ignoriert — der Browser braucht nur die Scores.

Invariante Eigenschaften:
- Funktioniert mit variabler Anzahl Options (dank mask + padding).
- Output-Dimension = max_options, Softmax respektiert den Mask.
- forward() differenzierbar, inkl. torch.onnx.export-tauglich.
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

        # Option-Scorer (Actor): (context, option) → score
        # Shared MLP wird für jede Option separat angewendet (broadcasting)
        self.option_scorer = nn.Sequential(
            nn.Linear(context_dim + option_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )

        # Value-Head (Critic): context → V(s) [Skalar]
        # Kleiner als der Actor, weil Value-Schätzung typischerweise
        # weniger Kapazität braucht. Beim ONNX-Export bleibt diese Sub-
        # Sequenz unbenutzt, weil forward() sie nicht aufruft.
        self.value_head = nn.Sequential(
            nn.Linear(context_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )

    def _context(self, global_feat: torch.Tensor) -> torch.Tensor:
        return self.context_enc(global_feat)

    def _scores_from_context(
        self,
        context: torch.Tensor,
        options: torch.Tensor,
        mask: torch.Tensor,
    ) -> torch.Tensor:
        N = options.shape[1]
        ctx = context.unsqueeze(1).expand(-1, N, -1)
        combined = torch.cat([ctx, options], dim=-1)
        scores = self.option_scorer(combined).squeeze(-1)
        neg_inf = torch.finfo(scores.dtype).min
        return scores.masked_fill(mask == 0, neg_inf)

    def forward(
        self,
        global_feat: torch.Tensor,   # [B, global_dim]
        options: torch.Tensor,       # [B, max_options, option_dim]
        mask: torch.Tensor,          # [B, max_options]
    ) -> torch.Tensor:
        """Gibt Logits pro Option zurück, gemasked für Padding.

        ONNX-Export ruft genau diese Methode auf — daher hier KEINE
        Value-Head-Aufrufe, sonst wäre der ONNX-Graph größer als nötig.
        """
        context = self._context(global_feat)
        return self._scores_from_context(context, options, mask)

    def forward_with_value(
        self,
        global_feat: torch.Tensor,
        options: torch.Tensor,
        mask: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """Wie forward(), aber liefert zusätzlich V(s) [B].

        Genutzt im RL-Training (Actor-Critic). Reuse vom Context spart
        einen Forward-Pass durch den Encoder.
        """
        context = self._context(global_feat)
        scores = self._scores_from_context(context, options, mask)
        value = self.value_head(context).squeeze(-1)
        return scores, value

    def value(self, global_feat: torch.Tensor) -> torch.Tensor:
        """Nur V(s) — für GAE/Bootstrap, ohne Action-Sampling-Overhead."""
        context = self._context(global_feat)
        return self.value_head(context).squeeze(-1)

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
