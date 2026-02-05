# Audit Runbook

Complete operational procedures for auditing and maintaining 2ndmynd system integrity.

## Quick Start Checklist

### First Time Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start dev server**
   ```bash
   npm run dev
   ```

3. **Access internal testing**
   ```
   Open: http://localhost:3000/app/testing?internal=1
   ```

4. **Run wiring check**
   ```bash
   npm run wiring:check
   ```

### Python Setup (Optional)

Required for learning layer features:

```bash
# Install Python
# Windows: winget install Python.Python.3.11
# macOS: brew install python
# Linux: sudo apt install python3

# Create virtual environment
python -m venv .venv

# Activate
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # macOS/Linux

# Install ML dependencies
pip install scikit-learn numpy pandas matplotlib
```

---

## Why Artifacts May Look Generic

### Missing Website URL
**Problem**: "No website provided. A business summary was not generated."

**Cause**: Mock runs without `website_url` parameter.

**Fix**: System now automatically uses curated fallback websites. If you still see this:
- Check that fallback logic is enabled in `run_mock_pipeline.ts`
- Verify `mock_websites.ts` has entries for your industry
- Look for network fetch failures in logs

### Internal Guard Blocking Evidence
**Problem**: "Evidence still loading" never resolves.

**Cause**: Internal endpoints require `?internal=1` or authentication token.

**Fix**:
- Dev: Add `?internal=1` to URL
- Prod: Set `ALLOW_INTERNAL_TESTING=true` and provide token in header

The UI now shows explicit "blocked by guard" messages instead of hanging.

### Missing Dependencies
**Problem**: Features degraded, tests skip, blank sections in artifacts.

**Cause**: vitest, tsx, Python, or Python packages missing.

**Fix**:
- Check Runtime Health card in `/app/testing?internal=1`
- Follow install instructions shown in the card
- Run `npm run wiring:check` to verify

---

## Wiring Check

### Purpose
Validates that critical system wiring is intact:
- MCP tool registry contracts
- RAG safety invariants (no learning contamination)
- E2E mock run pipeline
- Learning layer capture/train/infer

### Command
```bash
npm run wiring:check
```

### Interpreting Results

**PASS** ✅ - System properly wired

**FAIL** ❌ - Critical issue, must fix before deploying
- Review error output
- Fix the failing component
- Re-run check

**SKIP** ⊘ - Optional dependency missing (usually Python)
- Acceptable in dev
- Should pass in CI/prod (set `REQUIRE_PYTHON_WIRING=1`)

### Output Location
```
runs/audit/wiring_check.json
```

Contains detailed test results, stdout/stderr, and dependency status.

---

## Runtime Health Monitoring

### Access
```
http://localhost:3000/app/testing?internal=1
```

### What It Shows
- ✅/❌ Node.js dependencies (tsx, vitest, next)
- ✅/❌ Python status and version
- ✅/❌ Python packages (scikit-learn, numpy, pandas, matplotlib)
- Installation instructions for missing dependencies
- Warnings about degraded features

### When to Check
- After fresh clone
- After dependency updates
- When artifacts look generic
- When tests fail unexpectedly

---

## Internal Endpoints

All internal endpoints require guard bypass:
- **Dev**: `?internal=1` in URL
- **Prod**: `ALLOW_INTERNAL_TESTING=true` + `x-2ndmynd-internal` header with token

### Key Endpoints

#### Runtime Health
```
GET /api/internal/runtime?internal=1
```
Returns Node/Python dependency status.

#### Mock Run
```
POST /api/internal/mock-run
Body: { industry, seed?, days?, website_url?, capture_learning?, auto_label? }
```
Starts async mock pipeline job.

#### Mock Run Status
```
GET /api/internal/mock-run/status?job_id=xxx
```
Polls job progress.

#### Learning Dataset
```
GET /api/internal/learning/dataset
```
Returns training dataset statistics.

#### Learning Train
```
POST /api/internal/learning/train
Body: { model_name, examples_count? }
```
Starts training job.

---

## Testing Workflow

### 1. Manual Mock Run

```bash
# Start dev server
npm run dev

# Open testing page
# http://localhost:3000/app/testing?internal=1

# Configure and run:
# - Select industry (e.g., HVAC)
# - Set seed for reproducibility
# - Set days (default 90)
# - Optional: provide website_url
# - Optional: enable learning capture
# - Click "Run Test"

# Monitor progress
# - Watch status updates
# - Click "View Results" when done
```

### 2. Automated Wiring Check

```bash
npm run wiring:check
```

Runs all critical tests and outputs summary.

### 3. Learning Layer Test

```bash
# Ensure Python installed
python --version

# Run learning smoke test
npx vitest run src/lib/learning/__tests__/build_training_example_v1.test.ts
```

---

## Troubleshooting

### "vitest not found"
```bash
npm install
```

### "Python not found"
```bash
# Windows
winget install Python.Python.3.11

# macOS
brew install python

# Linux
sudo apt install python3
```

### "import sklearn" fails
```bash
pip install scikit-learn numpy pandas matplotlib
```

### Mock run hangs
- Check `/app/testing?internal=1` for runtime health
- Look for errors in terminal running `npm run dev`
- Check `/api/internal/mock-run/status?job_id=xxx` directly

### Artifacts look generic
1. Check Runtime Health card for missing deps
2. Verify website_url is present (should auto-fallback now)
3. Check if internal endpoints are blocked (add `?internal=1`)
4. Look for warnings in run manifest

### Tests fail in CI
- Ensure `REQUIRE_PYTHON_WIRING=1` if Python required
- Set all required env vars (DATABASE_URL, OPENAI_API_KEY, etc.)
- Check dependency installation succeeded
- Review CI logs for specific errors

---

## Environment Variables

### Required
- `DATABASE_URL` - Postgres connection string
- `OPENAI_API_KEY` - For ML inference

### Optional
- `ALLOW_INTERNAL_TESTING` - Enable internal endpoints in prod
- `INTERNAL_TESTING_TOKEN` - Auth token for prod internal access
- `LEARNING_CAPTURE` - Enable learning example capture
- `LEARNING_INFERENCE` - Enable ML-powered inference
- `LEARNING_VECTOR_BACKEND` - Vector store backend (`mock` or `pinecone`)
- `RAG_ENABLED` - Enable RAG context enrichment
- `REQUIRE_PYTHON_WIRING` - Fail wiring check if Python missing

---

## CI Integration

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          npm install
          pip install scikit-learn numpy pandas matplotlib
      
      - name: Run wiring check
        run: REQUIRE_PYTHON_WIRING=1 npm run wiring:check
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

---

## Maintenance

### Weekly
- Run `npm run wiring:check`
- Review Runtime Health in `/app/testing?internal=1`
- Check for dependency updates

### Before Deployment
- Run full wiring check with Python required
- Verify all tests pass
- Check Runtime Health shows all green
- Review recent error logs

### After Dependency Updates
- Run `npm run wiring:check`
- Manual smoke test via `/app/testing?internal=1`
- Verify artifacts still look industry-specific

---

## Related Documentation

- `docs/audit/wiring_check.md` - Detailed wiring check guide
- `docs/internal-testing.md` - Internal testing procedures
- `docs/learning-layer.md` - Learning layer architecture
- `docs/runtime-governance.md` - RAG and learning safety
