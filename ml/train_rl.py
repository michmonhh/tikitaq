"""
TIKITAQ RL — Policy-Gradient-Training (REINFORCE mit Baseline + PPO-clip).

Liest RL-Trajectories (mit reward, return, old_log_prob), aktualisiert das
Policy-Netz mit clipped surrogate loss (PPO-Style):

    L = -E[ min(r * A, clip(r, 1-ε, 1+ε) * A) ]

mit r = exp(log_prob_new - log_prob_old) und A = return - baseline.

Plus Entropy-Bonus zur Exploration:

    L_total = L_pg - β * H(π)

Nutzung:
    # Existierendes BC-Modell als Startpunkt + RL-Update
    python train_rl.py \
        --bc-checkpoint checkpoints/bc_latest.pt \
        --data datasets/rl/iter1.jsonl.gz \
        --epochs 4 --output checkpoints/rl_iter1.pt
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader

from rl_dataset import TikitaqRLDataset
from model import PolicyNet


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--bc-checkpoint", required=True,
                   help="Start-Checkpoint (i.d.R. von train_bc.py)")
    p.add_argument("--data", nargs="+", required=True,
                   help="JSONL-Dateien mit RL-Trajectories")
    p.add_argument("--output", required=True,
                   help="Pfad für aktualisiertes Modell")
    p.add_argument("--epochs", type=int, default=4)
    p.add_argument("--batch-size", type=int, default=128)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--gamma", type=float, default=0.99)
    p.add_argument("--clip-eps", type=float, default=0.2,
                   help="PPO clip range")
    p.add_argument("--entropy-beta", type=float, default=0.01,
                   help="Entropy-Bonus-Gewicht")
    p.add_argument("--device", type=str, default="auto")
    return p.parse_args()


def select_device(arg: str) -> torch.device:
    if arg == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")
    return torch.device(arg)


def policy_log_prob_and_entropy(
    model: PolicyNet,
    global_feat: torch.Tensor,
    options: torch.Tensor,
    mask: torch.Tensor,
    chosen: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Vorwärtspass + log_prob der gewählten Aktion + Entropie der Verteilung.
    """
    logits = model(global_feat, options, mask)
    # log_softmax respektiert die -inf-Maskierung (logits hatten neg_inf für
    # invalide Optionen)
    log_probs = F.log_softmax(logits, dim=-1)
    chosen_log_probs = log_probs.gather(1, chosen.unsqueeze(-1)).squeeze(-1)

    # Entropy: -Σ p log p, nur über valide Optionen
    probs = log_probs.exp()
    valid_mask = mask.bool()
    log_p_valid = log_probs.masked_fill(~valid_mask, 0.0)
    p_valid = probs.masked_fill(~valid_mask, 0.0)
    entropy = -(p_valid * log_p_valid).sum(dim=-1)

    return chosen_log_probs, entropy


def ppo_update_epoch(
    model: PolicyNet,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    clip_eps: float,
    entropy_beta: float,
) -> dict[str, float]:
    """Eine Epoche PPO-Updates."""
    model.train()
    total_pg_loss = 0.0
    total_ent_loss = 0.0
    total_n = 0

    for batch in loader:
        gf = batch['global'].to(device)
        opts = batch['options'].to(device)
        mask = batch['mask'].to(device)
        chosen = batch['chosen'].to(device)
        old_log_prob = batch['old_log_prob'].to(device)
        advantage = batch['return'].to(device)  # bereits normalisiert

        new_log_prob, entropy = policy_log_prob_and_entropy(model, gf, opts, mask, chosen)

        # PPO surrogate loss
        ratio = (new_log_prob - old_log_prob).exp()
        surr1 = ratio * advantage
        surr2 = ratio.clamp(1 - clip_eps, 1 + clip_eps) * advantage
        pg_loss = -torch.min(surr1, surr2).mean()

        ent_loss = -entropy.mean()  # negativ → entropy soll wachsen

        loss = pg_loss + entropy_beta * ent_loss

        optimizer.zero_grad()
        loss.backward()
        # Gradient-Clipping für Stabilität
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()

        bs = chosen.shape[0]
        total_pg_loss += pg_loss.item() * bs
        total_ent_loss += entropy.mean().item() * bs
        total_n += bs

    return {
        'pg_loss': total_pg_loss / total_n,
        'entropy': total_ent_loss / total_n,
    }


def main() -> None:
    args = parse_args()
    device = select_device(args.device)
    print(f"Device: {device}")

    # 1. Lade BC-Modell als Startpunkt
    ckpt = torch.load(args.bc_checkpoint, map_location=device, weights_only=True)
    model = PolicyNet(
        global_dim=ckpt['global_dim'],
        option_dim=ckpt['option_dim'],
        context_dim=ckpt['context_dim'],
        hidden_dim=ckpt['hidden_dim'],
        dropout=0.0,  # kein dropout im RL-Training
    ).to(device)
    model.load_state_dict(ckpt['model_state'])
    print(f"  Geladen: {args.bc_checkpoint} (val_acc={ckpt.get('val_acc', '?'):.3f})")

    # 2. Lade RL-Trajectories
    paths = [Path(p) for p in args.data]
    print(f"\nLade {len(paths)} Trajectory-Datei(en)...")
    t0 = time.time()
    ds = TikitaqRLDataset(paths, gamma=args.gamma)
    print(f"  Geladen in {time.time() - t0:.1f}s")

    loader = DataLoader(ds, batch_size=args.batch_size, shuffle=True)

    # 3. PPO-Updates
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    print(f"\nTraining {args.epochs} PPO-Epochen...")
    for epoch in range(args.epochs):
        t0 = time.time()
        stats = ppo_update_epoch(
            model, loader, optimizer, device, args.clip_eps, args.entropy_beta,
        )
        dt = time.time() - t0
        print(
            f"  [{epoch + 1}/{args.epochs}] "
            f"pg_loss={stats['pg_loss']:.4f} entropy={stats['entropy']:.3f} "
            f"({dt:.1f}s)"
        )

    # 4. Speichern
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        'model_state': model.state_dict(),
        'global_dim': ckpt['global_dim'],
        'option_dim': ckpt['option_dim'],
        'max_options': ckpt['max_options'],
        'context_dim': ckpt['context_dim'],
        'hidden_dim': ckpt['hidden_dim'],
        'dropout': ckpt['dropout'],
        'epoch': ckpt.get('epoch', 0),
        'val_acc': ckpt.get('val_acc', 0),  # bleibt vom BC-Vortraining
        'rl_iterations': ckpt.get('rl_iterations', 0) + 1,
    }, out_path)
    print(f"\nGespeichert: {out_path}")


if __name__ == "__main__":
    main()
