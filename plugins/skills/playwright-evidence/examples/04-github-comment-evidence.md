# Example 04 — GitHub Evidence Comment Upload

Domain: MonAssurance auto-insurance — orchestrator posts E2E evidence to GitHub issue.

## Overview

After DELIVER phase tests complete, the orchestrator (or CI job) calls the upload script
to post evidence to the originating GitHub issue. The script:

1. Finds the latest screenshot from `evidence/screenshots/`
2. Reads `evidence/reports/results.xml` (JUnit) to extract pass/fail counts
3. Composes a markdown comment body
4. Posts via `gh issue comment`

---

## Bash Script (Primary — GitHub Actions + macOS)

```bash
#!/usr/bin/env bash
# scripts/post-evidence-comment.sh
#
# Usage: ISSUE_NUMBER=42 GITHUB_REPOSITORY=owner/repo bash scripts/post-evidence-comment.sh
#
# Environment variables:
#   ISSUE_NUMBER         - required: GitHub issue number to comment on
#   GITHUB_REPOSITORY    - required: owner/repo (set automatically in Actions)
#   GITHUB_RUN_ID        - optional: CI run ID for artifact links
#   GITHUB_SERVER_URL    - optional: defaults to https://github.com
#   GITHUB_TOKEN         - required: token with issues:write scope (auto in Actions)

set -euo pipefail

# ── Validate required vars ─────────────────────────────────────────────────
: "${ISSUE_NUMBER:?ISSUE_NUMBER is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

GITHUB_SERVER_URL="${GITHUB_SERVER_URL:-https://github.com}"
GITHUB_RUN_ID="${GITHUB_RUN_ID:-}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EVIDENCE_DIR="evidence"
COMMENT_FILE="${EVIDENCE_DIR}/comment-body.md"

mkdir -p "${EVIDENCE_DIR}"

# ── Read test results from JUnit XML ─────────────────────────────────────
RESULTS_XML="${EVIDENCE_DIR}/reports/results.xml"
TESTS_TOTAL=0
TESTS_FAILED=0
TESTS_PASSED=0

if [ -f "${RESULTS_XML}" ]; then
  # Extract counts using grep + sed (no jq/xmllint dependency)
  TESTS_TOTAL=$(grep -o 'total="[0-9]*"' "${RESULTS_XML}" | head -1 | grep -o '[0-9]*' || echo "0")
  TESTS_FAILED=$(grep -o 'failures="[0-9]*"' "${RESULTS_XML}" | head -1 | grep -o '[0-9]*' || echo "0")
  TESTS_PASSED=$(( TESTS_TOTAL - TESTS_FAILED ))
fi

# ── Determine result icon ─────────────────────────────────────────────────
if [ "${TESTS_FAILED}" -eq 0 ] && [ "${TESTS_TOTAL}" -gt 0 ]; then
  RESULT_ICON="✅"
  RESULT_LABEL="PASSED"
elif [ "${TESTS_FAILED}" -gt 0 ]; then
  RESULT_ICON="❌"
  RESULT_LABEL="FAILED"
else
  RESULT_ICON="⚠️"
  RESULT_LABEL="NO RESULTS"
fi

# ── Find latest screenshot ─────────────────────────────────────────────────
SCREENSHOT_PATH=""
SCREENSHOT_BASE64=""
SCREENSHOT_DIR="${EVIDENCE_DIR}/screenshots"

if [ -d "${SCREENSHOT_DIR}" ]; then
  # Get the most recently modified .png
  SCREENSHOT_PATH=$(find "${SCREENSHOT_DIR}" -name "*.png" -type f \
    -newer /tmp/.post-evidence-marker 2>/dev/null \
    | sort -t- -k2 | tail -1 || true)

  # Fallback: newest file overall if no files newer than marker
  if [ -z "${SCREENSHOT_PATH}" ]; then
    SCREENSHOT_PATH=$(find "${SCREENSHOT_DIR}" -name "*.png" -type f \
      | sort | tail -1 || true)
  fi
fi

# Inline screenshot if ≤500KB (GitHub renders base64 inline images in markdown)
if [ -n "${SCREENSHOT_PATH}" ] && [ -f "${SCREENSHOT_PATH}" ]; then
  SIZE=$(wc -c < "${SCREENSHOT_PATH}")
  if [ "${SIZE}" -lt 512000 ]; then
    SCREENSHOT_BASE64=$(base64 < "${SCREENSHOT_PATH}" | tr -d '\n')
  fi
fi

# ── Find latest failing test name from JUnit XML ────────────────────────
FAILING_TEST=""
if [ -f "${RESULTS_XML}" ] && [ "${TESTS_FAILED}" -gt 0 ]; then
  FAILING_TEST=$(grep -o 'name="[^"]*"' "${RESULTS_XML}" | head -1 | sed 's/name="//;s/"//')
fi

# ── Build artifact URL ────────────────────────────────────────────────────
ARTIFACT_URL=""
if [ -n "${GITHUB_RUN_ID}" ]; then
  ARTIFACT_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
fi

# ── Compose comment body ──────────────────────────────────────────────────
cat > "${COMMENT_FILE}" << EOF
## 🎭 E2E Test Evidence — DELIVER Phase ${RESULT_ICON}

| | |
|---|---|
| **Result** | ${RESULT_LABEL} — ${TESTS_PASSED} passed, ${TESTS_FAILED} failed |
| **Timestamp** | \`${TIMESTAMP}\` |
| **Repository** | \`${GITHUB_REPOSITORY}\` |
EOF

if [ -n "${ARTIFACT_URL}" ]; then
  echo "| **CI Run** | [${GITHUB_RUN_ID}](${ARTIFACT_URL}) |" >> "${COMMENT_FILE}"
fi

echo "" >> "${COMMENT_FILE}"

# Failing test details
if [ -n "${FAILING_TEST}" ]; then
  cat >> "${COMMENT_FILE}" << EOF
### ❌ Failing Test

\`${FAILING_TEST}\`

EOF
fi

# Screenshot section
if [ -n "${SCREENSHOT_BASE64}" ]; then
  cat >> "${COMMENT_FILE}" << EOF
### Screenshot

![E2E test failure screenshot](data:image/png;base64,${SCREENSHOT_BASE64})

EOF
elif [ -n "${SCREENSHOT_PATH}" ]; then
  cat >> "${COMMENT_FILE}" << EOF
### Screenshot

_Screenshot >500KB — available in CI artifacts._

EOF
fi

# Artifacts section
if [ -n "${ARTIFACT_URL}" ]; then
  cat >> "${COMMENT_FILE}" << EOF
### Artifacts

- [Screenshots, videos, traces, HTML report](${ARTIFACT_URL})

EOF
fi

# Collapsible full output from JUnit XML (first 50 failure messages)
if [ -f "${RESULTS_XML}" ] && [ "${TESTS_FAILED}" -gt 0 ]; then
  FAILURES=$(grep -o '<failure[^>]*>[^<]*' "${RESULTS_XML}" | head -50 \
    | sed 's/<failure[^>]*>//g' || true)

  if [ -n "${FAILURES}" ]; then
    cat >> "${COMMENT_FILE}" << EOF
<details>
<summary>Test failure details</summary>

\`\`\`
${FAILURES}
\`\`\`

</details>
EOF
  fi
fi

echo "Comment body written to: ${COMMENT_FILE}"

# ── Post comment ───────────────────────────────────────────────────────────
touch /tmp/.post-evidence-marker   # update marker for next run's screenshot detection

echo "Posting evidence to issue #${ISSUE_NUMBER} in ${GITHUB_REPOSITORY}..."

if gh issue comment "${ISSUE_NUMBER}" \
  --body-file "${COMMENT_FILE}" \
  --repo "${GITHUB_REPOSITORY}"; then
  echo "✅ Evidence comment posted successfully"
else
  # Do not fail the CI run — a comment failure must not block the pipeline
  echo "::warning::Failed to post evidence comment. Evidence is available in CI artifacts."
  exit 0
fi
```

## PowerShell Script (Windows CI / cross-platform)

```powershell
# scripts/Post-EvidenceComment.ps1
#Requires -Version 7.0
param(
    [Parameter(Mandatory)] [string] $IssueNumber,
    [Parameter(Mandatory)] [string] $Repository,
    [string] $RunId         = $env:GITHUB_RUN_ID ?? '',
    [string] $ServerUrl     = $env:GITHUB_SERVER_URL ?? 'https://github.com',
    [string] $EvidenceDir   = 'evidence'
)

$ErrorActionPreference = 'Stop'
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

# Read JUnit results
$resultsXml  = Join-Path $EvidenceDir 'reports' 'results.xml'
$totalTests  = 0
$failedTests = 0

if (Test-Path $resultsXml) {
    [xml]$junit      = Get-Content $resultsXml
    $totalTests  = [int]($junit.SelectSingleNode('//*[@total]')?.Attributes['total']?.Value ?? 0)
    $failedTests = [int]($junit.SelectSingleNode('//*[@failures]')?.Attributes['failures']?.Value ?? 0)
}

$passedTests = $totalTests - $failedTests
$icon        = $failedTests -gt 0 ? '❌' : '✅'
$label       = $failedTests -gt 0 ? 'FAILED' : 'PASSED'

# Find latest screenshot
$screenshotDir  = Join-Path $EvidenceDir 'screenshots'
$screenshotPath = $null
$screenshotB64  = $null

if (Test-Path $screenshotDir) {
    $screenshotPath = Get-ChildItem $screenshotDir -Filter '*.png' |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName

    if ($screenshotPath -and (Get-Item $screenshotPath).Length -lt 512000) {
        $screenshotB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($screenshotPath))
    }
}

$artifactUrl = $RunId ? "${ServerUrl}/${Repository}/actions/runs/${RunId}" : ''

# Compose markdown
$sb = [System.Text.StringBuilder]::new()
$null = $sb.AppendLine("## 🎭 E2E Test Evidence — DELIVER Phase ${icon}")
$null = $sb.AppendLine("")
$null = $sb.AppendLine("| | |")
$null = $sb.AppendLine("|---|---|")
$null = $sb.AppendLine("| **Result** | ${label} — ${passedTests} passed, ${failedTests} failed |")
$null = $sb.AppendLine("| **Timestamp** | \`${timestamp}\` |")
if ($artifactUrl) {
    $null = $sb.AppendLine("| **CI Run** | [${RunId}](${artifactUrl}) |")
}
$null = $sb.AppendLine("")

if ($screenshotB64) {
    $null = $sb.AppendLine("### Screenshot")
    $null = $sb.AppendLine("")
    $null = $sb.AppendLine("![E2E failure screenshot](data:image/png;base64,${screenshotB64})")
    $null = $sb.AppendLine("")
}

if ($artifactUrl) {
    $null = $sb.AppendLine("### Artifacts")
    $null = $sb.AppendLine("")
    $null = $sb.AppendLine("- [All evidence files](${artifactUrl})")
}

$commentFile = Join-Path $EvidenceDir 'comment-body.md'
$sb.ToString() | Set-Content $commentFile -Encoding utf8

# Post via gh CLI
try {
    gh issue comment $IssueNumber --body-file $commentFile --repo $Repository
    Write-Host "✅ Evidence comment posted to issue #${IssueNumber}"
}
catch {
    Write-Warning "Failed to post evidence comment: $_"
    exit 0   # do not fail the pipeline
}
```

## Orchestrator Invocation

The `skraft-orchestrator` calls the upload script after each DELIVER phase test run:

```yaml
# In the orchestrator's DELIVER phase post-run hook:
- name: Upload evidence to issue
  env:
    GITHUB_TOKEN:       ${{ secrets.GITHUB_TOKEN }}
    ISSUE_NUMBER:       ${{ env.DELIVER_ISSUE_NUMBER }}
    GITHUB_REPOSITORY:  ${{ github.repository }}
    GITHUB_RUN_ID:      ${{ github.run_id }}
  run: bash scripts/post-evidence-comment.sh
```

## Expected GitHub Comment Output

The comment posted to the issue looks like:

---

**🎭 E2E Test Evidence — DELIVER Phase ❌**

| | |
|---|---|
| **Result** | FAILED — 2 passed, 1 failed |
| **Timestamp** | `2024-05-14T12:00:00Z` |
| **CI Run** | [12345678](https://github.com/owner/monassurance/actions/runs/12345678) |

### ❌ Failing Test

`MonAssurance.IntegrationTests.Tests.EligibilityCheckTests.Submit_ValidDriver_ShouldShowEligibleResult`

### Screenshot

![E2E failure screenshot](data:image/png;base64,...)

### Artifacts

- [Screenshots, videos, traces, HTML report](https://github.com/owner/monassurance/actions/runs/12345678)

---
