import argparse
import json
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np

from dataset import load_examples
from feature_schema import FEATURE_KEYS, vectorize_features


def latest_model_dir(models_dir, model_name):
    root = Path(models_dir) / model_name
    if not root.exists():
        return None
    versions = sorted([p for p in root.iterdir() if p.is_dir()])
    return versions[-1] if versions else None


def previous_model_dir(models_dir, model_name, current):
    root = Path(models_dir) / model_name
    if not root.exists():
        return None
    versions = sorted([p for p in root.iterdir() if p.is_dir()])
    if current in versions:
        idx = versions.index(current)
        if idx > 0:
            return versions[idx - 1]
    if len(versions) >= 2:
        return versions[-2]
    return None


def build_feature_matrix(examples):
    return np.array([vectorize_features(ex.get("features", {})) for ex in examples], dtype=float)


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


def summarize_dataset(examples):
    by_source = {}
    by_industry = {}
    by_window = {}
    for ex in examples:
        by_source[ex.get("source", "unknown")] = by_source.get(ex.get("source", "unknown"), 0) + 1
        by_industry[ex.get("industry_key", "unknown")] = by_industry.get(ex.get("industry_key", "unknown"), 0) + 1
        window_rule = ex.get("features", {}).get("window_rule", "unknown")
        by_window[window_rule] = by_window.get(window_rule, 0) + 1
    return by_source, by_industry, by_window


def evaluate_pressure(models_dir, examples):
    model_dir = latest_model_dir(models_dir, "pressure_selector")
    if not model_dir:
        return None
    model = joblib.load(model_dir / "model.pkl")
    with open(model_dir / "pressure_keys.json", "r", encoding="utf-8") as f:
        pressure_keys = json.load(f)

    X = build_feature_matrix(examples)
    y = []
    for ex in examples:
        active = set(ex.get("targets", {}).get("pressure_keys", []))
        y.append([1 if key in active else 0 for key in pressure_keys])
    y = np.array(y, dtype=int)

    if hasattr(model, "predict_proba"):
        y_scores = model.predict_proba(X)
    else:
        y_scores = model.decision_function(X)

    precision_at_3, recall_at_3 = precision_recall_at_3(y, y_scores)

    by_industry = {}
    for industry in set(ex.get("industry_key", "unknown") for ex in examples):
        idx = [i for i, ex in enumerate(examples) if ex.get("industry_key") == industry]
        if not idx:
            continue
        p, r = precision_recall_at_3(y[idx], y_scores[idx])
        by_industry[industry] = {"precision_at_3": p, "recall_at_3": r}

    false_pos = {}
    false_neg = {}
    for true_row, score_row in zip(y, y_scores):
        top_k = np.argsort(score_row)[-3:]
        true_indices = set(np.where(true_row == 1)[0])
        pred_indices = set(top_k)
        for idx in pred_indices - true_indices:
            key = pressure_keys[idx]
            false_pos[key] = false_pos.get(key, 0) + 1
        for idx in true_indices - pred_indices:
            key = pressure_keys[idx]
            false_neg[key] = false_neg.get(key, 0) + 1

    confusions = {
        "false_positives": sorted(false_pos.items(), key=lambda x: x[1], reverse=True)[:5],
        "false_negatives": sorted(false_neg.items(), key=lambda x: x[1], reverse=True)[:5],
    }

    prev_dir = previous_model_dir(models_dir, "pressure_selector", model_dir)
    prev_precision = None
    if prev_dir and (prev_dir / "metrics.json").exists():
        with open(prev_dir / "metrics.json", "r", encoding="utf-8") as f:
            prev_metrics = json.load(f)
        prev_precision = prev_metrics.get("precision_at_3")

    return {
        "model_version": model_dir.name,
        "precision_at_3": precision_at_3,
        "recall_at_3": recall_at_3,
        "by_industry": by_industry,
        "confusions": confusions,
        "previous_precision_at_3": prev_precision,
    }


def evaluate_boundary(models_dir, examples):
    model_dir = latest_model_dir(models_dir, "boundary_classifier")
    if not model_dir:
        return None
    model = joblib.load(model_dir / "model.pkl")
    with open(model_dir / "class_names.json", "r", encoding="utf-8") as f:
        class_names = json.load(f)

    X = build_feature_matrix(examples)
    y_true = [ex.get("targets", {}).get("boundary_class", "unknown") for ex in examples]
    y_pred_idx = model.predict(X)
    y_pred = [class_names[i] for i in y_pred_idx]

    accuracy = float(np.mean([1 if a == b else 0 for a, b in zip(y_true, y_pred)]))

    by_industry = {}
    for industry in set(ex.get("industry_key", "unknown") for ex in examples):
        idx = [i for i, ex in enumerate(examples) if ex.get("industry_key") == industry]
        if not idx:
            continue
        acc = float(
            np.mean([1 if y_true[i] == y_pred[i] else 0 for i in idx])
        )
        by_industry[industry] = {"accuracy": acc}

    confirm_total = sum(1 for label in y_true if label == "confirm_mappings")
    false_safe = sum(1 for t, p in zip(y_true, y_pred) if t == "confirm_mappings" and p == "stable")
    false_safe_rate = float(false_safe / confirm_total) if confirm_total > 0 else 0.0

    low_conf_total = 0
    low_conf_mismatch = 0
    for ex, pred in zip(examples, y_pred):
        level = ex.get("features", {}).get("mapping_confidence_level", 0)
        if level == 0:
            low_conf_total += 1
            if pred != "confirm_mappings":
                low_conf_mismatch += 1
    low_conf_rate = float(low_conf_mismatch / low_conf_total) if low_conf_total > 0 else 0.0

    return {
        "model_version": model_dir.name,
        "accuracy": accuracy,
        "by_industry": by_industry,
        "false_safe_rate": false_safe_rate,
        "low_confidence_mismatch_rate": low_conf_rate,
    }


def evaluate_calibrator(models_dir, examples):
    model_dir = latest_model_dir(models_dir, "calibrator")
    if not model_dir:
        return None
    model = joblib.load(model_dir / "model.pkl")
    X = build_feature_matrix(examples)
    y = []
    sources = []
    for ex in examples:
        benchmarks = ex.get("targets", {}).get("benchmark", [])
        if not benchmarks:
            y.append(None)
            sources.append(ex.get("source"))
            continue
        percentiles = [m.get("percentile") for m in benchmarks if isinstance(m.get("percentile"), (int, float))]
        if not percentiles:
            y.append(None)
            sources.append(ex.get("source"))
            continue
        y.append(float(sum(percentiles) / len(percentiles)))
        sources.append(ex.get("source"))

    y = np.array([val if val is not None else np.nan for val in y], dtype=float)
    preds = model.predict(X)

    def mae_for_source(source):
        idx = [i for i, s in enumerate(sources) if s == source and not np.isnan(y[i])]
        if not idx:
            return None
        return float(np.mean(np.abs(preds[idx] - y[idx])))

    mae_mock = mae_for_source("mock")
    mae_real = mae_for_source("real")

    return {
        "model_version": model_dir.name,
        "mae_mock": mae_mock,
        "mae_real": mae_real,
    }


def build_report(summary, output_dir):
    lines = []
    lines.append("# Learning Evaluation Report")
    lines.append("")
    lines.append("## 1) Dataset Summary")
    lines.append(f"- Total examples: {summary['dataset_total']}")
    lines.append(f"- By source: {summary['by_source']}")
    lines.append(f"- By industry: {summary['by_industry']}")
    lines.append(f"- Window distribution: {summary['by_window']}")
    lines.append("")
    lines.append("## 2) Pressure Selection Quality")
    if summary["pressure"]:
        lines.append(f"- Precision@3: {summary['pressure']['precision_at_3']:.3f}")
        lines.append(f"- Recall@3: {summary['pressure']['recall_at_3']:.3f}")
        lines.append(f"- Per-industry: {summary['pressure']['by_industry']}")
        lines.append(f"- Top confusions: {summary['pressure']['confusions']}")
    else:
        lines.append("- No pressure model found")
    lines.append("")
    lines.append("## 3) Boundary Safety")
    if summary["boundary"]:
        lines.append(f"- Accuracy: {summary['boundary']['accuracy']:.3f}")
        lines.append(f"- Per-industry: {summary['boundary']['by_industry']}")
        lines.append(f"- False-safe rate: {summary['boundary']['false_safe_rate']:.3f}")
        lines.append(
            f"- Low mapping confidence mismatch rate: {summary['boundary']['low_confidence_mismatch_rate']:.3f}"
        )
    else:
        lines.append("- No boundary model found")
    lines.append("")
    lines.append("## 4) Calibration Stability")
    if summary["calibrator"]:
        lines.append(f"- MAE (mock): {summary['calibrator']['mae_mock']}")
        lines.append(f"- MAE (real): {summary['calibrator']['mae_real']}")
    else:
        lines.append("- Calibrator not enabled")
    lines.append("")
    lines.append("## 5) Regression Gate")
    lines.append(f"- Status: {summary['regression_status']}")
    lines.append(f"- Details: {summary['regression_details']}")
    report_path = Path(output_dir) / "report.md"
    report_path.write_text("\n".join(lines), encoding="utf-8")
    return str(report_path)


def main():
    parser = argparse.ArgumentParser(description="Evaluate learning models")
    parser.add_argument("--models", required=True, help="Models directory")
    parser.add_argument("--dataset", required=True, help="Path to JSONL dataset")
    parser.add_argument("--output", required=True, help="Output directory")
    args = parser.parse_args()

    examples = load_examples(args.dataset)
    by_source, by_industry, by_window = summarize_dataset(examples)

    pressure = evaluate_pressure(args.models, examples)
    boundary = evaluate_boundary(args.models, examples)
    calibrator = evaluate_calibrator(args.models, examples)

    regression_status = "PASS"
    regression_details = []
    false_safe_rate = boundary["false_safe_rate"] if boundary else 0.0
    if false_safe_rate > 0.02:
        regression_status = "FAIL"
        regression_details.append(f"false-safe rate {false_safe_rate:.3f} > 0.020")
    if pressure and pressure.get("previous_precision_at_3") is not None:
        drop = pressure["previous_precision_at_3"] - pressure["precision_at_3"]
        if drop > 0.05:
            regression_status = "FAIL"
            regression_details.append(f"precision@3 drop {drop:.3f} > 0.050")
    if not regression_details:
        regression_details.append("no regression triggers")

    output_dir = Path(args.output) / datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    output_dir.mkdir(parents=True, exist_ok=True)

    summary = {
        "dataset_total": len(examples),
        "by_source": by_source,
        "by_industry": by_industry,
        "by_window": by_window,
        "pressure": pressure,
        "boundary": boundary,
        "calibrator": calibrator,
        "regression_status": regression_status,
        "regression_details": "; ".join(regression_details),
    }

    report_path = build_report(summary, output_dir)
    with open(output_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    with open(output_dir / "evaluation_summary.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "report_path": report_path,
                "regression_status": regression_status,
                "pressure_precision_at_3": pressure["precision_at_3"] if pressure else None,
                "boundary_accuracy": boundary["accuracy"] if boundary else None,
                "false_safe_rate": false_safe_rate,
            },
            f,
            indent=2,
        )

    print(json.dumps({"status": "ok", "report_path": report_path}))


if __name__ == "__main__":
    main()
