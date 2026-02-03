"""
Learning Layer - Training Scripts

Training harness for 2ndmynd's continuous learning system.
Trains lightweight models for:
- Signal calibration (regression)
- Pressure selection (multi-label classification)
- Boundary classification (safety-critical)

Usage:
    python train.py --model calibrator --dataset ./runs/learning.db --output ./models/
    python train.py --model pressure_selector --dataset ./runs/learning.db --output ./models/
    python train.py --model boundary_classifier --dataset ./runs/learning.db --output ./models/
"""

import argparse
import json
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Tuple
import numpy as np
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.multioutput import MultiOutputClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, accuracy_score, precision_recall_fscore_support
import joblib


def load_dataset(db_path: str, filters: Dict[str, Any] = None) -> List[Dict]:
    """Load training examples from SQLite database"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    query = "SELECT * FROM training_examples WHERE 1=1"
    params = []
    
    if filters:
        if filters.get("source"):
            query += " AND source = ?"
            params.append(filters["source"])
        if filters.get("industry"):
            query += " AND industry = ?"
            params.append(filters["industry"])
        if filters.get("has_labels"):
            query += " AND labels IS NOT NULL"
    
    query += " ORDER BY created_at DESC"
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    
    columns = ["id", "created_at", "run_id", "source", "industry", 
               "feature_schema", "pipeline_version", "generator_version",
               "features", "targets", "labels", "indexed_at"]
    
    examples = []
    for row in rows:
        example = dict(zip(columns, row))
        example["features"] = json.loads(example["features"])
        example["targets"] = json.loads(example["targets"])
        if example["labels"]:
            example["labels"] = json.loads(example["labels"])
        examples.append(example)
    
    return examples


def extract_feature_matrix(examples: List[Dict]) -> Tuple[np.ndarray, List[str]]:
    """Convert examples to feature matrix"""
    # Collect all feature keys
    feature_keys = set()
    for ex in examples:
        feature_keys.update(ex["features"].keys())
    
    feature_keys = sorted(list(feature_keys))
    
    # Build matrix
    X = []
    for ex in examples:
        row = []
        for key in feature_keys:
            val = ex["features"].get(key)
            # Handle nulls and non-numeric values
            if val is None:
                row.append(0.0)
            elif isinstance(val, bool):
                row.append(1.0 if val else 0.0)
            elif isinstance(val, (int, float)):
                row.append(float(val))
            else:
                # String values - use hash for now (could use embeddings later)
                row.append(float(hash(str(val)) % 1000))
        X.append(row)
    
    return np.array(X), feature_keys


def train_calibrator(examples: List[Dict], output_dir: Path) -> Dict:
    """Train signal calibration model"""
    print(f"\n[CALIBRATOR] Training on {len(examples)} examples...")
    
    # Extract features
    X, feature_names = extract_feature_matrix(examples)
    
    # Extract target: average benchmark percentile
    y = []
    for ex in examples:
        metrics = ex["targets"].get("benchmark_metrics", [])
        if metrics:
            avg_percentile = np.mean([m["percentile"] for m in metrics])
            y.append(avg_percentile)
        else:
            y.append(50.0)  # Default neutral
    y = np.array(y)
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    
    # Train model
    model = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42)
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    
    # Save model
    model_dir = output_dir / "calibrator" / "v1"
    model_dir.mkdir(parents=True, exist_ok=True)
    
    joblib.dump(model, model_dir / "model.pkl")
    
    metadata = {
        "name": "calibrator",
        "version": "v1",
        "feature_schema": "signals_v1",
        "created_at": datetime.now().isoformat(),
        "training_examples_count": len(X_train),
        "validation_examples_count": len(X_test),
        "feature_names": feature_names,
        "metrics": {
            "mae": float(mae),
        },
        "config": {
            "n_estimators": 100,
            "max_depth": 10,
        }
    }
    
    with open(model_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    
    print(f"[CALIBRATOR] MAE: {mae:.2f}")
    print(f"[CALIBRATOR] Model saved to {model_dir}")
    
    return metadata


def train_pressure_selector(examples: List[Dict], output_dir: Path) -> Dict:
    """Train pressure selection model (multi-label classification)"""
    print(f"\n[PRESSURE] Training on {len(examples)} examples...")
    
    # Extract features
    X, feature_names = extract_feature_matrix(examples)
    
    # Build multi-label targets
    # Collect all pressure keys
    all_pressure_keys = set()
    for ex in examples:
        all_pressure_keys.update(ex["targets"].get("pressure_keys", []))
    
    pressure_keys = sorted(list(all_pressure_keys))
    print(f"[PRESSURE] Found {len(pressure_keys)} unique pressure keys")
    
    # Build binary label matrix
    y = []
    for ex in examples:
        active_keys = set(ex["targets"].get("pressure_keys", []))
        row = [1 if key in active_keys else 0 for key in pressure_keys]
        y.append(row)
    y = np.array(y)
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    
    # Train multi-output model
    base_model = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
    model = MultiOutputClassifier(base_model)
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    
    # Compute precision@3
    precision_at_3 = []
    for true_row, pred_row in zip(y_test, y_pred):
        # Get top 3 predicted pressures
        top_3_indices = np.argsort(pred_row)[-3:]
        true_indices = np.where(true_row == 1)[0]
        
        if len(true_indices) > 0:
            hits = len(set(top_3_indices) & set(true_indices))
            precision_at_3.append(hits / 3.0)
    
    avg_precision_at_3 = np.mean(precision_at_3) if precision_at_3 else 0.0
    
    # Save model
    model_dir = output_dir / "pressure_selector" / "v1"
    model_dir.mkdir(parents=True, exist_ok=True)
    
    joblib.dump(model, model_dir / "model.pkl")
    
    metadata = {
        "name": "pressure_selector",
        "version": "v1",
        "feature_schema": "signals_v1",
        "created_at": datetime.now().isoformat(),
        "training_examples_count": len(X_train),
        "validation_examples_count": len(X_test),
        "feature_names": feature_names,
        "pressure_keys": pressure_keys,
        "metrics": {
            "precision_at_3": float(avg_precision_at_3),
        },
        "config": {
            "n_estimators": 100,
            "max_depth": 10,
        }
    }
    
    with open(model_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    
    with open(model_dir / "pressure_keys.json", "w") as f:
        json.dump(pressure_keys, f)
    
    print(f"[PRESSURE] Precision@3: {avg_precision_at_3:.3f}")
    print(f"[PRESSURE] Model saved to {model_dir}")
    
    return metadata


def train_boundary_classifier(examples: List[Dict], output_dir: Path) -> Dict:
    """Train boundary classification model (safety-critical)"""
    print(f"\n[BOUNDARY] Training on {len(examples)} examples...")
    
    # Extract features
    X, feature_names = extract_feature_matrix(examples)
    
    # Extract boundary class labels
    y = []
    class_names = ["confirm_mappings", "needs_followup", "stable", "unknown"]
    class_to_idx = {c: i for i, c in enumerate(class_names)}
    
    for ex in examples:
        boundary_class = ex["targets"].get("boundary_class", "unknown")
        y.append(class_to_idx.get(boundary_class, class_to_idx["unknown"]))
    y = np.array(y)
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    
    # Train model
    model = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    
    # Compute false-safe rate (critical metric)
    # False-safe = predicting "stable" when it's actually "needs_followup" or "confirm_mappings"
    false_safe_count = 0
    total_unsafe = 0
    for true_label, pred_label in zip(y_test, y_pred):
        if true_label != class_to_idx["stable"] and true_label != class_to_idx["unknown"]:
            total_unsafe += 1
            if pred_label == class_to_idx["stable"]:
                false_safe_count += 1
    
    false_safe_rate = false_safe_count / total_unsafe if total_unsafe > 0 else 0.0
    
    # Save model
    model_dir = output_dir / "boundary_classifier" / "v1"
    model_dir.mkdir(parents=True, exist_ok=True)
    
    joblib.dump(model, model_dir / "model.pkl")
    
    metadata = {
        "name": "boundary_classifier",
        "version": "v1",
        "feature_schema": "signals_v1",
        "created_at": datetime.now().isoformat(),
        "training_examples_count": len(X_train),
        "validation_examples_count": len(X_test),
        "feature_names": feature_names,
        "class_names": class_names,
        "metrics": {
            "accuracy": float(accuracy),
            "false_safe_rate": float(false_safe_rate),  # CRITICAL: must minimize
        },
        "config": {
            "n_estimators": 100,
            "max_depth": 10,
        }
    }
    
    with open(model_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    
    with open(model_dir / "class_names.json", "w") as f:
        json.dump(class_names, f)
    
    print(f"[BOUNDARY] Accuracy: {accuracy:.3f}")
    print(f"[BOUNDARY] False-safe rate: {false_safe_rate:.3f} (CRITICAL)")
    print(f"[BOUNDARY] Model saved to {model_dir}")
    
    return metadata


def main():
    parser = argparse.ArgumentParser(description="Train 2ndmynd learning models")
    parser.add_argument("--model", required=True, 
                       choices=["calibrator", "pressure_selector", "boundary_classifier", "all"],
                       help="Model to train")
    parser.add_argument("--dataset", required=True, help="Path to learning.db")
    parser.add_argument("--output", required=True, help="Output directory for models")
    parser.add_argument("--source", choices=["mock", "real", "all"], default="all",
                       help="Filter examples by source")
    parser.add_argument("--min-examples", type=int, default=10,
                       help="Minimum examples required for training")
    
    args = parser.parse_args()
    
    # Load dataset
    filters = {}
    if args.source != "all":
        filters["source"] = args.source
    
    examples = load_dataset(args.dataset, filters)
    print(f"\n[TRAIN] Loaded {len(examples)} examples from {args.dataset}")
    
    if len(examples) < args.min_examples:
        print(f"[TRAIN] ERROR: Insufficient examples ({len(examples)} < {args.min_examples})")
        return
    
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Train models
    results = {}
    
    if args.model in ["calibrator", "all"]:
        results["calibrator"] = train_calibrator(examples, output_dir)
    
    if args.model in ["pressure_selector", "all"]:
        results["pressure_selector"] = train_pressure_selector(examples, output_dir)
    
    if args.model in ["boundary_classifier", "all"]:
        results["boundary_classifier"] = train_boundary_classifier(examples, output_dir)
    
    # Save training summary
    summary = {
        "trained_at": datetime.now().isoformat(),
        "dataset": args.dataset,
        "total_examples": len(examples),
        "source_filter": args.source,
        "models": results,
    }
    
    with open(output_dir / "training_summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n[TRAIN] Complete! Summary saved to {output_dir / 'training_summary.json'}")


if __name__ == "__main__":
    main()
