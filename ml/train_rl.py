"""
TIKITAQ RL — PPO Actor-Critic-Training.

Liest RL-Trajectories (mit reward, return, old_log_prob), aktualisiert
das Policy-Netz mit clipped surrogate loss (PPO):

    L_pg = -E[ min(r * A, clip(r, 1-ε, 1+ε) * A) ]

Advantage seit v3 (2026-04-25): A = G_t − V_θ(s_t)  (Actor-Critic)
statt vorher A = (G_t − G_mean) / G_std (REINFORCE-Baseline).

Value-Loss:

    L_vf = ((G_t − V_θ(s_t))²)

Plus Entropy-Bonus zur Exploration:

    L_total = L_pg + c1 * L_vf − β * H(π)

Mit c1=0.5 (Standard-PPO), β=0.01 (Default).

Wenn der BC-Checkpoint noch keinen value_head hat (BC v1/v2), wird
dieser frisch initialisiert (strict=False).

Nutzung:
    python train_rl.py \\
        --bc-checkpoint checkpoints/bc_latest.pt \\
        --data datasets/rl/iter1.jsonl.gz \\
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
    p.add_argument("--vf-coef", type=float, default=0.5,
                   help="Value-Loss-Gewicht (Actor-Critic)")
    p.add_argument("--no-actor-critic", action="store_true",
                   help="Klassischer REINFORCE-mit-Baseline (alte v1/v2-Logik)")
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


def _logits_to_logp_entropy(
    logits: torch.Tensor,
    mask: torch.Tensor,
    chosen: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor]:
    """log_prob(chosen) + Entropie der Verteilung — beides masked-aware."""
    log_probs = F.log_softmax(logits, dim=-1)
    chosen_log_probs = log_probs.gather(1, chosen.unsqueeze(-1)).squeeze(-1)
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
    vf_coef: float,
    actor_critic: bool,
) -> dict[str, float]:
    """Eine Epoche PPO-Updates.

    Wenn actor_critic=True (Default seit v3):
        - forward_with_value liefert auch V(s)
        - advantage = return − V(s_old)  (V_old = detached V der aktuellen Iter)
        - value_loss = (return − V(s))²
        - L_total = L_pg + vf_coef * L_vf − β * H

    Wenn False (Legacy):
        - advantage = batch['return']  (das ist bereits normalisiert)
        - kein value_loss
    """
    model.train()
    total_pg_loss = 0.0
    total_vf_loss = 0.0
    total_ent = 0.0
    total_explained_var_num = 0.0
    total_explained_var_den = 0.0
    total_n = 0

    for batch in loader:
        gf = batch['global'].to(device)
        opts = batch['options'].to(device)
        mask = batch['mask'].to(device)
        chosen = batch['chosen'].to(device)
        old_log_prob = batch['old_log_prob'].to(device)
        ret = batch['return'].to(device)  # roh oder normalisiert (siehe rl_dataset)

        if actor_critic:
            logits, value = model.forward_with_value(gf, opts, mask)
            new_log_prob, entropy = _logits_to_logp_entropy(logits, mask, chosen)
            # Advantage detached, sonst fließt der Critic-Gradient durch den Actor
            advantage = (ret - value).detach()
            # Optionale Adv-Normalisierung pro Mini-Batch (PPO-Standard)
            if advantage.numel() > 1 and advantage.std() > 1e-8:
                advantage = (advantage - advantage.mean()) / (advantage.std() + 1e-8)
            value_loss = F.mse_loss(value, ret)
        else:
            logits = model(gf, opts, mask)
            new_log_prob, entropy = _logits_to_logp_entropy(logits, mask, chosen)
            advantage = ret  # bereits normalisiert
            value_loss = torch.tensor(0.0, device=device)

        # PPO surrogate loss
        ratio = (new_log_prob - old_log_prob).exp()
        surr1 = ratio * advantage
        surr2 = ratio.clamp(1 - clip_eps, 1 + clip_eps) * advantage
        pg_loss = -torch.min(surr1, surr2).mean()

        ent_loss = -entropy.mean()  # negativ → entropy soll wachsen
        loss = pg_loss + vf_coef * value_loss + entropy_beta * ent_loss

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()

        bs = chosen.shape[0]
        total_pg_loss += pg_loss.item() * bs
        total_vf_loss += value_loss.item() * bs
        total_ent += entropy.mean().item() * bs
        if actor_critic:
            # Explained Variance: 1 - Var(ret - V) / Var(ret)
            with torch.no_grad():
                resid = ret - value
                total_explained_var_num += resid.var(unbiased=False).item() * bs
                total_explained_var_den += ret.var(unbiased=False).item() * bs
        total_n += bs

    out = {
        'pg_loss': total_pg_loss / total_n,
        'vf_loss': total_vf_loss / total_n,
        'entropy': total_ent / total_n,
    }
    if actor_critic and total_explained_var_den > 1e-8:
        out['explained_var'] = 1.0 - total_explained_var_num / total_explained_var_den
    return out


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
    # strict=False erlaubt fehlendes value_head (alte BC-Checkpoints).
    # Fehlende Keys werden fresh initialisiert (mit Default-Init).
    load_result = model.load_state_dict(ckpt['model_state'], strict=False)
    if load_result.missing_keys:
        print(f"  ℹ Frisch initialisiert: {len(load_result.missing_keys)} Keys "
              f"(z.B. {load_result.missing_keys[0]}) — vermutlich Value-Head")
    if load_result.unexpected_keys:
        print(f"  ⚠ Unerwartete Keys ignoriert: {load_result.unexpected_keys}")
    print(f"  Geladen: {args.bc_checkpoint} (val_acc={ckpt.get('val_acc', '?'):.3f})")

    # 2. Lade RL-Trajectories
    # Im AC-Modus brauchen wir RAW Returns (V lernt deren Skala selbst);
    # im Legacy-REINFORCE-Modus normalisierte Returns als Baseline.
    actor_critic = not args.no_actor_critic
    paths = [Path(p) for p in args.data]
    print(f"\nLade {len(paths)} Trajectory-Datei(en)... "
          f"({'Actor-Critic' if actor_critic else 'REINFORCE-Baseline'})")
    t0 = time.time()
    ds = TikitaqRLDataset(paths, gamma=args.gamma, normalize_returns=not actor_critic)
    print(f"  Geladen in {time.time() - t0:.1f}s")

    loader = DataLoader(ds, batch_size=args.batch_size, shuffle=True)

    # 3. PPO-Updates
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    print(f"\nTraining {args.epochs} PPO-Epochen...")
    for epoch in range(args.epochs):
        t0 = time.time()
        stats = ppo_update_epoch(
            model, loader, optimizer, device,
            clip_eps=args.clip_eps,
            entropy_beta=args.entropy_beta,
            vf_coef=args.vf_coef,
            actor_critic=actor_critic,
        )
        dt = time.time() - t0
        if actor_critic:
            ev = stats.get('explained_var', float('nan'))
            print(
                f"  [{epoch + 1}/{args.epochs}] "
                f"pg_loss={stats['pg_loss']:.4f} vf_loss={stats['vf_loss']:.4f} "
                f"entropy={stats['entropy']:.3f} explained_var={ev:.3f} "
                f"({dt:.1f}s)"
            )
        else:
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
