import argparse
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

try:
    from datasets import load_dataset
except Exception as e:
    raise RuntimeError("Missing dependency `datasets`. Install with: pip install -r scripts/calibration/requirements.txt") from e


MONEY_BUCKETS = ["micro", "small", "medium", "large", "jumbo"]


def bucket_money(amount: float) -> str:
    value = float(abs(amount)) if np.isfinite(amount) else 0.0
    if value < 250:
        return "micro"
    if value < 750:
        return "small"
    if value < 2500:
        return "medium"
    if value < 7500:
        return "large"
    return "jumbo"


def pct(values: np.ndarray, p: float) -> float:
    if values.size == 0:
        return 0.0
    return float(np.percentile(values, p))


def top_shares(amounts: np.ndarray) -> Tuple[float, float]:
    cleaned = np.abs(amounts[np.isfinite(amounts)])
    cleaned = cleaned[cleaned > 0]
    if cleaned.size == 0:
        return 0.0, 0.0
    sorted_vals = np.sort(cleaned)[::-1]
    total = float(np.sum(sorted_vals))
    if total <= 0:
        return 0.0, 0.0
    n = sorted_vals.size
    top10 = int(np.ceil(n * 0.10))
    top25 = int(np.ceil(n * 0.25))
    return float(np.sum(sorted_vals[:top10]) / total), float(np.sum(sorted_vals[:top25]) / total)


def find_amount_column(df: pd.DataFrame) -> Optional[str]:
    candidates = ["amount", "amt", "total", "value", "transaction_amount", "payment_amount", "price"]
    lower = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand in lower:
            return lower[cand]
    numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    if numeric_cols:
        return numeric_cols[0]
    return None


def sample_dataset_rows(name: str, split: str, max_rows: int, cache_dir: str) -> pd.DataFrame:
    ds = load_dataset(name, split=split, cache_dir=cache_dir)
    n = min(max_rows, len(ds))
    if n <= 0:
        return pd.DataFrame()
    rng = np.random.default_rng(1337)
    idx = rng.choice(len(ds), size=n, replace=False)
    return ds.select(idx).to_pandas()


@dataclass
class AmountStats:
    name: str
    row_count: int
    amount_col: Optional[str]
    p50: float
    p90: float
    p95: float
    p99: float
    median_top10: float
    median_top25: float
    job_value_delta_threshold: float


def estimate_job_value_delta_threshold(amounts: np.ndarray) -> float:
    cleaned = np.abs(amounts[np.isfinite(amounts)])
    cleaned = cleaned[cleaned > 0]
    if cleaned.size < 50:
        return 0.12

    rng = np.random.default_rng(2026)
    sample_size = int(min(600, max(150, cleaned.size)))
    reps = 160
    bucket_shares = []

    for _ in range(reps):
        sample = rng.choice(cleaned, size=sample_size, replace=True)
        buckets = np.array([bucket_money(x) for x in sample])
        shares = []
        for b in MONEY_BUCKETS:
            shares.append(float(np.mean(buckets == b)))
        bucket_shares.append(shares)

    mat = np.array(bucket_shares)
    std_by_bucket = np.std(mat, axis=0)
    avg_std = float(np.mean(std_by_bucket))
    proposed = max(0.10, min(0.18, 2.0 * avg_std))
    return float(proposed)


def median(values: List[float]) -> float:
    vals = [v for v in values if np.isfinite(v)]
    if not vals:
        return 0.0
    return float(np.median(np.array(vals)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="Output JSON path, e.g. fixtures/calibration/defaults_v1.json")
    parser.add_argument("--max_rows", type=int, default=8000, help="Hard cap rows loaded per dataset")
    args = parser.parse_args()

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    cache_dir = os.path.join(repo_root, "scripts", "calibration", ".cache")
    os.makedirs(cache_dir, exist_ok=True)

    datasets_to_try = [
        ("stephenhib/synthetic-payment-transactions", "train"),
        ("kohdified/synthetic-financial-data", "train"),
    ]

    amount_stats: List[AmountStats] = []
    notes: List[str] = []

    for name, split in datasets_to_try:
        try:
            df = sample_dataset_rows(name, split, args.max_rows, cache_dir)
        except Exception as e:
            notes.append(f"Skipped {name}: download/load failed ({type(e).__name__}).")
            continue

        if df.empty:
            notes.append(f"Skipped {name}: empty dataset split.")
            continue

        col = find_amount_column(df)
        if not col:
            notes.append(f"Skipped {name}: no usable numeric amount column found.")
            continue

        series = pd.to_numeric(df[col], errors="coerce").astype(float)
        amounts = series.to_numpy()
        amounts = amounts[np.isfinite(amounts)]
        if amounts.size == 0:
            notes.append(f"Skipped {name}: amount column had no numeric rows after coercion.")
            continue

        amounts = np.abs(amounts)
        amounts = amounts[amounts > 0]
        if amounts.size == 0:
            notes.append(f"Skipped {name}: amounts were all zero/empty after cleaning.")
            continue

        # Concentration behavior across multiple random batches ("jobs")
        rng = np.random.default_rng(2026)
        batch_shares_top10: List[float] = []
        batch_shares_top25: List[float] = []
        for _ in range(100):
            batch = rng.choice(amounts, size=min(250, amounts.size), replace=True)
            s10, s25 = top_shares(batch)
            batch_shares_top10.append(s10)
            batch_shares_top25.append(s25)

        delta = estimate_job_value_delta_threshold(amounts)

        amount_stats.append(
            AmountStats(
                name=name,
                row_count=int(amounts.size),
                amount_col=col,
                p50=pct(amounts, 50),
                p90=pct(amounts, 90),
                p95=pct(amounts, 95),
                p99=pct(amounts, 99),
                median_top10=median(batch_shares_top10),
                median_top25=median(batch_shares_top25),
                job_value_delta_threshold=delta,
            )
        )

    # Optional: lightweight anomaly dataset touch (no training; just sanity that we can load/slice)
    try:
        _ = load_dataset("keras-io/timeseries-anomaly-detection", split="train", cache_dir=cache_dir)
        notes.append("Loaded keras-io/timeseries-anomaly-detection (small slice) for offline anomaly sanity checks.")
    except Exception as e:
        notes.append(f"Skipped keras-io/timeseries-anomaly-detection: load failed ({type(e).__name__}).")

    # Aggregate recommendations
    job_value_thresholds = [s.job_value_delta_threshold for s in amount_stats]
    recommended_job_value = float(np.median(np.array(job_value_thresholds))) if job_value_thresholds else 0.12
    recommended_job_value = float(max(0.10, min(0.18, recommended_job_value)))

    top10_medians = [s.median_top10 for s in amount_stats]
    top25_medians = [s.median_top25 for s in amount_stats]
    median_top10 = float(np.median(np.array(top10_medians))) if top10_medians else 0.35
    median_top25 = float(np.median(np.array(top25_medians))) if top25_medians else 0.58

    top10_max = float(min(0.55, median_top10 + 0.10))
    top25_max = float(min(0.75, median_top25 + 0.10))

    out = {
        "version": "0.1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "recommended_delta_thresholds": {
            "job_value": round(recommended_job_value, 4),
            "decision_lag": 0.12,
            "flow": 0.12,
        },
        "recommended_concentration_max": {
            "top_10_percent_jobs_share": round(top10_max, 4),
            "top_25_percent_jobs_share": round(top25_max, 4),
        },
        "notes": [
            "Offline calibration only. HF datasets are used to stress-test heavy tails and resampling variance; they are never used at runtime.",
            "Decision lag + flow thresholds remain conservative defaults unless you extend this script with a timing/sequence mapping.",
        ]
        + notes
        + [
            f"Processed amount sources: {', '.join([s.name for s in amount_stats]) or 'none'}",
        ],
        "debug": {
            "amount_sources": [
                {
                    "name": s.name,
                    "row_count": s.row_count,
                    "amount_col": s.amount_col,
                    "p50": s.p50,
                    "p90": s.p90,
                    "p95": s.p95,
                    "p99": s.p99,
                    "median_top10": s.median_top10,
                    "median_top25": s.median_top25,
                    "job_value_delta_threshold": s.job_value_delta_threshold,
                }
                for s in amount_stats
            ]
        },
    }

    out_path = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
        f.write("\n")

    print(f"Wrote calibration defaults: {out_path}")


if __name__ == "__main__":
    main()

