# Jobber CSV Seed Pipeline

## Place CSVs
- `./seed/jobber/Quotes.csv`
- `./seed/jobber/Invoices.csv`

## Required environment variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Run examples
```bash
npm run seed:jobber
```

```bash
tsx scripts/seed/jobber_csv_to_ml_examples.ts \
  --quotes ./seed/jobber/Quotes.csv \
  --invoices ./seed/jobber/Invoices.csv \
  --reportDate 2026-01-22 \
  --lookbackDays 90 \
  --slices 10
```

## PII stripped (never stored)
- Client name
- Email
- Phone
- Address
- Notes
- Line-item descriptions

Only bucketed counts, totals, and time-lag bands are stored in `ml.examples`.
