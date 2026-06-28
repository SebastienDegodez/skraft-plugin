<!-- markdownlint-disable-file -->
# Sprint Proposal — 2026-06-28

Discovery mode: user-assigned (single orchestrator-pinned story #49)
Query: `repo:SebastienDegodez/skraft-plugin is:issue is:open number:49`
Capacity: 5 team-days (effective: 3.5 = 5 × 0.7)
Iteration scope: single ready story (#49)
Timestamp: 2026-06-28T00:00:00+02:00

| # | Title | Priority | Effort | Days | Justification |
|---|---|---|---|---|---|
| 49 | G1 dispatch-order guard (anti wrong-agent) | P1 | M | 1.0 | Phase-1 MVP critical path; anti-drift core guard; deps #47/#48 done/merged |

Total effort: 1.0 day
Status: within capacity

## Dependency Confirmation
- #47 (Foundation Clean Architecture) — SATISFIED (`json-state-reader` + ports/adapters present)
- #48 (Config generator) — SATISFIED (`skraft-framework.config.json`: `phaseOrder` + `phaseAgents`)
- Epic parent #42 — open umbrella; no blocking gate on #49.

## Excluded (XL — must split)
- None. #49 is M and well-scoped.

## Ready for DISCUSS
- [x] Issue labelled (type/feature + priority/P1 + effort/M) — recommended set documented in triage
- [x] Dependencies satisfied (#47, #48 done/merged)
- [x] Duplicates handled (no duplicate; build-time `dispatch-policy` disambiguated from runtime `pipeline-policy`)
- [x] No XL split required
- [ ] Reviewer (backlog-discoverer-reviewer) approval pending
