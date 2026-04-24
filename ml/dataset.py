"""
TIKITAQ ML — Dataset-Loader.

Liest die von `scripts/aiArena.ts --export-training` erzeugten JSONL
(oder JSONL.gz) Dateien ein und stellt sie als PyTorch Dataset zur
Verfügung. Ein Datensatz = eine Ballführer-Entscheidung.

JSONL-Schema (pro Zeile) — gemäss src/engine/ai/training.ts:
    {
      "match_id": "MUC-DOR-1",
      "turn": 42,
      "team": 1,
      "game_time_min": 21.0,
      "score": { "team1": 0, "team2": 1 },
      "carrier": { "id", "position_label", "position", "origin", "stats", "fitness", "confidence" },
      "teammates": [ ... ],
      "opponents": [ ... ],
      "ball": { "position": [x, y] },
      "intent": { "attack_side", "turns_valid" } | null,
      "options": [
        { "type", "score", "success_chance", "reward", "target", "receiver_id" },
        ...
      ],
      "chosen_option_index": int,
      "ai_version": "stage4"
    }
"""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable, Iterator

import torch
from torch.utils.data import Dataset, IterableDataset

from features import encode_sample, GLOBAL_FEATURE_DIM, OPTION_FEATURE_DIM


def _open_maybe_gz(path: Path) -> Iterable[str]:
    """Liefert Zeilen aus .jsonl oder .jsonl.gz."""
    if path.suffix == ".gz":
        return gzip.open(path, "rt", encoding="utf-8")
    return open(path, "r", encoding="utf-8")


def iter_records(paths: list[Path]) -> Iterator[dict[str, Any]]:
    """Iteriert durch alle Records in den angegebenen Dateien (streaming)."""
    for path in paths:
        with _open_maybe_gz(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                yield json.loads(line)


def count_records(paths: list[Path]) -> int:
    """Zählt die Records — für len() im Dataset."""
    n = 0
    for _ in iter_records(paths):
        n += 1
    return n


class TikitaqBCDataset(Dataset):
    """
    In-Memory Dataset für Behavior Cloning.

    Alle Records werden vorab einmal durch den Feature-Encoder gejagt und
    als Tensoren gecached. Für > 1 Mio Samples sollten wir streamen oder
    mmap nutzen; bei < 500k Samples (entspricht ~20 Round Robins) passt
    das problemlos in den RAM (~200 MB bei Float32).
    """

    def __init__(self, paths: list[Path], max_options: int = 16):
        self.max_options = max_options
        self.globals: list[torch.Tensor] = []        # [N, GLOBAL_DIM]
        self.option_feats: list[torch.Tensor] = []   # [N, max_options, OPTION_DIM]
        self.option_masks: list[torch.Tensor] = []   # [N, max_options] — 1 wenn valide Option, 0 wenn Padding
        self.chosen: list[int] = []                  # [N]

        for rec in iter_records(paths):
            enc = encode_sample(rec, max_options=max_options)
            self.globals.append(enc["global"])
            self.option_feats.append(enc["options"])
            self.option_masks.append(enc["mask"])
            self.chosen.append(enc["chosen"])

        # Stack in einen Tensor für effiziente Batch-Indexierung
        self._g = torch.stack(self.globals)
        self._o = torch.stack(self.option_feats)
        self._m = torch.stack(self.option_masks)
        self._c = torch.tensor(self.chosen, dtype=torch.long)
        # Die Listen nicht mehr gebraucht — GC kann sie abräumen
        del self.globals
        del self.option_feats
        del self.option_masks

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
        return GLOBAL_FEATURE_DIM

    @property
    def option_dim(self) -> int:
        return OPTION_FEATURE_DIM


def find_dataset_files(datasets_dir: Path, pattern: str = "*.jsonl*") -> list[Path]:
    """Findet alle JSONL(.gz)-Dateien in einem Verzeichnis, sortiert."""
    files = sorted(datasets_dir.glob(pattern))
    files = [f for f in files if f.suffix in (".jsonl", ".gz")]
    return files


# ── Streaming-Dataset für große Datenmengen (> 1 GB) ──────────────

def _hash_bucket(s: str, modulo: int) -> int:
    """Deterministischer Hash einer String-ID modulo N."""
    h = hashlib.md5(s.encode("utf-8")).hexdigest()
    return int(h[:8], 16) % modulo


class TikitaqBCStreamingDataset(IterableDataset):
    """
    Streaming-Dataset für große Datenmengen die nicht in den RAM passen.

    Liest die JSONL-Dateien Zeile für Zeile, parst + encodet on-the-fly.
    RAM-Bedarf konstant (~Batch-Size), egal wie groß der Datensatz ist.

    Train/Val-Split erfolgt deterministisch über den Hash von `match_id`:
    - Samples mit hash % 10 < val_split*10 → Validation
    - Rest → Training

    Nachteil: kein echter Shuffle (Dateien werden sequenziell gelesen).
    Lösung: Daten werden in einer Buffer-Window zufällig gemixt.
    """

    def __init__(
        self,
        paths: list[Path],
        max_options: int = 16,
        split: str = "train",
        val_fraction: float = 0.1,
        shuffle_buffer: int = 2048,
    ):
        super().__init__()
        self.paths = paths
        self.max_options = max_options
        assert split in ("train", "val", "all")
        self.split = split
        # val-Bucket: 0..bucket_threshold-1
        self.bucket_threshold = int(val_fraction * 10)
        self.shuffle_buffer_size = shuffle_buffer if split == "train" else 0

    def _belongs_to_split(self, match_id: str) -> bool:
        if self.split == "all":
            return True
        bucket = _hash_bucket(match_id, 10)
        is_val = bucket < self.bucket_threshold
        return is_val if self.split == "val" else (not is_val)

    def _raw_iter(self) -> Iterator[dict[str, torch.Tensor]]:
        import random
        for rec in iter_records(self.paths):
            if not self._belongs_to_split(rec.get("match_id", "")):
                continue
            yield encode_sample(rec, max_options=self.max_options)

    def __iter__(self) -> Iterator[dict[str, torch.Tensor]]:
        # Optional Shuffle-Buffer: sammelt N Samples, gibt sie zufällig raus.
        # Kein echter Global-Shuffle, aber lokaler Shuffle reicht bei
        # Dateien die selbst schon unsortiert sind (match-für-match).
        import random
        if self.shuffle_buffer_size <= 0:
            yield from self._raw_iter()
            return

        buffer: list[dict[str, torch.Tensor]] = []
        for sample in self._raw_iter():
            if len(buffer) < self.shuffle_buffer_size:
                buffer.append(sample)
            else:
                idx = random.randrange(self.shuffle_buffer_size)
                yield buffer[idx]
                buffer[idx] = sample
        random.shuffle(buffer)
        yield from buffer

    @property
    def global_dim(self) -> int:
        return GLOBAL_FEATURE_DIM

    @property
    def option_dim(self) -> int:
        return OPTION_FEATURE_DIM
