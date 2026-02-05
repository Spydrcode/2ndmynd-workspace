#!/usr/bin/env python3
"""
Evaluate Cohort Engine

Computes evaluation metrics for trained cohort model:
- Silhouette score (cluster quality)
- Stability ARI (Adjusted Rand Index on re-sampling)
- Outlier rate (pct of clusters below min size threshold)
- Min cluster size

SCHEMA PARITY: Uses signals_v1_schema.json for feature loading.

Usage:
    python evaluate_cohorts.py --model_version=v20260205_120000 --data_path=./data/learning/train

Outputs:
    - Updates meta.json with eval metrics
"""

import argparse
import json
import pickle
from pathlib import Path
from typing import Dict, Any

import numpy as np
from sklearn.metrics import silhouette_score, adjusted_rand_score
from sklearn.model_selection import train_test_split


def load_signals_schema() -> Dict[str, Any]:
    """Load canonical signals_v1 schema."""
    schema_path = Path("./ml/schemas/signals_v1_schema.json")
    
    if not schema_path.exists():
        raise FileNotFoundError(
            f"Schema file not found: {schema_path}\n"
            "Run: node scripts/export_signals_schema.mjs"
        )
    
    with open(schema_path, "r") as f:
        return json.load(f)


def load_model(model_dir: str) -> Dict[str, Any]:
    """Load model from directory."""
    
    model_path = Path(model_dir) / "model.pkl"
    
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")
    
    with open(model_path, "rb") as f:
        model_data = pickle.load(f)
    
    return model_data


def load_training_data(data_path: str, feature_keys: list) -> np.ndarray:
    """Load training data (same as train_cohorts.py)."""
    
    import pandas as pd
    
    data_dir = Path(data_path)
    jsonl_files = list(data_dir.glob("*.jsonl"))
    
    rows = []
    
    for file_path in jsonl_files:
        with open(file_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                
                example = json.loads(line)
                features = example.get("features", {})
                
                if all(key in features for key in feature_keys):
                    row = {key: features[key] for key in feature_keys}
                    rows.append(row)
    
    df = pd.DataFrame(rows)
    X = df[feature_keys].values
    
    # Replace NaNs with median
    medians = np.nanmedian(X, axis=0)
    for i in range(X.shape[1]):
        X[np.isnan(X[:, i]), i] = medians[i]
    
    return X


def evaluate_cohort_engine(model_version: str, data_path: str, models_dir: str) -> None:
    """Evaluate cohort engine and update meta."""
    
    model_dir = Path(models_dir) / model_version
    
    if not model_dir.exists():
        raise FileNotFoundError(f"Model directory not found: {model_dir}")
    
    print(f"[Eval] Evaluating model: {model_version}")
    
    # Load model
    model_data = load_model(str(model_dir))
    kmeans = model_data["kmeans"]
    scaler = model_data["scaler"]
    feature_keys = model_data["feature_keys"]
    
    # Load data
    X = load_training_data(data_path, feature_keys)
    X_scaled = scaler.transform(X)
    
    print(f"[Eval] Loaded {len(X)} examples")
    
    # Predict labels
    labels = kmeans.predict(X_scaled)
    
    # Compute silhouette score
    silhouette = silhouette_score(X_scaled, labels)
    print(f"[Eval] Silhouette: {silhouette:.3f}")
    
    # Compute stability (ARI on 50/50 split)
    if len(X) >= 100:
        X1, X2 = train_test_split(X_scaled, test_size=0.5, random_state=42)
        labels1 = kmeans.predict(X1)
        labels2 = kmeans.predict(X2)
        
        # Re-cluster both halves and compare
        from sklearn.cluster import KMeans
        kmeans_half = KMeans(n_clusters=kmeans.n_clusters, random_state=42, n_init=5)
        labels1_fit = kmeans_half.fit_predict(X1)
        
        kmeans_half2 = KMeans(n_clusters=kmeans.n_clusters, random_state=43, n_init=5)
        labels2_fit = kmeans_half2.fit_predict(X2)
        
        # Compare original model predictions to re-fit
        ari = (adjusted_rand_score(labels1, labels1_fit) + adjusted_rand_score(labels2, labels2_fit)) / 2
        print(f"[Eval] Stability ARI: {ari:.3f}")
    else:
        ari = None
        print("[Eval] Not enough data for stability check (need ≥100 examples)")
    
    # Compute outlier rate
    unique, counts = np.unique(labels, return_counts=True)
    min_threshold = max(50, 0.02 * len(labels))
    outlier_clusters = (counts < min_threshold).sum()
    outlier_rate = outlier_clusters / len(unique)
    min_cluster_size = int(counts.min())
    
    print(f"[Eval] Outlier rate: {outlier_rate:.2%}")
    print(f"[Eval] Min cluster size: {min_cluster_size}")
    
    # Update meta.json
    meta_path = model_dir / "meta.json"
    
    with open(meta_path, "r") as f:
        meta = json.load(f)
    
    meta["silhouette_score"] = float(silhouette)
    meta["stability_ari"] = float(ari) if ari is not None else None
    meta["outlier_rate"] = float(outlier_rate)
    meta["min_cluster_size"] = min_cluster_size
    
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    
    print(f"[Eval] Updated {meta_path}")
    print("[Eval] ✓ Evaluation complete")


def main():
    parser = argparse.ArgumentParser(description="Evaluate Cohort Engine")
    parser.add_argument("--model_version", required=True, help="Model version to evaluate")
    parser.add_argument("--data_path", default="./data/learning/train", help="Path to training data")
    parser.add_argument("--models_dir", default="./models/cohort_engine", help="Models directory")
    
    args = parser.parse_args()
    
    evaluate_cohort_engine(args.model_version, args.data_path, args.models_dir)


if __name__ == "__main__":
    main()
