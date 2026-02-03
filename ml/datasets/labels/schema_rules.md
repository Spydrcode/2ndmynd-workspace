# Schema Rules

Training examples must mirror the decision artifact schema used in production.
Minimum required keys for artifact-style outputs:

- `version`
- `takeaway`
- `why_heavy`
- `next_7_days` (array)
- `boundary`
- `window`
- `confidence`
- `pressure_map`

Any example missing required keys must be rejected or corrected before promotion.
