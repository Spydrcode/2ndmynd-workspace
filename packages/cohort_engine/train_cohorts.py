#!/usr/bin/env python3
"""
Train Cohort Engine (KMeans)

Clusters business signals into k cohorts and computes expected ranges.

SCHEMA PARITY: Uses EXACT feature keys from signals_v1_schema.json (TypeScript source of truth).
Any schema mismatch will cause training/inference to fail.

Usage:
    python train_cohorts.py --data_path=./data/learning/train --out_dir=./models/cohort_engine --k=8

Outputs:
    - model.pkl (KMeans model)
    - ranges.json (expected ranges per cohort)
    - meta.json (metadata including silhouette, outlier_rate, schema_hash)
"""

import argparse
import hashlib
import json
import pickle
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score


def load_signals_schema() -> Dict[str, Any]:
    """Load canonical signals_v1 schema from JSON."""
    schema_path = Path("./ml/schemas/signals_v1_schema.json")
    
    if not schema_path.exists():
        raise FileNotFoundError(
            f"Schema file not found: {schema_path}\n"
            "Run: node scripts/export_signals_schema.mjs"
        )
    
    with open(schema_path, "r") as f:
        schema = json.load(f)
    
    return schema


# Load canonical schema
SCHEMA = load_signals_schema()
SCHEMA_HASH = SCHEMA["schema_hash"]
ALL_FEATURE_KEYS = SCHEMA["feature_keys"]

# String keys (excluded from clustering)
STRING_KEYS = ["industry_key", "source", "window_rule"]

# Numeric keys for clustering (filter out string keys)
FEATURE_KEYS = [key for key in ALL_FEATURE_KEYS if key not in STRING_KEYS]

print(f"[Schema] Loaded {len(ALL_FEATURE_KEYS)} features (hash: {SCHEMA_HASH})")
print(f"[Schema] Using {len(FEATURE_KEYS)} numeric features for clustering")

# Benchmarkable metrics (must match types.ts)
BENCHMARKABLE_METRICS = [
    "avg_job_value",
    "total_revenue",
    "total_jobs",
    "avg_days_to_invoice",
    "avg_payment_lag_days",
    "pct_jobs_paid_on_time",
    "pct_quoted_won",
    "avg_quote_to_win_days",
    "avg_job_duration_days",
    "pct_jobs_with_followup",
    "avg_items_per_job",
    "revenue_concentration_top3",
]


def load_training_data(data_path: str) -> pd.DataFrame:
    """Load training examples from JSONL files."""
    
    data_dir = Path(data_path)
    
    if not data_dir.exists():
        raise FileNotFoundError(f"Data directory not found: {data_path}")
    
    jsonl_files = list(data_dir.glob("*.jsonl"))
    
    if not jsonl_files:
        raise FileNotFoundError(f"No JSONL files found in {data_path}")
    
    rows = []
    
    for file_path in jsonl_files:
        with open(file_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                
                example = json.loads(line)
                
                # Extract features
                features = example.get("features", {})
                
                # Only include if all required features present
                if all(key in features for key in FEATURE_KEYS):
                    row = {key: features[key] for key in FEATURE_KEYS}
                    row["example_id"] = example.get("id")
                    rows.append(row)
    
    if not rows:
        raise ValueError("No valid training examples found")
    
    df = pd.DataFrame(rows)
    
    print(f"[Train] Loaded {len(df)} examples from {len(jsonl_files)} files")
    
    return df


def compute_ranges(df: pd.DataFrame, labels: np.ndarray) -> Dict[int, List[Dict[str, Any]]]:
    """Compute expected ranges per cohort for benchmarkable metrics."""
    
    ranges = {}
    
    for cohort_id in np.unique(labels):
        cohort_df = df[labels == cohort_id]
        
        cohort_ranges = []
        
        for metric in BENCHMARKABLE_METRICS:
            if metric not in cohort_df.columns:
                continue
            
            values = cohort_df[metric].dropna()
            
            if len(values) < 5:
                continue
            
            cohort_ranges.append({
                "metric_key": metric,
                "min": float(values.min()),
                "max": float(values.max()),
                "median": float(values.median()),
                "p25": float(values.quantile(0.25)),
                "p75": float(values.quantile(0.75)),
            })
        
        ranges[int(cohort_id)] = cohort_ranges
    
    return ranges


def train_cohort_engine(data_path: str, out_dir: str, k: int = 8) -> None:
    """Train KMeans cohort engine and save outputs."""
    
    # Load data
    df = load_training_data(data_path)
    
    # Extract features for clustering
    X = df[FEATURE_KEYS].values
    
    # Handle NaNs (replace with median)
    medians = np.nanmedian(X, axis=0)
    for i in range(X.shape[1]):
        X[np.isnan(X[:, i]), i] = medians[i]
    
    # Standardize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    print(f"[Train] Training KMeans with k={k}...")
    
    # Train KMeans
    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10, max_iter=300)
    labels = kmeans.fit_predict(X_scaled)
    
    # Compute silhouette score
    silhouette = silhouette_score(X_scaled, labels)
    
    print(f"[Train] Silhouette score: {silhouette:.3f}")
    
    # Compute cluster sizes
    unique, counts = np.unique(labels, return_counts=True)
    min_cluster_size = int(counts.min())
    outlier_rate = (counts < max(50, 0.02 * len(labels))).sum() / k
    
    print(f"[Train] Min cluster size: {min_cluster_size}")
    print(f"[Train] Outlier rate: {outlier_rate:.2%}")
    
    # Compute expected ranges per cohort
    ranges = compute_ranges(df, labels)
    
    # Create output directory
    model_version = f"v{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
    out_path = Path(out_dir) / model_version
    out_path.mkdir(parents=True, exist_ok=True)
    
    # Save model
    model_data = {
        "kmeans": kmeans,
        "scaler": scaler,
        "feature_keys": FEATURE_KEYS,
    }
    
    with open(out_path / "model.pkl", "wb") as f:
        pickle.dump(model_data, f)
    
    print(f"[Train] Saved model to {out_path / 'model.pkl'}")
    
    # Save ranges
    with open(out_path / "ranges.json", "w") as f:
        json.dump(ranges, f, indent=2)
    
    print(f"[Train] Saved ranges to {out_path / 'ranges.json'}")
    
    # Save metadata
    meta = {
        "model_version": model_version,
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "n_clusters": k,
        "features_used": FEATURE_KEYS,
        "schema_version": SCHEMA["schema_version"],
        "schema_hash": SCHEMA_HASH,
        "training_rows": len(df),
        "silhouette_score": float(silhouette),
        "outlier_rate": float(outlier_rate),
        "min_cluster_size": min_cluster_size,
        "promoted": False,
    }
    
    with open(out_path / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)
    
    print(f"[Train] Saved metadata to {out_path / 'meta.json'}")
    print(f"[Train] ✓ Training complete: {model_version}")


def main():
    parser = argparse.ArgumentParser(description="Train Cohort Engine")
    parser.add_argument("--data_path", default="./data/learning/train", help="Path to training data")
    parser.add_argument("--out_dir", default="./models/cohort_engine", help="Output directory")
    parser.add_argument("--k", type=int, default=8, help="Number of clusters")
    
    args = parser.parse_args()
    
    train_cohort_engine(args.data_path, args.out_dir, args.k)


if __name__ == "__main__":
    main()
