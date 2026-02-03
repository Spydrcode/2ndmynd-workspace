import argparse
import json
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

from dataset import load_examples
from feature_schema import FEATURE_KEYS, vectorize_features


def build_feature_matrix(examples):
    return np.array([vectorize_features(ex.get("features", {})) for ex in examples], dtype=float)


def build_labels(examples):
    labels = [ex.get("targets", {}).get("boundary_class", "unknown") for ex in examples]
    encoder = LabelEncoder()
    y = encoder.fit_transform(labels)
    return y, encoder


def train_boundary_classifier(dataset_path, output_dir):
    examples = load_examples(dataset_path)
    if len(examples) < 10:
        raise ValueError(f"Need at least 10 examples, found {len(examples)}")

    X = build_feature_matrix(examples)
    y, encoder = build_labels(examples)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = LogisticRegression(max_iter=1000, multi_class="auto")
    model.fit(X_train, y_train)

    accuracy = float(model.score(X_test, y_test))

    version = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    model_dir = Path(output_dir) / "boundary_classifier" / version
    model_dir.mkdir(parents=True, exist_ok=True)

    joblib.dump(model, model_dir / "model.pkl")
    with open(model_dir / "class_names.json", "w", encoding="utf-8") as f:
        json.dump(list(encoder.classes_), f, indent=2)

    metadata = {
        "name": "boundary_classifier",
        "version": version,
        "feature_schema": "signals_v1",
        "created_at": datetime.utcnow().isoformat(),
        "training_examples_count": len(X_train),
        "validation_examples_count": len(X_test),
        "feature_names": FEATURE_KEYS,
        "class_names": list(encoder.classes_),
        "metrics": {"accuracy": accuracy},
    }

    with open(model_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    with open(model_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metadata["metrics"], f, indent=2)

    return metadata


def main():
    parser = argparse.ArgumentParser(description="Train boundary classifier model")
    parser.add_argument("--dataset", required=True, help="Path to JSONL dataset")
    parser.add_argument("--output", required=True, help="Models output directory")
    args = parser.parse_args()
    metadata = train_boundary_classifier(args.dataset, args.output)
    print(json.dumps({"status": "ok", "version": metadata["version"]}))


if __name__ == "__main__":
    main()
