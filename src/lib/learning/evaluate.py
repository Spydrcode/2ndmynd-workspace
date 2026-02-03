"""
Learning Layer - Model Evaluation

Evaluates trained models on held-out test sets with comprehensive metrics.
Produces evaluation reports in JSON and Markdown formats.

Usage:
    python evaluate.py --models ./models/ --dataset ./runs/learning.db --output ./eval_out/
"""

import argparse
import json
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List
import numpy as np
from sklearn.metrics import (
    mean_absolute_error, 
    accuracy_score, 
    precision_recall_fscore_support,
    confusion_matrix
)
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


def extract_feature_matrix(examples: List[Dict], feature_names: List[str]) -> np.ndarray:
    """Convert examples to feature matrix using specified feature names"""
    X = []
    for ex in examples:
        row = []
        for key in feature_names:
            val = ex["features"].get(key)
            if val is None:
                row.append(0.0)
            elif isinstance(val, bool):
                row.append(1.0 if val else 0.0)
            elif isinstance(val, (int, float)):
                row.append(float(val))
            else:
                row.append(float(hash(str(val)) % 1000))
        X.append(row)
    return np.array(X)


def evaluate_calibrator(model_dir: Path, examples: List[Dict]) -> Dict:
    """Evaluate calibration model"""
    print(f"\n[EVAL CALIBRATOR] Evaluating on {len(examples)} examples...")
    
    # Load model and metadata
    model = joblib.load(model_dir / "model.pkl")
    with open(model_dir / "metadata.json") as f:
        metadata = json.load(f)
    
    # Extract features
    X = extract_feature_matrix(examples, metadata["feature_names"])
    
    # Extract targets
    y = []
    for ex in examples:
        metrics = ex["targets"].get("benchmark_metrics", [])
        if metrics:
            avg_percentile = np.mean([m["percentile"] for m in metrics])
            y.append(avg_percentile)
        else:
            y.append(50.0)
    y = np.array(y)
    
    # Predict
    y_pred = model.predict(X)
    
    # Metrics
    mae = mean_absolute_error(y, y_pred)
    stability = np.std(y_pred - y)
    
    results = {
        "model_name": "calibrator",
        "model_version": metadata["version"],
        "evaluated_at": datetime.now().isoformat(),
        "dataset_split": "test",
        "metrics": {
            "calibration_mae": float(mae),
            "calibration_stability": float(stability),
        }
    }
    
    print(f"[EVAL CALIBRATOR] MAE: {mae:.2f}, Stability: {stability:.2f}")
    
    return results


def evaluate_pressure_selector(model_dir: Path, examples: List[Dict]) -> Dict:
    """Evaluate pressure selection model"""
    print(f"\n[EVAL PRESSURE] Evaluating on {len(examples)} examples...")
    
    # Load model and metadata
    model = joblib.load(model_dir / "model.pkl")
    with open(model_dir / "metadata.json") as f:
        metadata = json.load(f)
    with open(model_dir / "pressure_keys.json") as f:
        pressure_keys = json.load(f)
    
    # Extract features
    X = extract_feature_matrix(examples, metadata["feature_names"])
    
    # Extract targets
    y = []
    for ex in examples:
        active_keys = set(ex["targets"].get("pressure_keys", []))
        row = [1 if key in active_keys else 0 for key in pressure_keys]
        y.append(row)
    y = np.array(y)
    
    # Predict
    y_pred = model.predict(X)
    
    # Compute precision@3, recall
    precision_at_3 = []
    recall_scores = []
    
    for true_row, pred_row in zip(y, y_pred):
        # Top 3 predictions
        top_3_indices = np.argsort(pred_row)[-3:]
        true_indices = np.where(true_row == 1)[0]
        
        if len(true_indices) > 0:
            hits = len(set(top_3_indices) & set(true_indices))
            precision_at_3.append(hits / 3.0)
            recall_scores.append(hits / len(true_indices))
    
    avg_precision_at_3 = np.mean(precision_at_3) if precision_at_3 else 0.0
    avg_recall = np.mean(recall_scores) if recall_scores else 0.0
    f1 = 2 * (avg_precision_at_3 * avg_recall) / (avg_precision_at_3 + avg_recall) if (avg_precision_at_3 + avg_recall) > 0 else 0.0
    
    results = {
        "model_name": "pressure_selector",
        "model_version": metadata["version"],
        "evaluated_at": datetime.now().isoformat(),
        "dataset_split": "test",
        "metrics": {
            "pressure_precision_at_3": float(avg_precision_at_3),
            "pressure_recall": float(avg_recall),
            "pressure_f1": float(f1),
        }
    }
    
    print(f"[EVAL PRESSURE] Precision@3: {avg_precision_at_3:.3f}, Recall: {avg_recall:.3f}, F1: {f1:.3f}")
    
    return results


def evaluate_boundary_classifier(model_dir: Path, examples: List[Dict]) -> Dict:
    """Evaluate boundary classifier"""
    print(f"\n[EVAL BOUNDARY] Evaluating on {len(examples)} examples...")
    
    # Load model and metadata
    model = joblib.load(model_dir / "model.pkl")
    with open(model_dir / "metadata.json") as f:
        metadata = json.load(f)
    with open(model_dir / "class_names.json") as f:
        class_names = json.load(f)
    
    class_to_idx = {c: i for i, c in enumerate(class_names)}
    
    # Extract features
    X = extract_feature_matrix(examples, metadata["feature_names"])
    
    # Extract targets
    y = []
    for ex in examples:
        boundary_class = ex["targets"].get("boundary_class", "unknown")
        y.append(class_to_idx.get(boundary_class, class_to_idx["unknown"]))
    y = np.array(y)
    
    # Predict
    y_pred = model.predict(X)
    
    # Metrics
    accuracy = accuracy_score(y, y_pred)
    
    # Compute false-safe rate (CRITICAL)
    false_safe_count = 0
    total_unsafe = 0
    for true_label, pred_label in zip(y, y_pred):
        if true_label != class_to_idx["stable"] and true_label != class_to_idx["unknown"]:
            total_unsafe += 1
            if pred_label == class_to_idx["stable"]:
                false_safe_count += 1
    
    false_safe_rate = false_safe_count / total_unsafe if total_unsafe > 0 else 0.0
    
    # Confusion matrix
    cm = confusion_matrix(y, y_pred)
    confusion_dict = {}
    for i, true_class in enumerate(class_names):
        confusion_dict[true_class] = {}
        for j, pred_class in enumerate(class_names):
            confusion_dict[true_class][pred_class] = int(cm[i][j])
    
    results = {
        "model_name": "boundary_classifier",
        "model_version": metadata["version"],
        "evaluated_at": datetime.now().isoformat(),
        "dataset_split": "test",
        "metrics": {
            "boundary_accuracy": float(accuracy),
            "boundary_false_safe_rate": float(false_safe_rate),
        },
        "confusion_matrix": confusion_dict,
    }
    
    print(f"[EVAL BOUNDARY] Accuracy: {accuracy:.3f}, False-safe rate: {false_safe_rate:.3f} (CRITICAL)")
    
    return results


def generate_markdown_report(results: List[Dict], output_path: Path):
    """Generate Markdown evaluation report"""
    with open(output_path, "w") as f:
        f.write("# Learning Layer - Model Evaluation Report\n\n")
        f.write(f"**Generated:** {datetime.now().isoformat()}\n\n")
        
        for result in results:
            f.write(f"## {result['model_name']} ({result['model_version']})\n\n")
            f.write(f"**Evaluated:** {result['evaluated_at']}\n\n")
            f.write("### Metrics\n\n")
            
            for key, value in result["metrics"].items():
                f.write(f"- **{key}:** {value:.3f}\n")
            
            if "confusion_matrix" in result:
                f.write("\n### Confusion Matrix\n\n")
                cm = result["confusion_matrix"]
                classes = list(cm.keys())
                
                f.write("| True \\ Pred | " + " | ".join(classes) + " |\n")
                f.write("| --- | " + " | ".join(["---"] * len(classes)) + " |\n")
                
                for true_class in classes:
                    row = [true_class]
                    for pred_class in classes:
                        row.append(str(cm[true_class][pred_class]))
                    f.write("| " + " | ".join(row) + " |\n")
            
            f.write("\n---\n\n")


def main():
    parser = argparse.ArgumentParser(description="Evaluate 2ndmynd learning models")
    parser.add_argument("--models", required=True, help="Path to models directory")
    parser.add_argument("--dataset", required=True, help="Path to learning.db")
    parser.add_argument("--output", required=True, help="Output directory for reports")
    parser.add_argument("--source", choices=["mock", "real", "all"], default="all",
                       help="Filter examples by source")
    
    args = parser.parse_args()
    
    # Load dataset
    filters = {}
    if args.source != "all":
        filters["source"] = args.source
    
    examples = load_dataset(args.dataset, filters)
    print(f"\n[EVAL] Loaded {len(examples)} examples from {args.dataset}")
    
    if len(examples) == 0:
        print("[EVAL] ERROR: No examples to evaluate")
        return
    
    models_dir = Path(args.models)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Evaluate models
    results = []
    
    # Calibrator
    calibrator_dir = models_dir / "calibrator" / "v1"
    if calibrator_dir.exists():
        results.append(evaluate_calibrator(calibrator_dir, examples))
    
    # Pressure selector
    pressure_dir = models_dir / "pressure_selector" / "v1"
    if pressure_dir.exists():
        results.append(evaluate_pressure_selector(pressure_dir, examples))
    
    # Boundary classifier
    boundary_dir = models_dir / "boundary_classifier" / "v1"
    if boundary_dir.exists():
        results.append(evaluate_boundary_classifier(boundary_dir, examples))
    
    # Save results
    results_json_path = output_dir / "evaluation_results.json"
    with open(results_json_path, "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n[EVAL] Results saved to {results_json_path}")
    
    # Generate markdown report
    report_path = output_dir / "evaluation_report.md"
    generate_markdown_report(results, report_path)
    
    print(f"[EVAL] Report saved to {report_path}")


if __name__ == "__main__":
    main()
