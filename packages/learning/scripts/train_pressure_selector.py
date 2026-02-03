import argparse
import json
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.multiclass import OneVsRestClassifier
from sklearn.model_selection import train_test_split

from dataset import load_examples
from feature_schema import FEATURE_KEYS, vectorize_features


def build_pressure_keys(examples):
    keys = set()
    for ex in examples:
        for key in ex.get("targets", {}).get("pressure_keys", []):
            keys.add(key)
    return sorted(keys)


def build_feature_matrix(examples):
    return np.array([vectorize_features(ex.get("features", {})) for ex in examples], dtype=float)


def build_label_matrix(examples, pressure_keys):
    key_index = {k: i for i, k in enumerate(pressure_keys)}
    y = np.zeros((len(examples), len(pressure_keys)), dtype=int)
    for row_idx, ex in enumerate(examples):
        for key in ex.get("targets", {}).get("pressure_keys", []):
            if key in key_index:
                y[row_idx, key_index[key]] = 1
    return y


def precision_recall_at_3(y_true, y_scores):
    precisions = []
    recalls = []
    for true_row, score_row in zip(y_true, y_scores):
        top_k = np.argsort(score_row)[-3:]
        true_indices = np.where(true_row == 1)[0]
        if len(true_indices) == 0:
            continue
        hits = len(set(top_k) & set(true_indices))
        precisions.append(hits / 3.0)
        recalls.append(hits / len(true_indices))
    if not precisions:
        return 0.0, 0.0
    return float(np.mean(precisions)), float(np.mean(recalls))


def train_pressure_selector(dataset_path, output_dir):
    examples = load_examples(dataset_path)
    if len(examples) < 10:
        raise ValueError(f"Need at least 10 examples, found {len(examples)}")

    pressure_keys = build_pressure_keys(examples)
    if not pressure_keys:
        raise ValueError("No pressure keys found in dataset")

    X = build_feature_matrix(examples)
    y = build_label_matrix(examples, pressure_keys)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    base = LogisticRegression(max_iter=1000)
    model = OneVsRestClassifier(base)
    model.fit(X_train, y_train)

    if hasattr(model, "predict_proba"):
        y_scores = model.predict_proba(X_test)
    else:
        y_scores = model.decision_function(X_test)

    precision_at_3, recall_at_3 = precision_recall_at_3(y_test, y_scores)

    version = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    model_dir = Path(output_dir) / "pressure_selector" / version
    model_dir.mkdir(parents=True, exist_ok=True)

    joblib.dump(model, model_dir / "model.pkl")
    with open(model_dir / "pressure_keys.json", "w", encoding="utf-8") as f:
        json.dump(pressure_keys, f, indent=2)

    metadata = {
        "name": "pressure_selector",
        "version": version,
        "feature_schema": "signals_v1",
        "created_at": datetime.utcnow().isoformat(),
        "training_examples_count": len(X_train),
        "validation_examples_count": len(X_test),
        "feature_names": FEATURE_KEYS,
        "pressure_keys": pressure_keys,
        "metrics": {
            "precision_at_3": precision_at_3,
            "recall_at_3": recall_at_3,
        },
    }

    with open(model_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    with open(model_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metadata["metrics"], f, indent=2)

    return metadata


def main():
    parser = argparse.ArgumentParser(description="Train pressure selector model")
    parser.add_argument("--dataset", required=True, help="Path to JSONL dataset")
    parser.add_argument("--output", required=True, help="Models output directory")
    args = parser.parse_args()
    metadata = train_pressure_selector(args.dataset, args.output)
    print(json.dumps({"status": "ok", "version": metadata["version"]}))


if __name__ == "__main__":
    main()
