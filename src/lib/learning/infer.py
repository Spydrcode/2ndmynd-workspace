"""
Learning Layer - Model Inference Script
"""

import argparse
import json
from pathlib import Path
import sys
import numpy as np
import joblib

scripts_dir = Path(__file__).resolve().parents[3] / "packages" / "learning" / "scripts"
sys.path.append(str(scripts_dir))

from feature_schema import FEATURE_KEYS, vectorize_features


def latest_model_dir(models_dir: Path, name: str):
    root = models_dir / name
    if not root.exists():
        return None
    versions = sorted([p for p in root.iterdir() if p.is_dir()])
    return versions[-1] if versions else None


def load_models(models_dir: Path):
    models = {}

    calibrator_path = latest_model_dir(models_dir, "calibrator")
    if calibrator_path and (calibrator_path / "model.pkl").exists():
        models["calibrator"] = {
            "model": joblib.load(calibrator_path / "model.pkl"),
            "version": (json.load(open(calibrator_path / "metadata.json"))["version"]
                        if (calibrator_path / "metadata.json").exists() else calibrator_path.name),
        }

    pressure_path = latest_model_dir(models_dir, "pressure_selector")
    if pressure_path and (pressure_path / "model.pkl").exists():
        models["pressure_selector"] = {
            "model": joblib.load(pressure_path / "model.pkl"),
            "pressure_keys": json.load(open(pressure_path / "pressure_keys.json")),
            "version": (json.load(open(pressure_path / "metadata.json"))["version"]
                        if (pressure_path / "metadata.json").exists() else pressure_path.name),
        }

    boundary_path = latest_model_dir(models_dir, "boundary_classifier")
    if boundary_path and (boundary_path / "model.pkl").exists():
        models["boundary_classifier"] = {
            "model": joblib.load(boundary_path / "model.pkl"),
            "class_names": json.load(open(boundary_path / "class_names.json")),
            "version": (json.load(open(boundary_path / "metadata.json"))["version"]
                        if (boundary_path / "metadata.json").exists() else boundary_path.name),
        }

    return models


def features_to_array(features: dict) -> np.ndarray:
    row = vectorize_features(features)
    return np.array([row], dtype=float)


def main():
    parser = argparse.ArgumentParser(description="Run inference with learned models")
    parser.add_argument("--models", required=True, help="Path to models directory")
    parser.add_argument("--features", required=True, help="Features JSON string")
    
    args = parser.parse_args()
    
    # Load features
    features = json.loads(args.features)
    
    models_dir = Path(args.models)
    models = load_models(models_dir)
    
    results = {}
    model_versions = {}
    
    # Calibrator
    if "calibrator" in models:
        m = models["calibrator"]
        X = features_to_array(features)
        pred = m["model"].predict(X)[0]
        results["calibrated_percentiles"] = {"avg": float(pred)}
        model_versions["calibrator"] = m.get("version")
    
    # Pressure selector
    if "pressure_selector" in models:
        m = models["pressure_selector"]
        X = features_to_array(features)
        if hasattr(m["model"], "predict_proba"):
            scores = m["model"].predict_proba(X)[0]
        else:
            scores = m["model"].decision_function(X)[0]
        top_indices = np.argsort(scores)[-3:][::-1]
        suggested = [m["pressure_keys"][i] for i in top_indices]
        results["pressure_keys"] = suggested
        model_versions["pressure_selector"] = m.get("version")
    
    # Boundary classifier
    if "boundary_classifier" in models:
        m = models["boundary_classifier"]
        X = features_to_array(features)
        pred = m["model"].predict(X)[0]
        if hasattr(m["model"], "predict_proba"):
            pred_proba = m["model"].predict_proba(X)[0]
            results["confidence"] = float(max(pred_proba))
        results["boundary_class"] = m["class_names"][pred]
        model_versions["boundary_classifier"] = m.get("version")

    if model_versions:
        results["model_versions"] = model_versions
    
    # Output JSON
    print(json.dumps(results))


if __name__ == "__main__":
    main()
