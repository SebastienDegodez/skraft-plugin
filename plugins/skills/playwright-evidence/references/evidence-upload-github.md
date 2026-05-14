# GitHub Evidence Upload Reference

## Token Scopes Required

| Scope | Needed for |
|---|---|
| `repo` | Create comments on private repo issues |
| `public_repo` | Create comments on public repo issues |
| `write:discussion` | NOT needed for issue comments |

Use a fine-grained PAT with **Issues: Read and Write** permission scoped to the target repository.
Store as `GITHUB_TOKEN` (Actions default) or `EVIDENCE_UPLOAD_TOKEN` for explicit PAT.

## REST API — Create Issue Comment

```
POST /repos/{owner}/{repo}/issues/{issue_number}/comments
Authorization: Bearer {token}
Content-Type: application/json

{
  "body": "<markdown string>"
}
```

### curl

```bash
curl -s -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$GITHUB_REPOSITORY_OWNER/$GITHUB_REPOSITORY_NAME/issues/$ISSUE_NUMBER/comments" \
  -d "{\"body\": $(jq -Rs . < evidence/comment-body.md)}"
```

### `gh` CLI (preferred in CI)

```bash
gh issue comment "$ISSUE_NUMBER" \
  --body-file evidence/comment-body.md \
  --repo "$GITHUB_REPOSITORY"
```

`gh` handles auth via `GITHUB_TOKEN` automatically when running in GitHub Actions.

## Comment Body Format

### Markdown Template

````markdown
## 🎭 E2E Test Evidence — DELIVER Phase

**Run:** [`${{ github.run_id }}`](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})
**Branch:** `${{ github.head_ref }}`
**Timestamp:** 2024-05-14T12:00:00Z
**Result:** ❌ FAILED — 2 passed, 1 failed

---

### Failing Test

`MonAssurance.IntegrationTests.EligibilityCheckTests.Submit_ValidDriver_ShouldShowEligibleResult`

### Screenshot

![failure screenshot](data:image/png;base64,{BASE64_IMAGE})

<details>
<summary>Full Test Output</summary>

```
Expected: eligible
Actual:   rejected
  at EligibilityCheckTests.Submit_ValidDriver_ShouldShowEligibleResult line 42
```

</details>

### Artifacts

- [HTML Report](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}/artifacts)
- [Trace File](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}/artifacts)
- [Video Recording](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}/artifacts)
````

### Compose Body in Bash

```bash
#!/usr/bin/env bash
set -euo pipefail

SCREENSHOT_PATH="evidence/screenshots/failure-latest.png"
REPORT_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"

# Inline screenshot if small enough (<500KB)
SCREENSHOT_BASE64=""
if [ -f "$SCREENSHOT_PATH" ]; then
  SIZE=$(wc -c < "$SCREENSHOT_PATH")
  if [ "$SIZE" -lt 512000 ]; then
    SCREENSHOT_BASE64=$(base64 < "$SCREENSHOT_PATH" | tr -d '\n')
  fi
fi

# Build markdown body
cat > evidence/comment-body.md << EOF
## 🎭 E2E Test Evidence — DELIVER Phase

**Run:** [${GITHUB_RUN_ID}](${REPORT_URL})
**Branch:** \`${GITHUB_HEAD_REF:-${GITHUB_REF_NAME}}\`
**Timestamp:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

### Screenshot
EOF

if [ -n "$SCREENSHOT_BASE64" ]; then
  echo "![failure](data:image/png;base64,${SCREENSHOT_BASE64})" >> evidence/comment-body.md
else
  echo "_Screenshot >500KB — see CI artifacts._" >> evidence/comment-body.md
fi

cat >> evidence/comment-body.md << EOF

### Artifacts
- [Test Evidence](${REPORT_URL})
EOF
```

## Large File Upload (>1MB) via GitHub API

GitHub issue comment bodies support embedded base64 images but inline base64 over ~500KB
causes slow rendering. For large files, upload as a release asset or link to CI artifact:

```bash
# Upload as GitHub release asset (requires release to exist)
gh release upload "v${VERSION}" evidence/traces/trace.zip \
  --repo "$GITHUB_REPOSITORY"

# Or reference the artifact URL from the current Actions run
echo "See artifacts: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
```

## Rate Limits

| API | Limit | Notes |
|---|---|---|
| REST authenticated | 5,000 req/hour | Per PAT or `GITHUB_TOKEN` |
| REST `GITHUB_TOKEN` (Actions) | 1,000 req/hour per repo | Per workflow run |
| Secondary rate limit | Avoid >100 requests/minute | Burst limit |

One comment per DELIVER phase run — no rate limit concerns in normal usage.

## Error Handling

```bash
RESPONSE=$(gh issue comment "$ISSUE_NUMBER" \
  --body-file evidence/comment-body.md \
  --repo "$GITHUB_REPOSITORY" 2>&1)

if echo "$RESPONSE" | grep -q "error"; then
  echo "::warning::Failed to post evidence comment: $RESPONSE"
  exit 0   # do not fail the CI run for upload errors
fi
```

Always use `exit 0` after upload errors — a comment failure must not block CI.
