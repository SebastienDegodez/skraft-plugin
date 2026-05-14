# CI Configuration Reference

## Full GitHub Actions Workflow

```yaml
# .github/workflows/deliver-e2e-evidence.yml
name: DELIVER — E2E Tests with Evidence

on:
  issue_comment:
    types: [created]           # orchestrator triggers via comment command
  workflow_dispatch:
    inputs:
      issue_number:
        description: GitHub issue number for evidence upload
        required: true
        type: string

permissions:
  issues: write                # post evidence comment
  contents: read

env:
  DOTNET_VERSION: '10.0.x'
  PLAYWRIGHT_BROWSERS_PATH: ~/.cache/ms-playwright
  APP_BASE_URL: http://localhost:5000

jobs:
  e2e-evidence:
    name: E2E Tests + Evidence Upload
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      # ── Checkout ──────────────────────────────────────────────────────────
      - name: Checkout
        uses: actions/checkout@v4

      # ── .NET Setup ────────────────────────────────────────────────────────
      - name: Setup .NET ${{ env.DOTNET_VERSION }}
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: ${{ env.DOTNET_VERSION }}

      # ── Restore & Build ───────────────────────────────────────────────────
      - name: Restore dependencies
        run: dotnet restore MonAssurance.sln

      - name: Build
        run: dotnet build MonAssurance.sln --no-restore --configuration Release

      # ── Playwright Browser Cache ───────────────────────────────────────────
      - name: Cache Playwright browsers
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-chromium-${{ runner.os }}-${{ hashFiles('**/MonAssurance.IntegrationTests.csproj') }}
          restore-keys: |
            playwright-chromium-${{ runner.os }}-

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: |
          pwsh tests/MonAssurance.IntegrationTests/bin/Release/net10.0/playwright.ps1 \
            install --with-deps chromium

      # ── Start Application Under Test ──────────────────────────────────────
      - name: Start MonAssurance API
        run: |
          dotnet run --project src/MonAssurance.Api/MonAssurance.Api.csproj \
            --configuration Release &
          npx wait-on http://localhost:5000/health --timeout 30000

      # ── Run E2E Tests ─────────────────────────────────────────────────────
      - name: Run Playwright tests
        id: playwright-tests
        continue-on-error: true          # allow evidence upload even on failure
        env:
          APP_BASE_URL: ${{ env.APP_BASE_URL }}
          GITHUB_ISSUE_NUMBER: ${{ github.event.inputs.issue_number || github.event.issue.number }}
        run: |
          dotnet test tests/MonAssurance.IntegrationTests/ \
            --configuration Release \
            --no-build \
            --logger "html;LogFileName=../../evidence/reports/report.html" \
            --logger "junit;LogFileName=../../evidence/reports/results.xml" \
            --results-directory evidence/reports \
            -- NUnit.DefaultTestNamePattern="{m}"

      # ── Upload Artifacts ───────────────────────────────────────────────────
      - name: Upload evidence artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-evidence-${{ github.run_id }}
          path: |
            evidence/screenshots/
            evidence/videos/
            evidence/traces/
            evidence/reports/
          retention-days: 7
          if-no-files-found: ignore

      # ── Post Evidence Comment ─────────────────────────────────────────────
      - name: Compose evidence comment
        if: always()
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ISSUE_NUMBER: ${{ github.event.inputs.issue_number || github.event.issue.number }}
          TEST_OUTCOME: ${{ steps.playwright-tests.outcome }}
        run: bash scripts/post-evidence-comment.sh

      - name: Post evidence comment to issue
        if: always() && env.ISSUE_NUMBER != ''
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ISSUE_NUMBER: ${{ github.event.inputs.issue_number || github.event.issue.number }}
        run: |
          gh issue comment "$ISSUE_NUMBER" \
            --body-file evidence/comment-body.md \
            --repo "$GITHUB_REPOSITORY" || \
            echo "::warning::Evidence comment upload failed"
```

## Secret Names

| Secret | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | Yes (auto-injected) | Post issue comments, upload artifacts |
| `EVIDENCE_UPLOAD_TOKEN` | Optional | Use when `GITHUB_TOKEN` lacks `issues: write` |

To use a PAT instead of `GITHUB_TOKEN`:

```yaml
env:
  GH_TOKEN: ${{ secrets.EVIDENCE_UPLOAD_TOKEN }}
```

## Browser Cache Configuration

Cache key uses the test project file hash to invalidate when Playwright version changes:

```yaml
key: playwright-chromium-${{ runner.os }}-${{ hashFiles('**/MonAssurance.IntegrationTests.csproj') }}
```

After cache restore, always verify browsers are present:

```yaml
- name: Verify or install Playwright browsers
  run: |
    if ! pwsh tests/.../playwright.ps1 show-browsers 2>/dev/null | grep -q chromium; then
      pwsh tests/.../playwright.ps1 install --with-deps chromium
    fi
```

## Test Retry for Flaky Tests

Configure retries at two levels:

**`playwright.config.json`** (built-in retry):

```json
{
  "retries": 2
}
```

**`dotnet test` level** (re-run failed tests):

```bash
dotnet test ... -- NUnit.NumberOfTestWorkers=4 NUnit.TestRetryCount=2
```

## `post-evidence-comment.sh` Script

```bash
#!/usr/bin/env bash
# scripts/post-evidence-comment.sh
set -euo pipefail

SCREENSHOT_PATH=$(find evidence/screenshots -name "*.png" -newer /tmp/test-start 2>/dev/null | head -1)
ARTIFACT_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
RESULT_ICON="✅"
[ "${TEST_OUTCOME}" = "failure" ] && RESULT_ICON="❌"

mkdir -p evidence

cat > evidence/comment-body.md << EOF
## 🎭 E2E Evidence — DELIVER Phase ${RESULT_ICON}

**Run:** [${GITHUB_RUN_ID}](${ARTIFACT_URL}) | **Result:** ${TEST_OUTCOME^^}
**Timestamp:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

if [ -f "${SCREENSHOT_PATH}" ]; then
  SIZE=$(wc -c < "${SCREENSHOT_PATH}")
  if [ "${SIZE}" -lt 512000 ]; then
    B64=$(base64 < "${SCREENSHOT_PATH}" | tr -d '\n')
    echo "### Screenshot" >> evidence/comment-body.md
    echo "![test screenshot](data:image/png;base64,${B64})" >> evidence/comment-body.md
  fi
fi

cat >> evidence/comment-body.md << EOF

### Artifacts
- [Screenshots, videos, traces, HTML report](${ARTIFACT_URL})
EOF
```

## Conditional Upload (`if: failure()` vs `if: always()`)

| Strategy | Use When |
|---|---|
| `if: failure()` | Upload evidence only when tests fail (saves storage) |
| `if: always()` | Upload evidence every run (full audit trail for SDLC compliance) |

Default for skraft DELIVER phase: `if: always()` — full traceability required.

## Environment Variables Available in Actions

```yaml
GITHUB_REPOSITORY      # owner/repo
GITHUB_RUN_ID          # unique run ID
GITHUB_SERVER_URL      # https://github.com
GITHUB_REF_NAME        # branch or tag name
GITHUB_HEAD_REF        # PR source branch
GITHUB_TOKEN           # auto-injected, scope set by permissions block
```
