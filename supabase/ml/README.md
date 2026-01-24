# ML Workspace

## Data guardrails
- Store only bucketed or normalized signals and approved outputs.
- No raw exports or customer-facing payloads should be stored here.

## Tables
- `ml.examples`: Bucketed input snapshots with approved outputs, labeled for training or eval.
- `ml.datasets`: Named bundles of example IDs, with schema versioning and freeze timestamps.
- `ml.runs`: Fine-tune or eval runs with status, model identifiers, and metrics JSON.
- `ml.run_results`: Per-example outputs and scores linked to runs.

## Future exports
We will export JSONL later by pulling approved `ml.examples` and joining the
corresponding `ml.run_results` when needed. Export jobs will enforce the
"bucketed only" rule and exclude any raw source material.
