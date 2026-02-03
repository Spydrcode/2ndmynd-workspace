# Mock Dataset Generator for 2ndmynd-workspace

Backend-only system for generating realistic, industry-tailored mock business data exports for testing the snapshot analysis pipeline.

## Overview

This system generates realistic CSV exports (quotes, invoices, calendar) for testing across multiple industries and edge cases. It includes:

- Industry-specific templates with realistic distributions
- Web search and scraping for real business context
- Deterministic generation via seeds
- Automatic pipeline execution
- Output artifacts and summaries

## Supported Industries

v1 supports 5 industries:
- `hvac` - HVAC service/repair/install
- `plumbing` - Leaks, water heaters, drain cleaning, fixtures
- `electrical` - Panel upgrades, outlets, troubleshooting, lighting
- `landscaping` - Weekly maintenance, cleanups, irrigation
- `cleaning` - Recurring, deep cleans, move-outs

## Quick Start

### Generate One Dataset

```bash
npm run mockgen one -- --industry hvac --seed 123 --days 90
```

This will:
1. Search for a real HVAC business website
2. Scrape service keywords and location
3. Generate 90 days of realistic quotes/invoices/calendar data
4. Export to CSV and zip
5. Run the analysis pipeline
6. Save all outputs to `./mock_runs/hvac/[website]/[timestamp]-seed123/`

### Generate Suite (Multiple Seeds)

```bash
npm run mockgen suite -- --industry hvac --seeds 5
```

Generates 5 datasets with different seeds for the same industry.

### Sweep All Industries

```bash
npm run mockgen sweep -- --all-industries --seeds 3 --run-pipeline
```

Generates 3 datasets for each of the 5 industries (15 total) and runs pipeline on all.

### Run Pipeline on Existing Bundle

```bash
npm run mockgen run -- --bundle ./mock_runs/hvac/acme-hvac/20260203-120000-seed123/bundle.zip
```

## Output Structure

```
./mock_runs/
  └── hvac/
      └── acme-hvac/
          └── 20260203-120000-seed123/
              ├── bundle.zip
              │   ├── quotes_export.csv
              │   ├── invoices_export.csv
              │   ├── calendar_export.csv
              │   └── manifest.json
              ├── analysis_result.json
              ├── decision_artifact.json
              ├── logs.txt
              └── run_summary.md
```

## CLI Commands

### `mockgen one`

Generate a single dataset.

Options:
- `--industry <name>` - Industry (hvac|plumbing|electrical|landscaping|cleaning)
- `--seed <number>` - Seed for deterministic generation (default: random)
- `--days <number>` - Days of data to generate (default: 90)
- `--out <path>` - Output directory (default: ./mock_runs)
- `--no-pipeline` - Skip running analysis pipeline
- `--scenario <name>` - Force specific scenario (top_heavy, slow_pay, fast_close, etc.)

### `mockgen suite`

Generate multiple datasets with different seeds.

Options:
- `--industry <name>` - Industry to focus on
- `--seeds <number>` - Number of seeds to generate (default: 5)
- `--days <number>` - Days per dataset (default: 90)
- `--out <path>` - Output directory

### `mockgen sweep`

Generate datasets across multiple industries.

Options:
- `--all-industries` - Generate for all 5 industries
- `--industries <list>` - Comma-separated list (e.g., "hvac,plumbing")
- `--seeds <number>` - Seeds per industry (default: 3)
- `--run-pipeline` - Run pipeline on each generated dataset
- `--allow-fail` - Don't exit on validation failures

### `mockgen run`

Run pipeline on an existing bundle.

Options:
- `--bundle <path>` - Path to bundle.zip
- `--out <path>` - Override output directory

## Environment Variables

```bash
# Output directory (default: ./mock_runs)
MOCKGEN_OUTPUT_DIR=./my_custom_output

# Web scraping
MOCKGEN_MAX_PAGES=3
MOCKGEN_USER_AGENT="2ndmynd-mockgen/1.0"

# Optional: Search API (falls back to curated list if missing)
SERPAPI_KEY=your_key_here

# Pipeline may need OpenAI key
OPENAI_API_KEY=your_key_here
```

## Scenario Flags

Each dataset can be tuned for specific signal coverage:

- `top_heavy` - Revenue concentrated in top 5 customers
- `distributed` - Revenue evenly spread
- `slow_pay` - Extended payment delays
- `fast_pay` - Quick payments
- `high_approval` - Most quotes approved
- `low_approval` - Many quotes rejected
- `overbooked` - Calendar shows capacity strain
- `underbooked` - Low calendar utilization
- `seasonal_peak` - Generate data during industry's peak season
- `seasonal_low` - Generate during off-season

These are set automatically based on seed, or manually with `--scenario`.

## Adding a New Industry

1. Create `src/industries/your_industry.ts`:

```typescript
import { IndustryTemplate } from '../types';

export const yourIndustryTemplate: IndustryTemplate = {
  key: 'your_industry',
  displayName: 'Your Industry',
  defaultLaborRate: 95,
  techNames: ['Tech A', 'Tech B'],
  serviceAreas: ['City1', 'City2'],
  seasonalMultiplierByMonth: {
    0: 1.0, 1: 1.0, 2: 1.2, 3: 1.3, 4: 1.4, 5: 1.5,
    6: 1.5, 7: 1.4, 8: 1.2, 9: 1.0, 10: 0.9, 11: 0.9
  },
  jobTypes: [
    {
      name: 'Service Call',
      baseWeightBySeason: { summer: 40, winter: 30, shoulder: 35 },
      typicalDurationHours: [1, 3],
      ticketRange: { p25: 150, p50: 300, p75: 500, p90: 800 },
      materialsPool: [
        { name: 'Parts', unitCost: 20, sellPrice: 50, qtyRange: [1, 3] }
      ]
    }
  ],
  paymentDelayDays: { p50: 14, p90: 30 },
  quoteCloseRate: 0.65,
  followUpLagDays: { p50: 3, p90: 14 },
  revisitRate: 0.15
};
```

2. Add to `src/industries/index.ts`:

```typescript
export { yourIndustryTemplate } from './your_industry';
```

3. Update supported industries list in `src/types.ts`

## Tests

Run tests:

```bash
npm run test:mockgen
```

Tests verify:
- Determinism (same seed = identical output)
- CSV shape and headers match pack_normalizer expectations
- Scenario knobs affect metrics correctly
- Exclusion counts are accurate
- Multi-industry suite works

## Architecture

```
packages/mockgen/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── types.ts              # Shared types
│   ├── industries/           # Industry templates
│   │   ├── index.ts
│   │   ├── hvac.ts
│   │   ├── plumbing.ts
│   │   ├── electrical.ts
│   │   ├── landscaping.ts
│   │   └── cleaning.ts
│   ├── web/
│   │   ├── find_site.ts      # Web search for real businesses
│   │   └── scrape_site.ts    # Extract keywords from sites
│   ├── generate/
│   │   ├── generator.ts      # Core data generation
│   │   ├── distributions.ts  # Realism distributions
│   │   └── exporters/
│   │       ├── quotes.ts
│   │       ├── invoices.ts
│   │       └── calendar.ts
│   ├── run/
│   │   ├── run_pipeline.ts   # Execute analysis pipeline
│   │   └── save_artifacts.ts # Store results
│   └── utils/
│       └── seeded_rng.ts     # Deterministic RNG
└── tests/
    ├── determinism.test.ts
    ├── shape.test.ts
    └── scenarios.test.ts
```

## Safety

- **Production Guard**: Refuses to run if `NODE_ENV=production` unless `--force`
- **Isolated Output**: Only writes to `./mock_runs` (configurable)
- **No UI Imports**: Backend-only, never imports Next.js app modules
- **Clear Boundaries**: Separate package, explicit folder structure

## Troubleshooting

### "Cannot find website for industry X"

Set `SERPAPI_KEY` or the system will use fallback curated sites.

### "Pipeline execution failed"

Check that your workspace has all dependencies installed and `OPENAI_API_KEY` is set.

### "CSV headers don't match"

Check `pack_normalizer.ts` for expected header format. This generator matches those exactly.

### Determinism failing

Ensure you're using the same seed and the same version. RNG state must be identical.

## Contributing

When adding features:
1. Keep it backend-only (no UI imports)
2. Maintain determinism
3. Add tests
4. Update this README
