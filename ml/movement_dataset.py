"""
TIKITAQ ML — Movement-Dataset (Tier 2).

Liest die `*_movement.jsonl.gz`-Dateien (von aiArena.ts erzeugt) und
liefert Movement-State+Action+Label-Tensoren. Streaming-fähig für große
Datenmengen — pro Match ~3000 Records, mehrere Hundert Matches → MB-GB.

Spiegel zu rl_dataset.py / dataset.py, aber für den Movement-Recordtyp.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any, Iterator

import torch
from torch.utils.data import Dataset, IterableDataset

from movement_features import (
    encode_movement_sample, MOVEMENT_GLOBAL_DIM, MOVEMENT_OPTION_DIM,
    MOVEMENT_MAX_OPTIONS,
)


def _open_maybe_gz(path: Path):
    if str(path).endswith(".gz"):
        return gzip.open(path, "rt")
    return open(path, "r")


def _iter_movement_records(paths: list[Path]) -> Iterator[dict[str, Any]]:
    """Iteriert robust über alle Movement-Records aus mehreren Dateien.
    Skip korrupte gzip-Files (frühere Engine-Bugs hatten EOS-Probleme)."""
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
                    if rec.get("record_type") != "movement":
                        continue
                    yield rec
        except (EOFError, OSError) as e:
            print(f"⚠ Skipping {path.name}: {e}")


class TikitaqMovementDataset(Dataset):
    """In-Memory Movement-Dataset für BC-Training.

    Lädt alle Records einmal in Tensoren. Für sehr große Daten siehe
    StreamingMovementDataset unten.
    """

    def __init__(self, paths: list[Path], max_options: int = MOVEMENT_MAX_OPTIONS):
        self.globals: list[torch.Tensor] = []
        self.options: list[torch.Tensor] = []
        self.masks: list[torch.Tensor] = []
        self.chosen: list[int] = []

        count = 0
        for rec in _iter_movement_records(paths):
            try:
                enc = encode_movement_sample(rec, max_options=max_options)
            except Exception as e:
                print(f"⚠ Encoding fail at record {count}: {e}")
                continue
            self.globals.append(enc["global"])
            self.options.append(enc["options"])
            self.masks.append(enc["mask"])
            self.chosen.append(enc["chosen"])
            count += 1

        if count == 0:
            raise RuntimeError("Keine Movement-Records gefunden")

        self._g = torch.stack(self.globals)
        self._o = torch.stack(self.options)
        self._m = torch.stack(self.masks)
        self._c = torch.tensor(self.chosen, dtype=torch.long)
        del self.globals, self.options, self.masks, self.chosen

        print(f"  Loaded {count} movement transitions from {len(paths)} files")
        print(f"  global dim={self._g.shape[1]}, option dim={self._o.shape[2]}")

    def __len__(self) -> int:
        return self._c.shape[0]

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        return {
            "global": self._g[idx],
            "options": self._o[idx],
            "mask": self._m[idx],
            "chosen": self._c[idx],
        }

    @property
    def global_dim(self) -> int:
        return MOVEMENT_GLOBAL_DIM

    @property
    def option_dim(self) -> int:
        return MOVEMENT_OPTION_DIM


class StreamingMovementDataset(IterableDataset):
    """Streaming-Variante für große Datenmengen.
    Nicht-shuffleable, daher Worker-mit-DataLoader-shuffle-buffer empfohlen.
    """

    def __init__(self, paths: list[Path], max_options: int = MOVEMENT_MAX_OPTIONS):
        self.paths = paths
        self.max_options = max_options

    def __iter__(self) -> Iterator[dict[str, torch.Tensor]]:
        for rec in _iter_movement_records(self.paths):
            try:
                yield encode_movement_sample(rec, max_options=self.max_options)
            except Exception:
                continue
