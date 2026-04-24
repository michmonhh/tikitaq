"""
TIKITAQ ML — Behavior-Cloning-Training.

Nutzung:
    python train_bc.py --data datasets/run01.jsonl.gz
    python train_bc.py --data datasets/*.jsonl.gz --epochs 20 --batch-size 512

Das trainierte Modell wird nach checkpoints/bc_latest.pt gespeichert.
Tensorboard-Logs unter runs/bc-<timestamp>/.

Typische Runtime auf M1 Mac (CPU-only):
- 10 Round Robins (230k Samples): ~3-5 Min pro Epoche
- 50 Round Robins (1.1M Samples): ~15-20 Min pro Epoche
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import torch
from torch.utils.data import DataLoader, random_split
from torch.utils.tensorboard.writer import SummaryWriter
from tqdm import tqdm

from dataset import TikitaqBCDataset, TikitaqBCStreamingDataset
from model import PolicyNet, bc_loss, accuracy


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Behavior-Cloning für TIKITAQ-KI")
    p.add_argument("--data", nargs="+", required=True,
                   help="Pfad(e) zu .jsonl oder .jsonl.gz Dateien")
    p.add_argument("--epochs", type=int, default=10)
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--val-split", type=float, default=0.1,
                   help="Anteil Validierungsdaten (0-1)")
    p.add_argument("--max-options", type=int, default=16)
    p.add_argument("--context-dim", type=int, default=128)
    p.add_argument("--hidden-dim", type=int, default=64)
    p.add_argument("--dropout", type=float, default=0.1)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--checkpoint-dir", type=str, default="checkpoints")
    p.add_argument("--log-dir", type=str, default="runs")
    p.add_argument("--device", type=str, default="auto",
                   help="auto | cpu | cuda | mps (Apple Silicon)")
    p.add_argument("--streaming", action="store_true",
                   help="Streaming-Dataset (für Datensätze >1 GB) — konstanter RAM")
    p.add_argument("--shuffle-buffer", type=int, default=4096,
                   help="Größe des Shuffle-Buffers im Streaming-Modus")
    return p.parse_args()


def select_device(arg: str) -> torch.device:
    if arg == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")
    return torch.device(arg)


def train_one_epoch(
    model: PolicyNet,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
) -> tuple[float, float]:
    model.train()
    total_loss = 0.0
    total_acc = 0.0
    total_samples = 0
    for batch in tqdm(loader, desc="train", leave=False):
        global_f = batch["global"].to(device)
        options = batch["options"].to(device)
        mask = batch["mask"].to(device)
        chosen = batch["chosen"].to(device)

        optimizer.zero_grad()
        logits = model(global_f, options, mask)
        loss = bc_loss(logits, chosen)
        loss.backward()
        optimizer.step()

        bs = chosen.shape[0]
        total_loss += loss.item() * bs
        total_acc += accuracy(logits, chosen) * bs
        total_samples += bs
    return total_loss / total_samples, total_acc / total_samples


@torch.no_grad()
def evaluate(
    model: PolicyNet,
    loader: DataLoader,
    device: torch.device,
) -> tuple[float, float]:
    model.eval()
    total_loss = 0.0
    total_acc = 0.0
    total_samples = 0
    for batch in loader:
        global_f = batch["global"].to(device)
        options = batch["options"].to(device)
        mask = batch["mask"].to(device)
        chosen = batch["chosen"].to(device)

        logits = model(global_f, options, mask)
        loss = bc_loss(logits, chosen)

        bs = chosen.shape[0]
        total_loss += loss.item() * bs
        total_acc += accuracy(logits, chosen) * bs
        total_samples += bs
    return total_loss / total_samples, total_acc / total_samples


def main() -> None:
    args = parse_args()
    torch.manual_seed(args.seed)
    device = select_device(args.device)
    print(f"Device: {device}")

    # Dataset laden
    paths = [Path(p) for p in args.data]
    print(f"Lade {len(paths)} Datei(en)...")
    t0 = time.time()

    if args.streaming:
        # Streaming: konstanter RAM egal wie groß die Daten sind.
        # Hash-basierter Split (deterministisch).
        train_ds = TikitaqBCStreamingDataset(
            paths, max_options=args.max_options, split="train",
            val_fraction=args.val_split, shuffle_buffer=args.shuffle_buffer,
        )
        val_ds = TikitaqBCStreamingDataset(
            paths, max_options=args.max_options, split="val",
            val_fraction=args.val_split, shuffle_buffer=0,
        )
        global_dim = train_ds.global_dim
        option_dim = train_ds.option_dim
        print(f"  Streaming-Modus (konstanter RAM)")
        print(f"  Train/Val Hash-Split: {(1 - args.val_split) * 100:.0f}% / {args.val_split * 100:.0f}%")
    else:
        ds = TikitaqBCDataset(paths, max_options=args.max_options)
        print(f"  {len(ds)} Samples in {time.time() - t0:.1f}s geladen")
        val_n = int(len(ds) * args.val_split)
        train_n = len(ds) - val_n
        generator = torch.Generator().manual_seed(args.seed)
        train_ds, val_ds = random_split(ds, [train_n, val_n], generator=generator)
        global_dim = ds.global_dim
        option_dim = ds.option_dim

    print(f"  Global-Feature-Dim: {global_dim}")
    print(f"  Option-Feature-Dim: {option_dim}")

    # Shuffle nur für In-Memory-Datasets; Streaming hat eingebauten Shuffle-Buffer
    train_loader = DataLoader(
        train_ds, batch_size=args.batch_size,
        shuffle=not args.streaming, num_workers=0,
    )
    val_loader = DataLoader(
        val_ds, batch_size=args.batch_size, shuffle=False, num_workers=0,
    )

    # Modell
    model = PolicyNet(
        global_dim=global_dim,
        option_dim=option_dim,
        context_dim=args.context_dim,
        hidden_dim=args.hidden_dim,
        dropout=args.dropout,
    ).to(device)
    params = sum(p.numel() for p in model.parameters())
    print(f"  Modell-Parameter: {params:,}")

    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)

    # Logging
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    log_path = Path(args.log_dir) / f"bc-{timestamp}"
    writer = SummaryWriter(log_dir=str(log_path))
    ckpt_dir = Path(args.checkpoint_dir)
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    best_val_acc = 0.0

    # Training
    for epoch in range(args.epochs):
        t0 = time.time()
        train_loss, train_acc = train_one_epoch(model, train_loader, optimizer, device)
        val_loss, val_acc = evaluate(model, val_loader, device)
        dt = time.time() - t0

        writer.add_scalar("train/loss", train_loss, epoch)
        writer.add_scalar("train/acc", train_acc, epoch)
        writer.add_scalar("val/loss", val_loss, epoch)
        writer.add_scalar("val/acc", val_acc, epoch)

        print(
            f"[{epoch + 1}/{args.epochs}] "
            f"train loss={train_loss:.4f} acc={train_acc:.3f} | "
            f"val loss={val_loss:.4f} acc={val_acc:.3f} | "
            f"{dt:.1f}s"
        )

        # Zwei Checkpoints: best (nur wenn val_acc besser) + last (immer).
        # Last ist nützlich für Fortsetzungs-Trainings und als Sicherung
        # wenn Streaming-Dataset zum letzten Epoch noch lernt.
        checkpoint_data = {
            "model_state": model.state_dict(),
            "global_dim": global_dim,
            "option_dim": option_dim,
            "max_options": args.max_options,
            "context_dim": args.context_dim,
            "hidden_dim": args.hidden_dim,
            "dropout": args.dropout,
            "epoch": epoch,
            "val_acc": val_acc,
            "train_acc": train_acc,
        }
        torch.save(checkpoint_data, ckpt_dir / "bc_last.pt")
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(checkpoint_data, ckpt_dir / "bc_latest.pt")
            print(f"  ↳ Neues Best-Modell gespeichert (val_acc={val_acc:.3f})")

    writer.close()
    print(f"\nBest validation accuracy: {best_val_acc:.3f}")
    print(f"Checkpoint: {ckpt_dir / 'bc_latest.pt'}")


if __name__ == "__main__":
    main()
