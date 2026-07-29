# MCP GitHub Tool Usage Patterns

Practical usage patterns for the two GitHub MCP tools used during DISCOVER phase: `mcp_github_search_issues` and `mcp_github_issue_write`.

---

## Available Tools

| Tool | Operation | Use When |
|---|---|---|
| `mcp_github_search_issues` | Read — search and list issues | Discovering, filtering, and ranking issues |
| `mcp_github_issue_write` | Write — update labels, milestone, assignees | Applying triage labels after classification |

---

## mcp_github_search_issues

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `owner` | string | yes | Repository owner (org or user) |
| `repo` | string | yes | Repository name |
| `query` | string | yes | GitHub search query string |
| `per_page` | integer | no | Results per page (max 100, default 30) |
| `page` | integer | no | Page number, 1-based (default 1) |

### Example Call

```json
{
  "tool": "mcp_github_search_issues",
  "parameters": {
    "owner": "MonAssurance",
    "repo": "monassurance-api",
    "query": "assignee:@me is:open is:issue sort:updated-desc",
    "per_page": 20,
    "page": 1
  }
}
```

### Response Shape

```json
{
  "total_count": 47,
  "incomplete_results": false,
  "items": [
    {
      "number": 42,
      "title": "Add eligibility check for young drivers",
      "body": "As a driver under 25 years old, I want the system to check my eligibility...",
      "state": "open",
      "labels": [
        {"id": 1, "name": "type/feature", "color": "0075ca"},
        {"id": 2, "name": "priority/P1", "color": "e4e669"}
      ],
      "assignees": [
        {"login": "sebastien", "id": 123}
      ],
      "milestone": {
        "number": 3,
        "title": "v0.2",
        "state": "open"
      },
      "created_at": "2026-04-10T14:30:00Z",
      "updated_at": "2026-05-01T09:15:00Z",
      "closed_at": null,
      "comments": 3,
      "html_url": "https://github.com/MonAssurance/monassurance-api/issues/42"
    }
  ]
}
```

### Key Fields to Extract

| Field | Use |
|---|---|
| `number` | Issue identifier for triage table |
| `title` | Triage table display + duplicate detection |
| `body` | Context for priority and effort estimation |
| `labels[].name` | Current labels (do not re-apply existing ones) |
| `milestone.title` | Sprint context |
| `updated_at` | Recency signal for ranking |
| `comments` | Activity signal |

### Error Handling

| HTTP Status | Meaning | Recovery Action |
|---|---|---|
| 200 OK | Success | Parse `items` array |
| 422 Unprocessable Entity | Invalid query syntax | Log the query; remove qualifiers one at a time until valid: start by removing `in:` clauses, then date filters, then label filters |
| 403 Forbidden | Rate limit hit | Wait 60 seconds; retry once; if still 403, stop and report |
| 404 Not Found | Repository does not exist | Verify `owner` and `repo` values; report blocker |
| 401 Unauthorized | Not authenticated | Report authentication blocker |
| 500 Server Error | GitHub internal error | Wait 30 seconds, retry once |

---

## mcp_github_issue_write

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `owner` | string | yes | Repository owner |
| `repo` | string | yes | Repository name |
| `issue_number` | integer | yes | Issue number to update |
| `labels` | string[] | no | Full label set (replaces existing labels entirely) |
| `milestone` | integer | no | Milestone ID (not title — use the `number` field from milestone) |
| `assignees` | string[] | no | Full assignee list (replaces existing assignees) |

> **Critical**: labels is a full replacement, not an additive operation. Always include all labels you want the issue to have, including ones already present.

### Example Call — Apply Triage Labels

```json
{
  "tool": "mcp_github_issue_write",
  "parameters": {
    "owner": "MonAssurance",
    "repo": "monassurance-api",
    "issue_number": 42,
    "labels": [
      "type/feature",
      "priority/P1",
      "effort/M",
      "status/ready"
    ]
  }
}
```

### Example Call — Mark as Duplicate

```json
{
  "tool": "mcp_github_issue_write",
  "parameters": {
    "owner": "MonAssurance",
    "repo": "monassurance-api",
    "issue_number": 51,
    "labels": [
      "status/duplicate"
    ]
  }
}
```

### What Can and Cannot Be Updated

| Field | Can Update | Notes |
|---|---|---|
| `labels` | Yes | Full replacement — include all desired labels |
| `milestone` | Yes | Use milestone `number` (integer ID), not title string |
| `assignees` | Yes | Full replacement |
| `title` | No | Cannot update via this tool |
| `body` | No | Cannot update via this tool |
| `state` (open/close) | No | Cannot update via this tool |

---

## Pagination Pattern

```
def paginated_search(query, owner, repo, cap=20):
    page = 1
    results = []

    while page <= 3:
        response = mcp_github_search_issues(
            owner=owner,
            repo=repo,
            query=query,
            per_page=20,
            page=page
        )

        results.extend(response.items)

        # Stop if last page or cap reached
        if len(response.items) < 20:
            break

        if len(results) >= cap:
            break

        page += 1
        wait(1)  # 1 second between paginated calls

    return results[:cap]
```

### When to Paginate

| Condition | Action |
|---|---|
| `total_count` > 20 | Paginate up to 3 pages |
| `total_count` ≤ 20 | No pagination needed |
| `incomplete_results: true` | Log warning; results may be partial due to timeout |
| Page 3 reached | Stop regardless of total_count |

### Example: Three-Page Discovery

```
Call 1: page=1 → 20 results (total_count=47) → continue
Call 2: page=2 → 20 results → continue
Call 3: page=3 → 7 results → stop (< 20 results = last page)
Total: 47 fetched, cap to 20 for triage
```

---

## Rate Limiting

| Tier | Limit | Applies to |
|---|---|---|
| Authenticated search | 30 requests/minute | `mcp_github_search_issues` |
| Core REST | 5,000 requests/hour | `mcp_github_issue_write` |
| Unauthenticated search | 10 requests/minute | Always authenticate |

### Backoff Strategy

1. **First 403**: wait 60 seconds, then retry
2. **Second 403**: stop; report rate limit blocker to caller
3. **Preventive**: add 1-second delay between paginated search calls
4. **Budget awareness**: a full 3-mode discovery with 3 pages each = 9 search calls + up to 20 write calls = ~30 total; within limits

---

## Practical Example: Full Paginated Search

```
# Step 1: user-assigned mode
query = "assignee:@me is:open is:issue sort:updated-desc -label:wontfix"

# Step 2: page 1
response_1 = mcp_github_search_issues(owner, repo, query, per_page=20, page=1)
# → 20 items, total_count=34

# wait 1s

# Step 3: page 2
response_2 = mcp_github_search_issues(owner, repo, query, per_page=20, page=2)
# → 14 items (< 20 = last page)

# Step 4: combine and cap
all_issues = response_1.items + response_2.items  # 34 items
triage_set = all_issues[:20]  # cap at 20

# Step 5: apply triage labels to each issue
for issue in triage_set:
    new_labels = existing_labels(issue) + [assigned_type, assigned_priority, assigned_effort, "status/ready"]
    mcp_github_issue_write(owner, repo, issue.number, labels=new_labels)
```
