import argparse
import json
import subprocess
import sys
from pathlib import Path
from datetime import datetime

from dataset import load_examples


def run_script(script_path, args):
    cmd = [sys.executable, str(script_path)] + args
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"Script failed: {script_path}")
    return result.stdout.strip()


def parse_output(raw):
    try:
        lines = [line for line in raw.splitlines() if line.strip()]
        return json.loads(lines[-1]) if lines else {}
    except Exception:
        return {"raw": raw}


def main():
    parser = argparse.ArgumentParser(description="Train all learning models and evaluate")
    parser.add_argument("--dataset", required=True, help="Path to JSONL dataset")
    parser.add_argument("--models", required=True, help="Models output directory")
    parser.add_argument("--eval_out", required=True, help="Evaluation output directory")
    args = parser.parse_args()

    scripts_dir = Path(__file__).parent
    models_dir = Path(args.models)
    eval_dir = Path(args.eval_out)
    models_dir.mkdir(parents=True, exist_ok=True)
    eval_dir.mkdir(parents=True, exist_ok=True)

    examples = load_examples(args.dataset)
    if len(examples) < 10:
        raise RuntimeError("Insufficient training data (need at least 10 examples).")

    summary = {"trained_at": datetime.utcnow().isoformat(), "dataset": args.dataset, "models": {}}

    pressure_out = run_script(scripts_dir / "train_pressure_selector.py", ["--dataset", args.dataset, "--output", args.models])
    summary["models"]["pressure_selector"] = parse_output(pressure_out)

    boundary_out = run_script(scripts_dir / "train_boundary_classifier.py", ["--dataset", args.dataset, "--output", args.models])
    summary["models"]["boundary_classifier"] = parse_output(boundary_out)

    try:
        calibrator_out = run_script(scripts_dir / "train_calibrator.py", ["--dataset", args.dataset, "--output", args.models])
        summary["models"]["calibrator"] = parse_output(calibrator_out)
    except Exception as exc:
        summary["models"]["calibrator"] = {"skipped": str(exc)}

    eval_out = run_script(scripts_dir / "evaluate.py", ["--models", args.models, "--dataset", args.dataset, "--output", args.eval_out])
    eval_summary = parse_output(eval_out)
    report_path = eval_summary.get("report_path")
    if report_path:
        eval_dir = Path(report_path).parent
        summary_path = eval_dir / "evaluation_summary.json"
        if summary_path.exists():
            try:
                eval_summary = json.loads(summary_path.read_text(encoding="utf-8"))
            except Exception:
                pass
    summary["evaluation"] = eval_summary

    summary_path = models_dir / "training_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps({"status": "ok", "summary": str(summary_path)}))


if __name__ == "__main__":
    main()
