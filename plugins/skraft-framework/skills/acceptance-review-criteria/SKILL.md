---
name: acceptance-review-criteria
description: "Use with the gate skill of a DISTILL review lens, or with all four when self-checking DISTILL artefacts: the proven `existing` row, the severities and the fields of a finding shared by every lens."
---

# Acceptance Review Criteria

What every DISTILL review lens shares. The gates are in the gate skill of each lens.

**Proven `existing` row:** `Priority` `existing`, and its Scenario cell names the covering test (file and test name, a test the research document lists under `Existing tests`), the command that ran it filtered to it, and its result `passed`. An `existing` row missing the test, the command or the result, or whose result is not `passed`, is exempt from neither G6 nor G7: it is a finding of each gate it would skip.

## Finding

- `gate` — one gate id of your gate skill (G1–G11, B1, T1–T4, E1–E2)
- `severity` — the severity your gate table gives that gate: BLOCKER (DELIVER cannot use the artefact as is), HIGH (rework risk in DELIVER), MEDIUM (usable but suboptimal), LOW (style, no effect on DELIVER)
- `finding` — plain-language description of the problem
- `location` — file path and line/scenario reference
- `suggestion` — (optional) how to fix it

## References

- [verdict-rubric.md](references/verdict-rubric.md) — the lens → skill map, how severities give the verdict, confidence levels, dissent between lenses, example verdicts
