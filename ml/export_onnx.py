"""
TIKITAQ ML — ONNX-Export für Browser-Inferenz.

Konvertiert ein PyTorch-Checkpoint in eine ONNX-Datei, die mit
onnxruntime-web (Browser) oder onnxruntime-node (TypeScript-Arena)
geladen werden kann.

Nutzung:
    python export_onnx.py --checkpoint checkpoints/bc_latest.pt --out ../public/bc_policy.onnx
"""

from __future__ import annotations

import argparse
from pathlib import Path

import torch

from model import PolicyNet


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="ONNX-Export für BC-Policy")
    p.add_argument("--checkpoint", required=True,
                   help="Pfad zu .pt-Checkpoint")
    p.add_argument("--out", default="bc_policy.onnx",
                   help="Output-Pfad für .onnx")
    p.add_argument("--opset", type=int, default=17)
    return p.parse_args()


def main() -> None:
    args = parse_args()

    ckpt_path = Path(args.checkpoint)
    if not ckpt_path.exists():
        raise FileNotFoundError(f"Checkpoint nicht gefunden: {ckpt_path}")
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=True)

    # Modell rekonstruieren
    model = PolicyNet(
        global_dim=ckpt["global_dim"],
        option_dim=ckpt["option_dim"],
        context_dim=ckpt["context_dim"],
        hidden_dim=ckpt["hidden_dim"],
        dropout=ckpt["dropout"],
    )
    # strict=False: BC-Checkpoints haben keinen value_head — der wird beim
    # Export ohnehin nicht aufgerufen (forward() nutzt ihn nicht). Fehlende
    # Keys werden mit Default-Init aufgefüllt, das ist hier harmlos.
    res = model.load_state_dict(ckpt["model_state"], strict=False)
    if res.missing_keys:
        print(f"  ℹ Frische Init für {len(res.missing_keys)} Keys "
              f"(value_head wird im Export nicht genutzt)")
    if res.unexpected_keys:
        print(f"  ⚠ Unerwartete Keys ignoriert: {res.unexpected_keys}")
    model.eval()

    # Dummy-Input in den erwarteten Dimensionen
    max_options = ckpt["max_options"]
    B = 1
    dummy_global = torch.zeros(B, ckpt["global_dim"])
    dummy_options = torch.zeros(B, max_options, ckpt["option_dim"])
    dummy_mask = torch.ones(B, max_options)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        model,
        (dummy_global, dummy_options, dummy_mask),
        str(out_path),
        export_params=True,
        opset_version=args.opset,
        input_names=["global", "options", "mask"],
        output_names=["scores"],
        dynamic_axes={
            "global": {0: "batch"},
            "options": {0: "batch"},
            "mask": {0: "batch"},
            "scores": {0: "batch"},
        },
    )

    print(f"ONNX-Modell exportiert: {out_path}")
    print(f"  global_dim: {ckpt['global_dim']}")
    print(f"  option_dim: {ckpt['option_dim']}")
    print(f"  max_options: {max_options}")
    print(f"  val_acc: {ckpt.get('val_acc', 'n/a')}")
    print(f"  File size: {out_path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
