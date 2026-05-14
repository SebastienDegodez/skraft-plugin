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
  PLAYWRIGHT_BROWSERS_PATH: ~/.cache/ms-playwright
  PLAYWRIGHT_JUNIT_OUTPUT_NAME: evidence/reports/results.xml
  CI: true

jobs:
  e2e-evidence:
    name: E2E Tests + Evidence Upload
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      # ── Checkout ──────────────────────────────────────────────────────────
      - name: Checkout
        uses: actions/checkout@v4

      # ── Node.js Setup ─────────────────────────────────────────────────────
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      # ── Install dependencies ───────────────────────────────────────────────
      - name: Install dependencies
        run: npm ci

      # ── Playwright Browser Cache ───────────────────────────────────────────
      - name: Cache Playwright browsers
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-chromium-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
          restore-keys: |
            playwright-chromium-${{ runner.os }}-

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium

      # ── Run E2E Tests ─────────────────────────────────────────────────────
      - name: Run Playwright tests
        id: playwright-tests
        continue-on-error: true          # allow evidence upload even on failure
        env:
          ISSUE_NUMBER: ${{ github.event.inputs.issue_number || github.event.issue.number }}
        run: npx playwright test --reporter=html,junit

      # ── Upload Artifacts ───────────────────────────────────────────────────
      - name: Upload evidence artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-evidence-${{ github.run_id }}
          path: |
            playwright-report/
            evidence/
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

Cache key uses `package-lock.json` hash to invalidate when `@playwright/test` version changes:

```yaml
key: playwright-chromium-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
```

After cache restore, always verify browsers are present:

```yaml
- name: Verify or install Playwright browsers
  run: npx playwright install chromium --with-deps 2>/dev/null || true
```

## Test Retry for Flaky Tests

Configure retries in `playwright.config.ts`:

```typescript
retries: process.env.CI ? 2 : 0,
```

Or via CLI: `npx playwright test --retries=2`

## GitHub Actions Native Annotations

Add `github` reporter alongside others to get inline PR annotations:

```bash
npx playwright test --reporter=github,html,junit
```

Set in `playwright.config.ts`:

```typescript
reporter: process.env.CI
  ? [['github'], ['html', { outputFolder: 'playwright-report' }], ['junit', { outputFile: 'evidence/reports/results.xml' }]]
  : [['html']],
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
CI                     # set to 'true' — enables Playwright CI mode
PLAYWRIGHT_JUNIT_OUTPUT_NAME  # path for JUnit XML output
```
