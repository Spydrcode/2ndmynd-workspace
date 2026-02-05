This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## API Keys and Security

- Never paste API keys into terminal output or logs.
- Always use `.env` file for sensitive environment variables.
- The codebase includes automatic redaction of secrets in diagnostic logs.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Offline/CI Build Mode

For CI environments or offline builds without external network access:

```bash
export NEXT_OFFLINE_BUILD=true
npm run build
```

This skips Google Fonts fetching and uses system font stack instead. Useful for:
- CI/CD pipelines with restrictive network policies
- Air-gapped environments
- Faster builds without external dependencies

## Decision Lab

The Decision Lab offers a simple way to send a snapshot to the decision model and see a conclusion.

- Route: `/decision-lab`
- Endpoint: `POST /api/decision`
- Required server env vars:
  - `OPENAI_API_KEY`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - Optional override: `DECISION_MODEL_ID` (forces a specific model id)

To try it locally:

```bash
npm run dev
```

Then open [http://localhost:3000/decision-lab](http://localhost:3000/decision-lab), click "Run 2nd Look," and confirm a conclusion renders.

## Model resolution

The decision model resolves in this order:
1) `DECISION_MODEL_ID` env var (highest priority).
2) `ml.model_registry` where `name='decision_model'` and `status='active'`.
3) Latest succeeded finetune in `ml.runs`.

Troubleshoot via `GET /api/decision/diag`.

To set the active model explicitly:

```bash
npm run ml:set-active-model -- --model ft:your-model-id
```

You can also use the dev helper endpoint (requires `DEV_ADMIN_TOKEN`):

```bash
$env:DEV_ADMIN_TOKEN="local-dev"
npm run dev
```

Then in Decision Lab, paste the model id and token and click "Set Active Model (Dev)".

Or set an env override:

```bash
$env:DECISION_MODEL_ID="ft:your-model-id"
npm run dev
```

Remember to restart the dev server after changing env vars.

## CLI script flags

When passing flags to npm scripts, always include `--` before the flags so they reach the script:

```bash
npm run ml:finetune:status -- --job_id <id>
npm run ml:finetune:events -- --job_id <id> --tail 100
```

## MCP server (Decision Layer v2 tools)

Run the MCP server over stdio:

```bash
npm run mcp:server
```

Example MCP client config snippet:

```json
{
  "mcpServers": {
    "2ndmynd-decision-v2": {
      "command": "npm",
      "args": ["run", "mcp:server"],
      "cwd": "."
    }
  }
}
```

Example tool calls:

```json
{
  "tool": "decision.infer_v2",
  "arguments": {
    "snapshot": { "snapshot_version": "snapshot_v2" }
  }
}
```

```json
{
  "tool": "datasets.run_mock_pack_v2",
  "arguments": {
    "zip_path": "C:/path/to/mock_company_datasets_3mo_plus_outlier.zip",
    "debug": false
  }
}
```

Logs go to `ml_artifacts/mock_companies_3mo/run_results.jsonl` (and `debug_run_results.jsonl` when debug is true).

## Connect & Upload (Client Workflow)

This workflow avoids OAuth connectors. Clients upload exports and receive a single finite snapshot: a conclusion, boundary, and next steps.

### Required env vars (local)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTELLIGENCE_MODE=mock` (default)

### Routes

- `/login` - email magic link
- `/app/connect` - choose Upload Exports or Remote Assist
- `/app/upload` - guided export upload
- `/app/runs` - list of snapshot runs
- `/app/results/[run_id]` - finite artifact view

### Local quickstart

```bash
npm run dev
```

Open `/login`, request a magic link, and then upload exports at `/app/upload`.

Artifacts and run logs are written to `runs/<run_id>.jsonl`.

## Wiring Verified: Mock vs Real Learning Source

**Learning data provenance is now explicit:**
- Mock pipeline (`packages/mockgen`) passes `ctx: { learning_source: "mock" }` to analysis
- Real app uploads should pass `ctx: { learning_source: "real" }` 
- Fallback inference with warning logs if `ctx.learning_source` not provided

**Why this matters:**
- Prevents mock data contamination in production training sets
- Enables separate evaluation of synthetic vs real data quality
- No more implicit INTELLIGENCE_MODE-based inference defaults

**Mock pipeline end-to-end path:**
1. Generate CSV bundle → Extract to DataPackV0 via `pack_from_csv_bundle.ts`
2. Call `runAnalysisFromPack(pack, { ctx: { learning_source: "mock" } })`
3. Learning capture stores examples with `source: "mock"` explicitly
4. Training examples written to `./runs/learning/examples.jsonl`

**Vector backfill runner:**
- Script: `npm run learning:backfill:vectors`
- Docs: See `packages/learning/README.md`
- Idempotent upsert to Supabase with checkpoint resume
- Requires: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Intelligence Layer: How to Run

These harnesses default to mock mode (no `OPENAI_API_KEY` required). To run live inference, set `INTELLIGENCE_MODE=live` and provide `OPENAI_API_KEY`.

```bash
npm run mcp:selftest
npm run intelligence:smoke
npm run intelligence:eval
npm run intelligence:green
```

Outputs:
- `runs/<run_id>.jsonl` for per-run logs
- `runs/summary.json` for eval summary

## Scenario data grounding

Scenario packs add evidence grounding by requiring `evidence_signals` (3-6 keys that must exist in the snapshot). This is a short grounding list tied to the snapshot, not KPI or monitoring language.

### Kaggle shape sources (signals only)

Approved slugs:
- `joniarroba/noshowappointments`
- `datazng/telecom-company-churn-rate-call-center-data`
- `ibm/late-payment-histories` (if present)

Kaggle data is used for shape only (bucketed signals). It is never inserted verbatim into training text.

Download (optional, requires kagglehub auth):

```bash
npm run ml:kaggle:download -- --dataset joniarroba/noshowappointments
```

Ingest + transform:

```bash
npm run ml:kaggle:ingest
```

Transform (legacy shortcut):

```bash
npm run ml:kaggle:transform
```

Optional Kaggle download helper (uses kagglehub and copies into a target folder):

```bash
npm run ml:kaggle:download -- --slug joniarroba/noshowappointments --out_dir ./seed/kaggle/noshowappointments
```

Generate scenario packs:

```bash
npm run ml:scenarios:generate
```

Run order:

1) `npm run ml:kaggle:download -- --dataset <slug>`
2) `npm run ml:kaggle:ingest`
3) `npm run ml:scenarios:generate`
4) `npm run ml:scenarios:coverage`
5) `npm run ml:scenarios:import`
6) `npm run ml:eval`

### Hard mode generation

Hard mode injects mixed signatures and counterexamples so the model has to discriminate rather than match templates. Fallback to `low_impact_boundary` is deterministic: if max signature strength falls below `fallback_threshold`, the pack uses the fallback.

### One-command training loop

```bash
npm run ml:scenario:train-loop
```

This runs ingest (optional), generate, coverage, import, fine-tune, eval, and release gate.

### Learning signals to watch

- Pattern accuracy should rise while grounding failures fall.
- Joint success (pattern + grounding + schema + forbidden) is the release gate.
- Coverage report shows mixed/counterexample overlap and evidence key diversity.

Import packs into Supabase:

```bash
npm run ml:scenarios:import
```

Evaluate grounding and pattern accuracy:

```bash
npm run ml:eval
```

Pattern-only eval (selection accuracy only):

```bash
npm run ml:eval:pattern
```

Interpretation:
- If selection accuracy is high but joint success is low, the model is choosing the right pattern but failing formatting, grounding, or forbidden checks.

## Scenario fine-tune workflow

Export scenario training data:

```bash
npm run ml:export-jsonl -- --dataset scenario_train_v1
```

Fine-tune the scenario model:

```bash
npm run ml:finetune:scenario
```

Run the release gate:

```bash
npm run ml:release-gate
```

Production activation is gated by the release report.

## Baseline + Compare

Run eval against a specific model:

```bash
npm run ml:eval -- --model gpt-4o-mini-2024-07-18
npm run ml:eval -- --model ft:your-model-id
```

Compare multiple models and write a single markdown report:

```bash
npm run ml:eval:compare -- --models ft:one,ft:two
```

Local migrations (do not run automatically):

```bash
supabase db reset
# or
supabase migration up
```

## Forward-only DB updates (no reset)

Run forward migrations and backfill meta without resetting the DB:

```bash
npx supabase migration up
npm run ml:backfill:meta
npm run ml:diag:eval-db
npm run ml:eval -- --model gpt-4o-mini-2024-07-18 --dataset scenario_eval_v1 --mode full
```

## No-reset eval rebuild

Rebuild only the eval dataset from the latest scenario packs (train datasets are untouched):

```bash
npm run ml:scenarios:generate
npm run ml:scenarios:rebuild-eval
npm run ml:scenarios:verify-eval
npm run ml:eval -- --model gpt-4o-mini-2024-07-18 --dataset scenario_eval_v1 --mode full
```

## Fine-tune debugging

Check a job's status and error details:

```bash
npm run ml:finetune:status
```

View the last 50 fine-tune events (useful for retry/failure reasons):

```bash
npm run ml:finetune:events
```

If a job looks stuck or keeps retrying:
- Run `npm run ml:finetune:events` to find the concrete error message.
- Run `npm run ml:finetune:status` to confirm current state.
- Resume polling with `npm run ml:finetune:resume -- --job_id <job_id>`.

## Canary Fine-Tune

When fine-tune jobs repeatedly fail or loop with retries, run the canary first to isolate the root cause:

- **If canary succeeds**: Issue is scale-related (too many patterns/packs). Gradually increase `--max_total_packs` and `--n_per_pattern`.
- **If canary fails**: Issue is content/format leakage. Check export validator errors for offending example IDs, then inspect the raw data.

Run the full canary pipeline:

```bash
npm run ml:scenario:canary-loop
```

This generates ~140-220 packs from 4 core patterns, validates exports, and attempts a conservative fine-tune (epochs 2, lr 1.0, batch size 1). If it times out, follow the printed job ID for status/events/resume.

## Canary run v2

Use the canary v2 loop to avoid brittle, tiny datasets while keeping the fine-tune safe:

```bash
npm run ml:scenario:canary-loop
```

Why:
- Increases pattern variety and pack count so training is less brittle.
- Uses conservative hyperparameters (epochs 2, lr 1.0).


## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
