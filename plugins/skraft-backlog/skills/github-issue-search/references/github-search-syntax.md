# GitHub Search Syntax Cheatsheet

Reference for building precise GitHub issue search queries. All qualifiers are combinable unless noted.

---

## Complete Qualifier Reference

### State and Type

| Qualifier | Description | Example |
|---|---|---|
| `is:issue` | Issues only (excludes pull requests) | `is:issue is:open` |
| `is:pr` | Pull requests only | `is:pr is:merged` |
| `is:open` | Open state | `is:open is:issue` |
| `is:closed` | Closed state | `is:closed is:issue` |
| `is:merged` | Merged PRs | `is:pr is:merged` |
| `is:unmerged` | Open or closed-unmerged PRs | — |

### Assignment and Authorship

| Qualifier | Description | Example |
|---|---|---|
| `assignee:@me` | Assigned to authenticated user | `assignee:@me is:open` |
| `assignee:{user}` | Assigned to specific user | `assignee:octocat` |
| `no:assignee` | Unassigned | `is:open no:assignee` |
| `author:{user}` | Created by user | `author:octocat` |
| `mentions:{user}` | Mentions a user | `mentions:octocat` |
| `reviewed-by:{user}` | Reviewed by user (PRs) | — |

### Labels and Milestones

| Qualifier | Description | Example |
|---|---|---|
| `label:{name}` | Has this label | `label:bug` |
| `label:{a},{b}` | Has label a OR label b | `label:bug,feature` |
| `-label:{name}` | Does NOT have this label | `-label:wontfix` |
| `no:label` | Has no labels | `is:open no:label` |
| `milestone:{title}` | In this milestone | `milestone:v0.2` |
| `no:milestone` | Not in any milestone | `is:open no:milestone` |

### Text Search

| Qualifier | Description | Example |
|---|---|---|
| `{term}` | Term in any field | `eligibility` |
| `{term} in:title` | Term in title only | `eligibility in:title` |
| `{term} in:body` | Term in body only | `eligibility in:body` |
| `{term} in:comments` | Term in comments | `eligibility in:comments` |
| `{term} in:title,body` | Term in title or body | `eligibility in:title,body` |
| `"{phrase}"` | Exact phrase match | `"driver eligibility" in:title` |

### Date Filters

| Qualifier | Description | Example |
|---|---|---|
| `created:>{date}` | Created after date | `created:>2026-01-01` |
| `created:<{date}` | Created before date | `created:<2026-01-01` |
| `created:{date}..{date}` | Created in date range | `created:2026-01-01..2026-04-30` |
| `updated:>{date}` | Updated after date | `updated:>2026-04-01` |
| `closed:>{date}` | Closed after date | `closed:>2026-04-01` |

### Activity

| Qualifier | Description | Example |
|---|---|---|
| `comments:>{n}` | More than N comments | `comments:>3` |
| `comments:<{n}` | Fewer than N comments | `comments:<2` |
| `reactions:>{n}` | More than N reactions | `reactions:>5` |

### Sorting

| Qualifier | Description | Notes |
|---|---|---|
| `sort:created-desc` | Newest first | Default |
| `sort:created-asc` | Oldest first | — |
| `sort:updated-desc` | Recently updated first | Best for active tracking |
| `sort:updated-asc` | Least recently updated | — |
| `sort:comments-desc` | Most discussed first | Good for priority signals |
| `sort:reactions-desc` | Most reactions first | Community interest signal |
| `sort:interactions-desc` | Most interactions (reactions + comments) | — |

---

## Operators

### AND (implicit)

Multiple qualifiers joined without operator = AND.
```
assignee:@me label:bug is:open is:issue
```
Means: assigned to me AND labeled bug AND open AND is an issue.

### OR (explicit keyword)

```
eligibility OR driver in:title is:open is:issue
```

### NOT / Negation

Use `-` prefix on any qualifier.
```
is:open is:issue -label:wontfix -label:duplicate
```

### Exact Phrase (quotes)

```
"eligibility check" in:title is:open is:issue
```

---

## Common Query Recipes

### My open issues (user-assigned mode)
```
assignee:@me is:open is:issue sort:updated-desc -label:wontfix
```

### Unassigned P1 bugs
```
label:type/bug label:priority/P1 no:assignee is:open is:issue sort:created-desc
```

### Issues in current milestone
```
milestone:v0.2 is:open is:issue sort:updated-desc
```

### Recently updated issues in domain area
```
eligibility OR driver in:title is:open is:issue sort:updated-desc
```

### Needs triage (no labels)
```
no:label is:open is:issue sort:created-desc
```

### All critical issues unassigned
```
label:priority/P0 no:assignee is:open is:issue sort:created-asc
```

### Duplicate detection seed
```
"eligibility" in:title is:open is:issue
```
Then compare returned titles manually for overlap.

### Sprint backlog overview
```
milestone:sprint-3 is:open is:issue sort:updated-desc
```

---

## Limitations

| Constraint | Value | Notes |
|---|---|---|
| Max results per query | 1,000 | GitHub caps search results; use date filters to paginate large repos |
| Rate limit (authenticated) | 30 requests/minute | Search endpoint is more restricted than REST |
| Rate limit (unauthenticated) | 10 requests/minute | Always authenticate |
| Full-text regex | Not supported | Use keyword terms; no `/{pattern}/` syntax |
| Complex boolean nesting | Limited | Parentheses unsupported; use comma for label OR |
| Cross-repo search | Supported in global search | Requires `repo:{owner}/{name}` qualifier |
| Label exact match | Case-insensitive | `label:BUG` = `label:bug` |
