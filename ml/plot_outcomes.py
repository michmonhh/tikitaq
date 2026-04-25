"""
TIKITAQ RL — Outcome-Plot für rl_outcomes.csv.

Liest die CSV aus dem Self-Play-Loop und plottet die Schlüssel-Metriken
über die Iterationen. Bei v3 sind das u.a. Tore/Match, xG, Schüsse,
Box-Präsenz, Reward-Mean, vf_loss, explained_var.

Nutzung:
    python plot_outcomes.py [--csv rl_outcomes.csv] [--out outcomes.png]
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

import matplotlib.pyplot as plt


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--csv", default="rl_outcomes.csv")
    p.add_argument("--out", default="outcomes.png")
    p.add_argument("--show", action="store_true",
                   help="Plot anzeigen statt nur speichern")
    return p.parse_args()


def load_csv(path: Path) -> dict[str, list[float]]:
    cols: dict[str, list[float]] = {}
    with path.open() as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise RuntimeError("CSV ohne Header")
        for name in reader.fieldnames:
            cols[name] = []
        for row in reader:
            for name, val in row.items():
                try:
                    cols[name].append(float(val) if val else float('nan'))
                except (TypeError, ValueError):
                    cols[name].append(float('nan'))
    return cols


def main() -> None:
    args = parse_args()
    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise FileNotFoundError(csv_path)

    cols = load_csv(csv_path)
    iters = cols['iter']

    fig, axes = plt.subplots(3, 2, figsize=(14, 10))

    # Performance: Tore / xG / Schüsse
    ax = axes[0][0]
    ax.plot(iters, cols['goals_per_match'], '-o', label='Tore/Match', ms=3)
    ax.plot(iters, cols['xg_per_team'], '-s', label='xG/Team', ms=3)
    ax.set_title('Performance')
    ax.set_xlabel('Iteration'); ax.legend(); ax.grid(alpha=0.3)

    ax = axes[0][1]
    ax.plot(iters, cols['shots_per_team'], '-o', label='Schüsse/Team', ms=3)
    ax.plot(iters, cols['corners_per_team'], '-s', label='Ecken/Team', ms=3)
    ax.set_title('Volume-Metriken')
    ax.set_xlabel('Iteration'); ax.legend(); ax.grid(alpha=0.3)

    # Style: Box-Präsenz, Heimsieg
    ax = axes[1][0]
    ax.plot(iters, cols['box_presence_pct'], '-o', color='tab:green', ms=3)
    ax.set_title('Box-Präsenz [%]')
    ax.set_xlabel('Iteration'); ax.grid(alpha=0.3)

    ax = axes[1][1]
    ax.plot(iters, cols['home_win_pct'], '-o', color='tab:purple', ms=3)
    ax.axhline(y=46, color='gray', ls='--', alpha=0.5, label='Bundesliga ~46%')
    ax.set_title('Heimsieg-Quote [%]')
    ax.set_xlabel('Iteration'); ax.legend(); ax.grid(alpha=0.3)

    # Training: reward mean + losses
    ax = axes[2][0]
    ax.plot(iters, cols['reward_mean'], '-o', label='Reward-Mean', ms=3)
    ax.set_title('Reward-Mean (Daten-Pass-Avg)')
    ax.set_xlabel('Iteration'); ax.grid(alpha=0.3); ax.legend()

    ax = axes[2][1]
    if 'vf_loss_final' in cols and any(not _isnan(v) for v in cols['vf_loss_final']):
        ax2 = ax.twinx()
        ax.plot(iters, cols['vf_loss_final'], '-o', color='tab:red',
                label='vf_loss', ms=3)
        ax.set_ylabel('vf_loss', color='tab:red')
        if 'explained_var_final' in cols:
            ax2.plot(iters, cols['explained_var_final'], '-s',
                     color='tab:blue', label='explained_var', ms=3)
            ax2.set_ylabel('explained_var', color='tab:blue')
        ax.set_title('Critic-Diagnostik (Actor-Critic)')
    else:
        ax.plot(iters, cols['pg_loss_final'], '-o', ms=3)
        ax.set_title('pg_loss (final epoch)')
    ax.set_xlabel('Iteration'); ax.grid(alpha=0.3)

    fig.suptitle(f'TIKITAQ RL Outcomes — {csv_path.name} ({len(iters)} Iter.)',
                 fontsize=14)
    fig.tight_layout()

    out = Path(args.out)
    fig.savefig(out, dpi=120, bbox_inches='tight')
    print(f'Saved: {out}')

    if args.show:
        plt.show()


def _isnan(x: float) -> bool:
    return x != x


if __name__ == '__main__':
    main()
