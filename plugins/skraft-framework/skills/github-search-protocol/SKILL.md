---
name: github-search-protocol
description: "Use when finding GitHub issues to work on, exploring a backlog by labels, milestones or assignees, finding issues related to changed files, or publishing already-prepared Markdown to PR conversation or issue comments, including updates and interrupted-publication retries. Covers issue discovery queries, pagination and ranking, plus MCP-first publication with host gh fallback when MCP capability is unavailable. Not for authoring Markdown, generating reports or judging their content."
---

# GitHub Search Protocol

## Existing issue content is read-only

Never change the `title` or `body` of an existing issue, through MCP, CLI or any
other transport, even when the installed tool exposes those fields. Omit both
fields from issue-update payloads; do not resend their current values.
Publish refinements, acceptance criteria, reports and proposed wording in comments
or local artifacts instead. A comment's `body` is distinct from the issue's `body`:
only the selected comment may be created or updated under the publication protocol.

## Route by intent

- **Publish prepared Markdown** to a GitHub PR conversation or issue comment, update it,
  or reconcile an interrupted attempt: load [GitHub publication](references/github-publication.md)
  and follow that path only. Stop here; do not run discovery or apply its result caps.
- **Discover issues**: continue below. Before a search or triage MCP call, load
  [MCP tool patterns](references/mcp-tool-patterns.md) for host schema binding,
  parameters, responses and errors. For qualifiers or query recipes beyond this page,
  load [search syntax](references/github-search-syntax.md). When extracting domain terms
  from changed files, load [artifact-driven heuristics](references/artifact-driven-heuristics.md).
- **Author Markdown or generate reports**: return to the owning producer; this skill
  transports prepared content, not its authorship or approval.

## Overview

Structured protocol for discovering GitHub issues via three modes. Core principle: **build precise queries to surface signal, not noise**. A well-formed query with 3–5 qualifiers outperforms broad queries with post-hoc filtering.

Three modes address different discovery intents:
- **User-assigned** — "what is mine to work on right now"
- **Artifact-driven** — "what is related to what I am currently changing"
- **Search-based** — "explore a theme or milestone"

---

## GitHub Search Syntax

### Qualifier Reference

| Qualifier | Usage | Example |
|---|---|---|
| `is:issue` | Filter to issues only (exclude PRs) | `is:issue is:open` |
| `is:open` | Open issues only | `is:open` |
| `is:closed` | Closed issues only | `is:closed` |
| `assignee:@me` | Issues assigned to current user | `assignee:@me is:open` |
| `assignee:{user}` | Issues assigned to specific user | `assignee:octocat` |
| `label:{label}` | Filter by single label | `label:bug` |
| `label:{a},{b}` | OR across labels (comma = OR) | `label:bug,feature` |
| `milestone:{name}` | Filter by milestone name | `milestone:v0.2` |
| `in:title` | Search term in title only | `eligibility in:title` |
| `in:body` | Search term in body only | `eligibility in:body` |
| `in:title,body` | Search term in title or body | `eligibility in:title,body` |
| `sort:created-desc` | Sort by newest first | default for most searches |
| `sort:updated-desc` | Sort by recently updated | for active issue tracking |
| `sort:reactions-desc` | Sort by most reactions | for priority signals |
| `no:assignee` | Unassigned issues | `is:open no:assignee` |
| `no:label` | Unlabeled issues | `is:open no:label` |
| `no:milestone` | Issues without milestone | `is:open no:milestone` |
| `-label:{label}` | Exclude issues with label | `-label:wontfix` |
| `author:{user}` | Issues created by user | `author:octocat` |
| `created:>{date}` | Issues created after date | `created:>2026-01-01` |
| `updated:>{date}` | Issues updated after date | `updated:>2026-04-01` |
| `comments:>{n}` | Issues with more than N comments | `comments:>3` |

### Boolean Logic

- **AND** (implicit): multiple terms = AND. `bug login` matches issues containing both words.
- **OR** (explicit): use `OR` keyword. `bug OR feature in:title`
- **NOT** / negation: prefix qualifier with `-`. `-label:wontfix`
- **Exact phrase**: wrap in quotes. `"driver eligibility" in:title`
- **Grouping**: parentheses for compound OR logic (GitHub search has limited support — prefer comma syntax for labels)

### Combining Qualifiers — Examples

```
# My open bugs
assignee:@me is:open is:issue label:bug sort:updated-desc

# Unassigned P0 issues in current milestone
label:priority/P0 no:assignee milestone:v0.2 is:open is:issue

# Recently updated domain issues
eligibility OR driver in:title is:open is:issue sort:updated-desc

# Issues needing triage
no:label is:open is:issue sort:created-desc
```

---

## Mode 1 — User-Assigned Discovery

**When to use**: default mode. "What should I work on today?" No explicit mode request.

**Base query**:
```
assignee:@me is:open is:issue sort:updated-desc
```

**Augmented query** (adds priority sorting):
```
assignee:@me is:open is:issue sort:updated-desc -label:wontfix -label:duplicate
```

**Execution**:
1. Call `mcp_github_search_issues` with `per_page=20, page=1`
2. Paginate if needed (see pagination pattern below)
3. Filter out `status/wontfix`, `status/duplicate`, `invalid` labels post-fetch
4. Cap at 20 results for triage quality

**Result interpretation**:
- Recently updated = actively being discussed → higher relevance
- Many comments = high community interest or blocking issue

---

## Mode 2 — Artifact-Driven Discovery

**When to use**: developer is actively modifying a domain area. "Issues related to what I am changing."

**Step 1 — Get recently modified files**:
```bash
git log --since="7 days ago" --diff-filter=M --name-only --pretty=format: | sort -u
```

**Step 2 — Extract domain keywords**:

Apply these heuristics to file paths and names:

| Heuristic | Action | Example |
|---|---|---|
| Split PascalCase | `EligibilityUseCase` → `Eligibility`, `Use`, `Case` | Keep `Eligibility`, discard `Use`, `Case` |
| Split camelCase | `driverEligibility` → `driver`, `Eligibility` | Keep both |
| Filter infrastructure nouns | Discard: `Controller`, `Repository`, `Service`, `Handler`, `Test`, `Factory`, `Builder`, `Mapper`, `Config` | These are plumbing, not domain |
| Keep domain nouns | Keep: `Eligibility`, `Driver`, `Application`, `Policy`, `Quote`, `Premium`, `Claim`, `Vehicle` | These are domain signal |
| Deduplicate | Keep unique domain terms only | — |
| Cap at 5 terms | Use top 5 most-specific terms | Prefer compound nouns |

**Step 3 — Build query**:
```
{term1} OR {term2} OR {term3} in:title is:open is:issue sort:updated-desc
```

Example: modifying `EligibilityUseCase.cs` and `DriverProfile.cs` →
```
eligibility OR driver in:title is:open is:issue sort:updated-desc
```

**Step 4 — Rank results**:
- Title match > body match (title match = primary signal)
- Issues with both domain terms in title > issues with one term
- Deprioritize issues in `wontfix` or `duplicate` state

---

## Mode 3 — Search-Based Discovery

**When to use**: explicit exploration. User provides labels, milestone, or keywords.

**Query builder**:
1. Start with base: `is:open is:issue`
2. Add user-provided qualifiers one by one
3. Add `sort:updated-desc` unless user specifies different sort

**Examples**:

```bash
# By label
label:bug is:open is:issue sort:created-desc

# By milestone
milestone:v0.2 is:open is:issue sort:updated-desc

# By keyword in title
"eligibility check" is:open is:issue in:title

# Compound: unassigned bugs in current sprint
label:type/bug no:assignee milestone:sprint-3 is:open is:issue

# High priority unassigned
label:priority/P0,priority/P1 no:assignee is:open is:issue sort:created-desc
```

---

## MCP Tool Patterns

Before invoking a discovery/triage tool, load [MCP tool patterns](references/mcp-tool-patterns.md).
That reference owns parameter, response and error details; bind its example names to
actual exposed host tools and schemas, never manufacture a callable namespace.

---

## Pagination Pattern

DISCOVER only: bounded issue search is not exhaustive publication reconciliation.
Publication must read every relevant comment page; use its routed reference instead.

```
page = 1
results = []

loop:
  response = mcp_github_search_issues(query, per_page=20, page=page)
  results += response.items
  if len(response.items) < 20 OR page >= 3:
    break
  page += 1
  # wait 1 second between paginated calls to respect rate limits

return results[:20]  # cap final set at 20
```

Maximum pages: 3 (60 issues). Always cap final result at 20 for triage quality.

---

## Rate Limiting

- **Authenticated**: 30 requests/minute for search endpoints
- **Burst**: short bursts of up to 10 requests are tolerated
- **Backoff strategy**:
  1. On 403: wait 60 seconds, retry once
  2. If second attempt also 403: report rate limit blocker, stop
  3. Between paginated calls: add 1 second delay
- **Quota awareness**: a full 3-mode discovery with pagination uses ~9 calls; well within limits

---

## Result Ranking

After fetching, rank results for triage priority:

1. **`priority/P0` label** — always first
2. **`priority/P1` label** — second
3. **Recently updated** — among same priority, sort by `updated_at` descending
4. **Deprioritize**:
   - Issues labeled `wontfix`
   - Issues labeled `duplicate`
   - Issues labeled `invalid`
   - Issues with no activity in > 90 days (unless P0)

---

## References

- [github-search-syntax.md](references/github-search-syntax.md) — complete qualifier cheatsheet and query recipes
- [mcp-tool-patterns.md](references/mcp-tool-patterns.md) — tool parameters, response shapes, pagination examples
- [artifact-driven-heuristics.md](references/artifact-driven-heuristics.md) — domain term extraction algorithm with auto-insurance examples
