"""
TIKITAQ ML — Evaluation eines BC-Checkpoints gegen Held-out-Daten.

Liest ein Checkpoint + ein Test-Dataset ein und misst die Übereinstimmung
mit der Heuristik-KI (Accuracy, Top-3 Accuracy, Per-Option-Type-Breakdown).

Nutzung:
    python evaluate_bc.py --checkpoint checkpoints/bc_latest.pt --data datasets/test.jsonl.gz
"""

from __future__ import annotations

import argparse
from pathlib import Path
from collections import defaultdict

import torch
from torch.utils.data import DataLoader

from dataset import TikitaqBCDataset
from features import OPTION_TYPES
from model import PolicyNet


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--checkpoint", required=True)
    p.add_argument("--data", nargs="+", required=True)
    p.add_argument("--batch-size", type=int, default=512)
    p.add_argument("--max-options", type=int, default=16)
    return p.parse_args()


def main() -> None:
    args = parse_args()

    ckpt = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    model = PolicyNet(
        global_dim=ckpt["global_dim"],
        option_dim=ckpt["option_dim"],
        context_dim=ckpt["context_dim"],
        hidden_dim=ckpt["hidden_dim"],
        dropout=0.0,
    )
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    ds = TikitaqBCDataset([Path(p) for p in args.data], max_options=args.max_options)
    loader = DataLoader(ds, batch_size=args.batch_size, shuffle=False)

    total = 0
    correct_top1 = 0
    correct_top3 = 0
    # Per-Option-Typ-Breakdown: stimmen wir bei welchen Typen besser überein?
    per_type_total: dict[str, int] = defaultdict(int)
    per_type_correct: dict[str, int] = defaultdict(int)

    with torch.no_grad():
        for batch in loader:
            logits = model(batch["global"], batch["options"], batch["mask"])
            chosen = batch["chosen"]

            pred = logits.argmax(dim=-1)
            correct_top1 += (pred == chosen).sum().item()

            # Top-3
            top3 = logits.topk(3, dim=-1).indices
            correct_top3 += (top3 == chosen.unsqueeze(-1)).any(dim=-1).sum().item()

            # Per-Typ
            for i in range(chosen.shape[0]):
                chosen_idx = chosen[i].item()
                opt_vec = batch["options"][i, chosen_idx]
                # Die ersten 8 Dimensionen sind Type-One-Hot
                type_idx = opt_vec[:8].argmax().item()
                type_name = OPTION_TYPES[type_idx]
                per_type_total[type_name] += 1
                if pred[i].item() == chosen_idx:
                    per_type_correct[type_name] += 1

            total += chosen.shape[0]

    print(f"\nEvaluation auf {total} Samples:")
    print(f"  Top-1 Accuracy: {correct_top1 / total:.3f}")
    print(f"  Top-3 Accuracy: {correct_top3 / total:.3f}")
    print(f"\nPer-Option-Type (Top-1):")
    for t in OPTION_TYPES:
        if per_type_total[t] == 0:
            continue
        acc = per_type_correct[t] / per_type_total[t]
        print(f"  {t:15s} {per_type_correct[t]:>5d}/{per_type_total[t]:>5d}  ({acc:.3f})")


if __name__ == "__main__":
    main()
