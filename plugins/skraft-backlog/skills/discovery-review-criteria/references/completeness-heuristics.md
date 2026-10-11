# Discovery Completeness Heuristics

Guidance on when to stop discovering, how to assess coverage quality, and which signals indicate a thorough discovery run versus a premature stop.

---

## Overview

Completeness is not "find every open issue." It is "ensure no critical issues are hidden."

A DISCOVER run is **sufficient** when:
1. All P0 and P1 issues in the target area have been surfaced
2. All 3 discovery modes have been applied (or skipped with justification)
3. A second pass produces no new P0 or P1 issues

---

## When to Stop Discovering

### Stop Signals

| Signal | Meaning |
|---|---|
| Second pass of user-assigned mode returns same issues as first pass | Coverage is stable |
| Artifact-driven query returns ≤ 2 new issues not already in the list | Domain area is well-covered |
| Search-based exploration with known keywords returns no new P0/P1 | Critical issues are surfaced |
| P0 count is stable between two consecutive runs | No hidden blockers |

### Do Not Stop If

| Warning Signal | Action |
|---|---|
| Only user-assigned mode was run | Apply at least artifact-driven if recent commits exist |
| Fewer than 5 issues found in a repo with known open work | Broaden query — something is being missed |
| P0 count changed between runs | Re-run until stable |
| Team member mentions a known blocker not in the triage | Add to triage immediately; re-run G2 check |

---

## Coverage Assessment

### What "80% Coverage" Means

Coverage is estimated per target area (the domain scope of the current sprint):

```
coverage = (issues found in triage / total open issues in target area) × 100
```

**Target area** = the domain labels or milestone the discovery is focused on.

Example: if the target area is "eligibility" and the repository has 12 open issues with `area/domain` label touching eligibility, and the triage found 10 of them → coverage = 83% → sufficient.

### Coverage Estimation Technique

When total issue count is unknown:
1. Run search with no mode-specific qualifiers: `is:open is:issue label:{area}` → get `total_count`
2. Count issues in triage report for that area
3. Compute ratio

If `total_count` is unavailable from MCP response, use conservative estimation: assume coverage is sufficient only when the second pass yields 0 new issues.

---

## Sampling Strategy for G2

The fastest completeness check is a targeted sample:

### Step 1: Seed query

```
label:priority/P0,priority/P1 is:open is:issue sort:created-asc
```
(Sort by oldest first — the oldest P0/P1 issues are most likely to be overlooked)

### Step 2: Take top 5

Take the 5 oldest P0/P1 issues by creation date.

### Step 3: Cross-reference

For each: verify the issue number appears in the triage report table.

### Step 4: Verdict

- All 5 present → G2 passes (sampling is sufficient for DISCOVER)
- Any absent → G2 fails (BLOCKER)

### Why oldest first?

Recent P0/P1 issues are more likely to appear in user-assigned or recently-updated queries. Old P0/P1 issues that were never addressed are the most common blind spot — they may have been deprioritized and forgotten.

---

## Mode Coverage Checklist

Before calling a discovery run complete, verify each mode:

### Mode 1 — User-Assigned

- [ ] Query was run: `assignee:@me is:open is:issue sort:updated-desc`
- [ ] Results were capped at 20 after pagination
- [ ] No `wontfix` or `duplicate` issues included

### Mode 2 — Artifact-Driven

- [ ] `git log --since="7 days ago"` executed and returned files
- [ ] Domain terms were extracted (filtered infrastructure terms)
- [ ] At least one query was run with extracted terms
- [ ] If no recent commits: explicitly documented as skip reason

### Mode 3 — Search-Based

- [ ] A milestone or theme was identified (from sprint planning or user input)
- [ ] At least one label-based or keyword-based query was run
- [ ] If no specific theme to explore: explicitly documented as skip reason

---

## Anti-Patterns

| Anti-pattern | Why it fails | Correct behavior |
|---|---|---|
| Stopping after 5 issues when 30 are open | Misses P0/P1 issues lower in the list | Paginate and apply mode 2 and 3 |
| Only running user-assigned mode | Missing P0/P1 with no assignee | Always attempt all 3 modes |
| Skipping artifact-driven when code is actively changing | Domain-specific issues missed | Run artifact-driven whenever there are recent commits |
| Not checking if P0 count is stable | Discovery may have missed a P0 | Run a second pass; compare P0 counts |
| Counting closed issues in coverage | Closed issues inflate coverage | Always filter `is:open` |
| Treating "no new issues on second pass" as sufficient with only 3 issues total | Small sample could miss entire areas | Ensure at least 10 issues triaged for any non-trivial repo |

---

## Auto-Insurance Examples

### Sufficient Discovery

A developer modifies `EligibilityUseCase.cs` and `DriverProfile.cs`. The discovery run:
1. User-assigned mode: 6 issues found, including #43 P0 and #42 P1
2. Artifact-driven mode using "eligibility OR driver": 2 additional issues found (#47, #53)
3. Search-based mode with `milestone:v0.2`: 1 additional issue found (#58 P1)
4. Second pass of artifact-driven: same issues, no new P0/P1
→ **Coverage is sufficient** — 9 issues, P0 stable, all modes applied

### Insufficient Discovery

A developer asks "what should I work on?" and the run only:
1. User-assigned mode: 4 issues found
2. Stops here
→ **Insufficient** — artifact-driven not applied; no milestone search; P0 may be missing if recently assigned to another team member

### Missed P0 Example

Repo has issue #31: `priority/P0` label, "Eligibility check returns null for drivers over 70", unassigned, created 21 days ago. User-assigned mode misses it (not assigned to @me). Artifact-driven would catch it if `EligibilityUseCase.cs` was recently modified — but wasn't. Search-based with `label:priority/P0` would catch it. If search-based is skipped → G2 fails.

**Lesson**: always run at least a `label:priority/P0` spot-check query, regardless of mode, to feed G2.
