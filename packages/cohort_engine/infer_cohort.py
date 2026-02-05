#!/usr/bin/env python3
"""
Cohort Inference

Loads trained cohort model and predicts cohort_id + expected_ranges.

Usage:
    python infer_cohort.py --model_version=latest --features='{"total_revenue": 150000, ...}'

Outputs JSON:
    {
      "cohort_id": 2,
      "cohort_label": "cohort_2",
      "confidence": 0.85,
      "distance_to_centroid": 1.23,
      "expected_ranges": [...]
    }
"""

import argparse
import json
import pickle
import sys
from pathlib import Path
from typing import Any, Dict

import numpy as np


def load_model(model_dir: str) -> Dict[str, Any]:
    """Load model from directory."""
    
    model_path = Path(model_dir) / "model.pkl"
    
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")
    
    with open(model_path, "rb") as f:
        model_data = pickle.load(f)
    
    return model_data


def load_ranges(model_dir: str) -> Dict[int, list]:
    """Load ranges from ranges.json."""
    
    ranges_path = Path(model_dir) / "ranges.json"
    
    if not ranges_path.exists():
        raise FileNotFoundError(f"Ranges not found: {ranges_path}")
    
    with open(ranges_path, "r") as f:
        ranges = json.load(f)
    
    # Convert string keys to int
    return {int(k): v for k, v in ranges.items()}


def infer_cohort(features: Dict[str, float], model_version: str, models_dir: str) -> Dict[str, Any]:
    """Predict cohort for given features."""
    
    # Resolve model version
    if model_version == "latest":
        latest_path = Path(models_dir) / "LATEST.json"
        
        if not latest_path.exists():
            raise FileNotFoundError("LATEST.json not found. No promoted model.")
        
        with open(latest_path, "r") as f:
            latest = json.load(f)
        
        model_version = latest["model_version"]
    
    model_dir = Path(models_dir) / model_version
    
    if not model_dir.exists():
        raise FileNotFoundError(f"Model directory not found: {model_dir}")
    
    # Load model and ranges
    model_data = load_model(str(model_dir))
    ranges = load_ranges(str(model_dir))
    
    kmeans = model_data["kmeans"]
    scaler = model_data["scaler"]
    feature_keys = model_data["feature_keys"]
    
    # Extract features in correct order
    X = []
    for key in feature_keys:
        value = features.get(key)
        if value is None:
            # Use median (0 after scaling, approximately)
            X.append(0.0)
        else:
            X.append(float(value))
    
    X = np.array(X).reshape(1, -1)
    
    # Replace NaNs with 0
    X = np.nan_to_num(X, nan=0.0)
    
    # Scale features
    X_scaled = scaler.transform(X)
    
    # Predict cohort
    cohort_id = int(kmeans.predict(X_scaled)[0])
    
    # Compute distance to centroid
    distances = kmeans.transform(X_scaled)[0]
    distance_to_centroid = float(distances[cohort_id])
    
    # Compute confidence (inverse of distance, clamped)
    confidence = max(0.0, min(1.0, 1.0 / (1.0 + distance_to_centroid)))
    
    # Get expected ranges for this cohort
    expected_ranges = ranges.get(cohort_id, [])
    
    result = {
        "cohort_id": cohort_id,
        "cohort_label": f"cohort_{cohort_id}",
        "confidence": confidence,
        "distance_to_centroid": distance_to_centroid,
        "expected_ranges": expected_ranges,
    }
    
    return result


def main():
    parser = argparse.ArgumentParser(description="Cohort Inference")
    parser.add_argument("--model_version", default="latest", help="Model version")
    parser.add_argument("--models_dir", default="./models/cohort_engine", help="Models directory")
    parser.add_argument("--features", required=True, help="Features as JSON string")
    
    args = parser.parse_args()
    
    try:
        features = json.loads(args.features)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON features: {e}", file=sys.stderr)
        sys.exit(1)
    
    try:
        result = infer_cohort(features, args.model_version, args.models_dir)
        print(json.dumps(result))
    except Exception as e:
        print(f"ERROR: Inference failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
