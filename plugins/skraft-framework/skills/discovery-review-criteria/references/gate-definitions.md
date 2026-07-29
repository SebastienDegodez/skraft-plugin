# Gate Definitions — G1–G6

Step-by-step gate checklists for the `backlog-discoverer-reviewer`. Each gate includes lens assignment, definition, how-to-check procedure, auto-fail triggers, and pass/fail examples from the auto-insurance domain.

---

## G1 — Mode Coverage (Completeness Lens)

**Severity**: HIGH
**Lens**: completeness-lens
**Input**: triage report

### Definition

All 3 discovery modes (user-assigned, artifact-driven, search-based) were considered during the discovery run. Skipped modes are explicitly documented with a reason.

### How to Check

1. Read the "Discovery Mode" section of the triage report
2. Identify which mode(s) were used
3. For each mode NOT used, verify there is an explicit skip reason in the report:
   - Acceptable: "artifact-driven skipped: no commits in last 7 days"
   - Acceptable: "search-based skipped: no milestone or theme to explore"
   - Not acceptable: mode simply absent from report with no explanation
4. If any mode is silently absent → G1 fails

### Auto-Fail Triggers

- Triage report does not mention the 3 modes at all
- Only the default mode (user-assigned) was used without acknowledging the others exist
- No skip justification for unused modes

### Pass Examples

- "User-assigned mode used. Artifact-driven skipped: no commits in last 7 days. Search-based skipped: no active milestone." → **PASS**
- "All 3 modes executed. User-assigned: 8 issues. Artifact-driven: 3 additional issues found. Search-based: 0 new issues." → **PASS**

### Fail Examples

- Triage report starts directly with the triage table — no "Discovery Mode" section → **FAIL**
- "Mode: user-assigned" — no mention of other modes → **FAIL**

---

## G2 — No Missing P0/P1 (Completeness Lens)

**Severity**: BLOCKER
**Lens**: completeness-lens
**Input**: triage report + live GitHub verification

### Definition

No P0 or P1 issue exists in the repository but is absent from the triage report. This gate requires a live sample check against GitHub.

### How to Check

1. Query GitHub for open critical issues:
   ```
   label:priority/P0,priority/P1 is:open is:issue sort:created-desc
   ```
   (Use `mcp_github_search_issues` with the target repository)
2. Take the **top 5 results** sorted by creation date (oldest P0/P1 first — most likely to have been missed)
3. For each of the 5 results: verify the issue number appears in the triage report
4. Any P0 or P1 from the sample that is NOT in the triage report → G2 fails (BLOCKER)

### Auto-Fail Triggers

- Any P0 issue is absent from the triage (regardless of sample size)
- Any P1 issue created more than 7 days ago is absent from the triage
- Cannot perform live check (MCP unavailable) → mark confidence as `low`, note inability to verify G2

### Pass Examples

- Sample of 5 oldest open P0/P1 issues: all 5 appear in triage report → **PASS**
- Only 2 P0/P1 issues exist in the repo; both are in the triage report → **PASS**

### Fail Examples

- Issue #43 (`priority/P0` label, "Fix driver age validation crash") is open but not in the triage → **FAIL (BLOCKER)**
- Issue #31 (`priority/P1` label, "Add eligibility check") was created 14 days ago and absent → **FAIL (BLOCKER)**

---

## G3 — Priority Coherence (Prioritization Lens)

**Severity**: HIGH
**Lens**: prioritization-lens
**Input**: triage report

### Definition

Priority assignments are internally consistent. All P0 issues have explicit written justifications. P1–P3 follows descending business value. No priority inversions exist (a P2 issue that is clearly more urgent than a P1 in the same domain).

### How to Check

1. **P0 justification check**: For every issue labeled P0, verify the Notes field contains a justification in format: `"P0: {what is broken} — {impact}"`. A P0 without justification → G3 fails.
2. **Priority inversion check**: 
   - List all P1 issues
   - List all P2 issues
   - For each P2 issue, ask: "Could a reasonable product manager justify this P2 issue being more urgent than any P1 in the same domain?" If yes → inversion detected → G3 fails
3. **P3 reasonableness check**: Verify P3 issues are genuinely low-value (cosmetic, exploratory, or no product commitment)

### Auto-Fail Triggers

- Any P0 issue missing a written justification in the Notes field
- A P2 bug that is actively degrading a core flow while a P1 cosmetic feature is higher priority
- All issues labeled P1 regardless of actual urgency (inflation)

### Pass Examples

- Issue #43: `P0`, Notes = "P0: NullReferenceException on age < 0 — blocks all submissions" → **PASS** (justified)
- Issue #89: `P3`, Notes = "Cosmetic — tooltips. No milestone commitment" → **PASS** (defensible)

### Fail Examples

- Issue #43: `P0`, Notes = "important bug" → **FAIL** (insufficient P0 justification)
- Issue #71: `P2` (pagination), Issue #67: `P1` (wrong premium calculation) — but #71 listed before #67 in sprint → **FAIL** (priority inversion)

---

## G4 — Capacity Discipline (Prioritization Lens)

**Severity**: HIGH
**Lens**: prioritization-lens
**Input**: sprint proposal

### Definition

The sprint proposal respects declared capacity. Total effort for non-P0 issues does not exceed effective capacity (team-days × 0.7). No P2/P3 issue occupies a sprint slot while a P1 issue is excluded. No XL issues are in the sprint.

### How to Check

1. **XL check**: Scan sprint proposal for any issue with `effort/XL` label → immediate fail if found
2. **Capacity calculation**:
   - Convert each effort to days: XS=0.25, S=0.5, M=1.0, L=2.5
   - Sum all days in sprint proposal (include P0 overrides separately)
   - Compare non-P0 sum to effective capacity (team-days × 0.7)
   - If non-P0 sum > effective capacity → G4 fails
3. **P1 before P2/P3 check**:
   - Identify any P1 issues NOT in the sprint
   - Check if any P2 or P3 issue IS in the sprint
   - If a P2/P3 is included while a P1 is excluded → G4 fails

### Auto-Fail Triggers

- Any `effort/XL` issue appears in the sprint proposal
- A P2 issue is included in the sprint while a P1 issue with available capacity was excluded
- Total non-P0 effort exceeds team-days × 0.7

### Pass Examples (7 team-day sprint, effective = 4.9 days)

```
Sprint: #43 P0 S(0.5d) + #42 P1 M(1.0d) + #58 P1 L(2.5d) + #67 P1 M(1.0d) = 5.0d
P0 override: #43 (0.5d forced in)
Non-P0 capacity used: 4.5d ≤ 4.9d effective
P1 excluded: none
Result: PASS
```

### Fail Examples

```
Sprint includes #89 P3 XS(0.25d) but #67 P1 M(1.0d) is excluded
→ FAIL: P2/P3 before P1
```

```
Sprint includes #101 effort/XL
→ FAIL: XL issue in sprint
```

---

## G5 — No Undetected Duplicates (Duplicate Detection Lens)

**Severity**: HIGH
**Lens**: duplicate-detection-lens
**Input**: full triage report (all issue titles)

### Definition

No two issues in the triage report describe the same problem. Normalized title similarity > 80% between any two issues that are NOT already marked as duplicates = G5 fail.

### How to Check

1. Extract all issue titles from the triage table
2. Normalize each title:
   - Lowercase
   - Remove stop words: `the, a, an, is, in, for, of, to, with, and, or, not, on, at, by, as, up`
   - Remove punctuation
   - Sort words alphabetically
3. For every pair of normalized titles, compute word overlap ratio:
   ```
   similarity = |intersection(words_A, words_B)| / |union(words_A, words_B)|
   ```
4. Any pair with similarity > 80% NOT already marked as `status/duplicate` or flagged as NEAR → G5 fails

### Auto-Fail Triggers

- Two issues with identical titles (different numbers)
- Two issues: "Fix driver age validation" and "Driver age field validation fails" — similarity 85% — not flagged as duplicate

### Pass Examples

- "Add eligibility check for young drivers" vs "Fix validation error on driver age field"
  - Normalized A: `[add, age, check, drivers, eligibility, young]`
  - Normalized B: `[age, driver, error, field, fix, validation]`
  - Overlap: `{age}` = 1; Union = 11; Similarity = 9% → **PASS** (different issues)

### Fail Examples

- "#42: Add eligibility check" vs "#47: Add eligibility validation check"
  - Normalized A: `[add, check, eligibility]`
  - Normalized B: `[add, check, eligibility, validation]`
  - Overlap: `{add, check, eligibility}` = 3; Union = 4; Similarity = 75%… wait, 75% < 80% = borderline G6
  - "#42: Eligibility check for young drivers" vs "#51: Young driver eligibility check"
  - Normalized A: `[check, drivers, eligibility, young]`
  - Normalized B: `[check, driver, eligibility, young]`
  - Overlap: 3/4 = 75% → G6 territory (should be flagged as RELATED)
  - If similarity were 85%: → **FAIL G5**

---

## G6 — Related Issues Flagged (Duplicate Detection Lens)

**Severity**: MEDIUM
**Lens**: duplicate-detection-lens
**Input**: triage report "Duplicates Detected" section

### Definition

All issue pairs with 40–80% normalized title similarity are documented in the "Duplicates Detected" section with a recommendation. The recommendation must be one of: merge, link as related, or keep separate (with justification).

### How to Check

1. From the G5 analysis above, collect all pairs with similarity 40–80%
2. For each such pair, check the "Duplicates Detected" section of the triage report
3. Verify each pair appears with a recommendation
4. A pair present in the 40–80% range but absent from the section → G6 fails

### Auto-Fail Triggers

- Any pair with 40–80% similarity not mentioned in the triage report
- Pair mentioned but with no recommendation (just listed, no action noted)

### Pass Examples

- Triage report contains: `| #42 | #75 | 45% | Related (both touch eligibility API, different scope) — keep separate |` → **PASS**

### Fail Examples

- Issues #71 and #73 have 60% similarity. Triage report "Duplicates Detected" section says "No duplicates detected" → **FAIL G6**

---

## Gate Summary Table

| Gate | Lens | Input | Severity | Check method |
|---|---|---|---|---|
| G1 | Completeness | Triage report | HIGH | Read Discovery Mode section; verify all 3 modes mentioned |
| G2 | Completeness | Triage report + GitHub | BLOCKER | Query top 5 P0/P1 by creation date; verify all in report |
| G3 | Prioritization | Triage report | HIGH | Check P0 justifications; scan for priority inversions |
| G4 | Prioritization | Sprint proposal | HIGH | Check no XL; verify capacity math; check P1 before P2 |
| G5 | Duplicate Detection | Triage report | HIGH | Normalize all titles; compute pairwise similarity; flag >80% pairs |
| G6 | Duplicate Detection | Triage report | MEDIUM | Collect 40–80% pairs from G5; verify each in Duplicates section |
