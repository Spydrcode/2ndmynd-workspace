# Datasets

This folder contains privacy-safe JSONL datasets used for continual improvement.

- `gold/` — immutable, canonical examples.
- `growth/` — curated weekly improvements.
- `quarantine/` — raw logs and review packets (never used directly for training).

All dataset writes are validated with AJV schemas in `ml/schemas`.
