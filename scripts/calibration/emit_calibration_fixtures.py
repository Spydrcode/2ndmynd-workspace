import argparse
import json
import os
from datetime import datetime, timezone


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--defaults", default="fixtures/calibration/defaults_v1.json")
    parser.add_argument("--out_envelope", default="fixtures/healthy_envelopes/local_service_stable_v1.suggested.json")
    args = parser.parse_args()

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    defaults_path = os.path.join(repo_root, args.defaults)
    out_path = os.path.join(repo_root, args.out_envelope)

    with open(defaults_path, "r", encoding="utf-8") as f:
        defaults = json.load(f)

    conc = defaults.get("recommended_concentration_max", {})
    envelope = {
        "envelope_id": "local_service_stable_v1",
        "version": "0.1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "job_value_ranges": {
            "micro": {"min": 0.0, "max": 0.15},
            "small": {"min": 0.25, "max": 0.40},
            "medium": {"min": 0.30, "max": 0.45},
            "large": {"min": 0.10, "max": 0.25},
            "jumbo": {"min": 0.0, "max": 0.10},
        },
        "decision_lag_ranges": {
            "same_day": {"min": 0.10, "max": 0.30},
            "1_3_days": {"min": 0.20, "max": 0.35},
            "4_7_days": {"min": 0.15, "max": 0.30},
            "8_14_days": {"min": 0.05, "max": 0.20},
            "15_30_days": {"min": 0.00, "max": 0.15},
            "over_30_days": {"min": 0.00, "max": 0.05},
            "unknown": {"min": 0.00, "max": 0.10},
        },
        "revenue_concentration_ranges": {
            "top_10_percent_jobs_share": {"max": float(conc.get("top_10_percent_jobs_share", 0.45))},
            "top_25_percent_jobs_share": {"max": float(conc.get("top_25_percent_jobs_share", 0.65))},
        },
        "notes": [
            "Suggested envelope update emitted from calibration defaults. Review manually before adopting.",
        ],
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(envelope, f, indent=2)
        f.write("\n")

    print(f"Wrote suggested envelope: {out_path}")


if __name__ == "__main__":
    main()

