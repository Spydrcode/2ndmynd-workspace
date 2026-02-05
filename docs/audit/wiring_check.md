# Wiring Check

The wiring check command runs critical tests that verify the system's core functionality is properly wired.

## Purpose

Prevents silent failures by validating:
- MCP tool registry contracts are intact
- RAG safety invariants are enforced (no contamination of learning layer)
- E2E mock run pipeline works end-to-end
- Learning layer capture/train/infer flow is functional (if Python available)

## Usage

```bash
npm run wiring:check
```

## Output

The command outputs a summary table showing PASS/FAIL/SKIP status for each test:

```
═══════════════════════════════════════════════════════════════════════════════
  WIRING CHECK SUMMARY
═══════════════════════════════════════════════════════════════════════════════

TEST                                STATUS   DURATION
───────────────────────────────────────────────────────────────────────────────
MCP Tool Registry Contract          ✅ PASS     2.34s
RAG Safety Invariants               ✅ PASS     1.89s
E2E Mock Run Pipeline               ✅ PASS     4.12s
E2E Learning Smoke Test             ⊘ SKIP     0.01s
───────────────────────────────────────────────────────────────────────────────
  TOTAL: 4  |  PASS: 3  |  FAIL: 0  |  SKIP: 1
═══════════════════════════════════════════════════════════════════════════════
```

## Interpreting Results

### PASS ✅
All tests in this category passed. The system is properly wired.

### FAIL ❌
One or more tests failed. Review the error output and fix the issue before deploying.

Common failures:
- **MCP Tool Registry Contract**: Tool signatures changed without updating contracts
- **RAG Safety Invariants**: RAG context leaked into signals_v1 or training data
- **E2E Mock Run Pipeline**: Pipeline broken, missing dependencies, or data issues
- **E2E Learning Smoke Test**: Python/sklearn issue or training data corruption

### SKIP ⊘
Test was skipped (usually due to missing optional dependencies).

The Learning Smoke Test is skipped if Python is not available. This is acceptable for development but should pass in CI/production.

## Report

A detailed JSON report is written to: `runs/audit/wiring_check.json`

Contains:
- Test results with stdout/stderr
- Dependency status (vitest, Python, Node version)
- Warnings
- Timestamps

## Dependencies

### Required
- **Node.js**: 18+ (automatically available)
- **vitest**: Installed via `npm install`

### Optional
- **Python**: Required for learning smoke test
  - If missing, test is skipped unless `REQUIRE_PYTHON_WIRING=1`
  - Install: `python -m venv .venv && pip install scikit-learn numpy pandas matplotlib`

## Environment Variables

### REQUIRE_PYTHON_WIRING
Set to `1` to make Python tests mandatory (fail instead of skip).

```bash
# Fail if Python not available
REQUIRE_PYTHON_WIRING=1 npm run wiring:check
```

Use in CI to ensure full wiring is validated before deployment.

## Troubleshooting

### "vitest not found"
Run: `npm install`

### "Python not found"
Install Python and dependencies:
```bash
# Windows
winget install Python.Python.3.11

# macOS
brew install python

# Linux
sudo apt install python3

# Then install ML dependencies
python -m venv .venv
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # macOS/Linux
pip install scikit-learn numpy pandas matplotlib
```

### Tests timing out
Increase timeout in `scripts/audit/wiring_check.ts` (default: 120s per test)

### False positives in CI
Ensure all required environment variables are set in CI:
- `DATABASE_URL` (if tests need DB)
- `OPENAI_API_KEY` (if tests call LLM)
- Internal testing tokens

## Integration with CI

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Run wiring check
  run: |
    npm install
    REQUIRE_PYTHON_WIRING=1 npm run wiring:check
```

## When to Run

- **Before every deployment** (automated in CI)
- **After major refactors** (MCP tools, RAG integration, learning layer)
- **When debugging "generic" artifacts** (may indicate broken wiring)
- **After dependency updates** (npm or Python packages)

## Related

- `/app/testing?internal=1` - Runtime health UI (shows dependency status in browser)
- `docs/internal-testing.md` - Internal testing guide
- `docs/audit/runbook.md` - Full audit runbook
