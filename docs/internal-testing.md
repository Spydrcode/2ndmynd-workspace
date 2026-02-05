# Internal Testing System

**INTERNAL ONLY** - Complete end-to-end testing infrastructure for manual mock runs.

## Overview

The internal testing system allows developers to manually trigger full end-to-end mock data generation and analysis pipelines through a web UI. This provides:

- **Realistic Testing**: Generate datasets that exercise the complete system
- **Manual Validation**: Visually inspect results in the standard results UI
- **Debugging**: Test specific scenarios and industry patterns
- **Demo Material**: Create realistic demo datasets for presentations

## Architecture

```
┌──────────────────┐
│  Testing Page    │  /app/testing
│  (Next.js UI)    │  - Form for industry/seed/days
└────────┬─────────┘  - Polling for status
         │           - Link to results
         ▼
┌──────────────────┐
│  API Routes      │  POST /api/internal/mock-run
│  (Next.js API)   │  GET  /api/internal/mock-run/status
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Runner Module   │  run_mock_pipeline.ts
│  (Server-side)   │  - Find website
└────────┬─────────┘  - Scrape context
         │            - Generate CSV bundle
         │            - Run analysis pipeline
         │            - Store artifacts
         ▼
┌──────────────────┐
│  Mockgen Package │  packages/mockgen
│  (Backend-only)  │  - Industry templates
└──────────────────┘  - Data generator
                      - CSV exporters
                      - Web scraping
```

## Security & Guardrails

### Production Safety

**By Default**: All internal testing features are **BLOCKED in production**.

```typescript
// Automatic blocks:
if (process.env.NODE_ENV === "production" && 
    process.env.ALLOW_INTERNAL_TESTING !== "true") {
  return 404;
}
```

### Access Control

1. **UI Gating** (`/app/testing`):
   - Requires `NEXT_PUBLIC_INTERNAL_TESTING=true` OR
   - Query param `?internal=1`
   - Shows "Not enabled" message if blocked

2. **API Gating** (all `/api/internal/*` routes):
   - In production: Requires `ALLOW_INTERNAL_TESTING=true` AND valid token
   - In development: Allowed without token
   - Token validation: `x-2ndmynd-internal` header must match `INTERNAL_TESTING_TOKEN`

3. **File Isolation**:
   - All artifacts written to `./mock_runs/` (never production paths)
   - Job status files in `./mock_runs/_jobs/`
   - Bundle outputs in `./mock_runs/<industry>-<slug>-<timestamp>-seed<seed>/`

## Setup

### 1. Environment Variables

Create `.env.local` with:

```bash
# Enable UI (required)
NEXT_PUBLIC_INTERNAL_TESTING=true

# Optional: For production use (DANGEROUS)
# ALLOW_INTERNAL_TESTING=true
# INTERNAL_TESTING_TOKEN=your_secret_token_here

# Optional: For website search (falls back to curated list)
# SERP_API_KEY=your_serpapi_key
```

### 2. Install Dependencies

```bash
npm install
# Installs nanoid for job IDs
```

### 3. Run Development Server

```bash
npm run dev
```

### 4. Access Testing Page

Navigate to: `http://localhost:3000/app/testing?internal=1`

## Usage

### Basic Flow

1. **Configure Run**:
   - Select industry (hvac, plumbing, electrical, landscaping, cleaning, or random)
   - Optionally set seed (for deterministic generation)
   - Set days of data (default: 90)
   - Optional website URL to override the search (useful for deterministic testing)

2. **Start Job**:
   - Click "Run Full Mock Test"
   - Job starts in background (async process)
   - Returns immediately with job ID

3. **Monitor Progress**:
   - UI polls status every 2 seconds
   - Shows current step and progress percentage
   - Displays details in accordion:
     - Website found
     - Bundle path
     - Validation results
     - Run ID

4. **View Results**:
   - When complete, "Open Results" button appears
   - Redirects to `/app/results/[run_id]?internal=1`
   - Results display exactly like a real client run

### Progress Steps

The pipeline goes through these steps:

1. ⏳ **Queued** (0%)
2. 🔍 **Selecting industry** (5%)
3. 🌐 **Searching for business website** (15%)
4. 📄 **Scraping website for context** (30%)
5. 📊 **Generating CSV data** (50%)
6. ⚙️ **Running analysis pipeline** (70%)
7. 💾 **Saving artifacts** (90%)
8. ✅ **Complete** (100%)

## Technical Details

### Job Management

Jobs are managed via simple file-based storage (no database needed):

```typescript
// Job status file: ./mock_runs/_jobs/<job_id>.status.json
{
  "job_id": "abc123",
  "status": "running",
  "progress": { "step": "generating CSV data", "pct": 50 },
  "website": "https://example.com",
  "bundle_zip": "/path/to/bundle.zip",
  "run_id": "mock_hvac-example-2026-02-03-seed42",
  "validation": { "ok": true, "errors": [] },
  "started_at": "2026-02-03T10:00:00.000Z",
  "completed_at": null
}
```

### Async Execution

Jobs run in detached child processes to avoid blocking API responses:

```typescript
spawn("node", ["--loader", "tsx", "run_job.ts", job_id, ...], {
  detached: true,
  stdio: "ignore"
});
```

This allows:
- Immediate API response with job ID
- Background execution that survives API timeout
- Multiple concurrent jobs

### Status Polling

Frontend polls `/api/internal/mock-run/status?job_id=xxx` every 2 seconds:

```typescript
useEffect(() => {
  const interval = setInterval(async () => {
    const response = await fetch(`/api/internal/mock-run/status?job_id=${jobId}`);
    const data = await response.json();
    setStatus(data);
    
    if (data.status === "done" || data.status === "error") {
      setIsPolling(false);
    }
  }, 2000);
  
  return () => clearInterval(interval);
}, [jobId, isPolling]);
```

### Integration with Mockgen

The runner module directly imports from the mockgen package:

```typescript
import { findBusinessSite } from "../../../../packages/mockgen/src/web/find_site";
import { scrapeSite } from "../../../../packages/mockgen/src/web/scrape_site";
import { runPipeline } from "../../../../packages/mockgen/src/run/run_pipeline";
```

This ensures:
- Single source of truth for data generation
- Consistent behavior with CLI usage
- Reusable industry templates and logic

## File Structure

```
src/
├── app/
│   ├── app/testing/
│   │   └── page.tsx              # Testing UI page
│   └── api/internal/
│       └── mock-run/
│           ├── route.ts          # POST start job
│           └── status/
│               └── route.ts      # GET job status
└── lib/internal/testing/
    ├── run_mock_pipeline.ts      # Core runner logic
    ├── run_job.ts                # Background job script
    └── __tests__/
        └── status.test.ts        # Unit tests

packages/mockgen/                 # Mock data generator
└── src/
    ├── industries/               # Industry templates
    ├── generate/                 # Data generator
    ├── web/                      # Website search/scrape
    └── run/                      # Pipeline runner

mock_runs/                        # All output (gitignored)
├── _jobs/                        # Job status files
└── <bundles>/                    # Generated datasets
```

## Testing

Run unit tests:

```bash
npm test src/lib/internal/testing/__tests__/status.test.ts
```

Tests cover:
- Status file creation and updates
- Field preservation on updates
- Production guardrails
- Development mode allowance

## Snapshot Evidence Plots (Internal)

Use the internal plotting script to generate PNGs for quick validation:

```bash
npm run plots:run -- --run_id mock_<bundle_name>
```

Or pass CSV paths directly:

```bash
npm run plots:run -- --quotes mock_runs/<bundle>/quotes_export.csv --invoices mock_runs/<bundle>/invoices_export.csv
```

Plots are written to `runs/<run_id>/plots/` (or `runs/adhoc/plots` if no run_id is provided).

## Troubleshooting

### "Internal testing is not enabled"

**Cause**: `NEXT_PUBLIC_INTERNAL_TESTING` not set or page accessed without `?internal=1`

**Fix**: 
- Add `NEXT_PUBLIC_INTERNAL_TESTING=true` to `.env.local`
- OR add `?internal=1` to URL
- Restart dev server after env changes

### "Not found" error from API

**Cause**: Production mode blocking or missing token

**Fix**:
- In dev: Should work automatically
- In production: Set `ALLOW_INTERNAL_TESTING=true` AND provide `INTERNAL_TESTING_TOKEN`
- Check `NODE_ENV` value

### Job stuck in "queued" or "running"

**Cause**: Background process failed or orphaned

**Fix**:
- Check status file: `./mock_runs/_jobs/<job_id>.status.json`
- Look for error messages in status file
- Manually inspect bundle directory for partial output
- Try with different seed or industry

### "Job not found"

**Cause**: Status file doesn't exist or was deleted

**Fix**:
- Job may have failed before creating status file
- Check console logs for errors
- Restart and try again

### Website scraping fails

**Cause**: Network issues, blocked by website, or SERP_API_KEY missing

**Fix**:
- Falls back to curated list automatically
- Check internet connectivity
- Optionally add SERP_API_KEY for live search
- Review curated sites in `src/lib/internal/testing/mock_websites.ts`

## Production Deployment (Advanced)

⚠️ **WARNING**: Enabling internal testing in production is **DANGEROUS**. Only do this if:

1. You have strong authentication on the entire app
2. You understand the security implications
3. You need to test production data pipelines

### Required Steps

1. **Generate Secure Token**:
   ```bash
   openssl rand -hex 32
   ```

2. **Set Production Env Vars**:
   ```bash
   ALLOW_INTERNAL_TESTING=true
   INTERNAL_TESTING_TOKEN=<your_generated_token>
   NEXT_PUBLIC_INTERNAL_TESTING=true  # If you want UI visible
   ```

3. **Use Token in API Calls**:
   ```typescript
   fetch("/api/internal/mock-run", {
     method: "POST",
     headers: {
       "x-2ndmynd-internal": "your_token_here"
     },
     body: JSON.stringify({ industry: "hvac" })
   });
   ```

4. **Monitor Usage**: Add logging/alerting for internal testing API calls

## API Reference

### POST /api/internal/mock-run

Start a new mock pipeline job.

**Request Body**:
```json
{
  "industry": "hvac" | "plumbing" | "electrical" | "landscaping" | "cleaning" | "random",
  "seed": 12345,        // optional, random if omitted
  "days": 90,           // optional, default 90
  "website_url": "https://example.com" // optional override
}
```

**Response**:
```json
{
  "job_id": "abc123xyz",
  "status_url": "/api/internal/mock-run/status?job_id=abc123xyz"
}
```

**Status Codes**:
- `200`: Job started successfully
- `400`: Invalid request body
- `404`: Internal testing not allowed (production guard)
- `500`: Server error

### GET /api/internal/mock-run/status

Check job status.

**Query Params**:
- `job_id`: Job ID from POST response

**Response**:
```json
{
  "job_id": "abc123xyz",
  "status": "running",
  "progress": { "step": "generating CSV data", "pct": 50 },
  "website": "https://example.com",
  "bundle_zip": "/path/to/bundle.zip",
  "run_id": "mock_hvac-example-2026-02-03-seed42",
  "validation": { "ok": true, "errors": [] },
  "started_at": "2026-02-03T10:00:00.000Z",
  "completed_at": null
}
```

**Status Codes**:
- `200`: Status retrieved successfully
- `400`: Missing job_id parameter
- `404`: Job not found OR internal testing not allowed
- `500`: Server error

## Best Practices

1. **Use Seeds for Reproducibility**: Always set a seed when debugging specific scenarios
2. **Clean Up Old Jobs**: Periodically delete `./mock_runs/_jobs/*.status.json` files
3. **Monitor Disk Usage**: Bundle zips can add up - clean `./mock_runs/` regularly
4. **Check Validation**: Always review validation errors before viewing results
5. **Test Locally First**: Run mockgen CLI tests before using web UI
6. **Document Findings**: When you find interesting patterns, note the seed for reproduction

## Future Enhancements

- [ ] Add queue management (limit concurrent jobs)
- [ ] Add job history view
- [ ] Add cleanup API for old jobs
- [ ] Add export/download of bundles via UI
- [ ] Add comparison view for multiple runs
- [ ] Add webhook notifications on completion
- [ ] Add Slack/Discord integration for alerts
- [ ] Add real-time logs streaming

## Related Documentation

- [Mockgen README](../../packages/mockgen/README.md) - Mock data generator details
- [Mockgen Implementation](../../packages/mockgen/IMPLEMENTATION.md) - Technical summary
- [Testing Environment Setup](../.env.example.testing) - Required env vars

## Support

For issues or questions:

1. Check troubleshooting section above
2. Review mockgen tests: `npm run test:mockgen`
3. Check status files in `./mock_runs/_jobs/`
4. Review API logs for errors
5. Contact development team
