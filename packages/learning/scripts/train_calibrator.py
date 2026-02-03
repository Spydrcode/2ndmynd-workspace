import argparse
import json
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

from dataset import load_examples
from feature_schema import FEATURE_KEYS, vectorize_features


def build_feature_matrix(examples):
    return np.array([vectorize_features(ex.get("features", {})) for ex in examples], dtype=float)


def extract_targets(examples):
    y = []
    filtered = []
    for ex in examples:
        benchmarks = ex.get("targets", {}).get("benchmark", [])
        if not benchmarks:
            continue
        percentiles = [m.get("percentile") for m in benchmarks if isinstance(m.get("percentile"), (int, float))]
        if not percentiles:
            continue
        y.append(float(sum(percentiles) / len(percentiles)))
        filtered.append(ex)
    return filtered, np.array(y, dtype=float)


def train_calibrator(dataset_path, output_dir):
    examples = load_examples(dataset_path)
    filtered, y = extract_targets(examples)
    if len(filtered) < 10:
        raise ValueError("Not enough benchmark data to train calibrator")

    X = build_feature_matrix(filtered)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = Ridge(alpha=1.0)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    mae = float(mean_absolute_error(y_test, y_pred))

    version = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    model_dir = Path(output_dir) / "calibrator" / version
    model_dir.mkdir(parents=True, exist_ok=True)

    joblib.dump(model, model_dir / "model.pkl")

    metadata = {
        "name": "calibrator",
        "version": version,
        "feature_schema": "signals_v1",
        "created_at": datetime.utcnow().isoformat(),
        "training_examples_count": len(X_train),
        "validation_examples_count": len(X_test),
        "feature_names": FEATURE_KEYS,
        "metrics": {"mae": mae},
    }

    with open(model_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    with open(model_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metadata["metrics"], f, indent=2)

    return metadata


def main():
    parser = argparse.ArgumentParser(description="Train calibrator model")
    parser.add_argument("--dataset", required=True, help="Path to JSONL dataset")
    parser.add_argument("--output", required=True, help="Models output directory")
    args = parser.parse_args()
    metadata = train_calibrator(args.dataset, args.output)
    print(json.dumps({"status": "ok", "version": metadata["version"]}))


if __name__ == "__main__":
    main()
