---
name: skraft-difficulty-routing
description: "Use at DISCOVER exit to evaluate 3-axis routing (entry point, depth tier, difficulty tier), validate immutable invariants, and persist to state.json"
---

# SKRAFT Difficulty Routing

Evaluate three orthogonal axes at the exit of the DISCOVER phase. The orchestrator invokes this skill once per pipeline run, then persists the outcome to `state.json` before transitioning to DISCUSS.

## The three orthogonal axes

### 1. Entry Point — which phases run

Determine whether any phases can be skipped because their checklist is already satisfied (e.g. an ADR exists and matches the scope, so DESIGN can be bypassed). Persisted in `state.json::entryPoint`. Default: all five phases run.

### 2. Depth Tier — strictness within each phase

Aligned with HVE-Core / RPI vocabulary. Persisted in `state.json::userPreferences.depthTier`. **Default = `comprehensive`**.

| Depth Tier | TDD (mandatory) | Mutation Domain / Application | Mutation API / Infrastructure | Reviewer lenses | Gherkin gate | Use case |
|---|---|---|---|---|---|---|
| `basic` | Red-Green | skip | skip | 1 | recommended | Prototype, spike |
| `standard` | Red-Green-Refactor | **100%** | skip | 2 | recommended | Non-critical feature, fast iteration |
| `comprehensive` **(default)** | Outside-In double-loop | **100%** | **90%** | 4 (full A7) | mandatory | Production feature, critical code, public API |
| `custom` | mandatory (variant of choice) | user-defined ≥ 0 | user-defined ≥ 0 | user-defined ≥ 1 | user-defined | Edge case — subject to immutable invariants |

The orchestrator persists `comprehensive` if no explicit user choice was recorded. Any downgrade to `basic`, `standard`, or `custom` requires an explicit user decision captured at the exit of DISCOVER, with rationale appended to `state.json::depthTierOverrides`.

### 3. Difficulty Tier — DELIVER execution model

Persisted in `state.json::difficulty`. Drives whether the software-engineer agent works inline or dispatches sub-agents and intermediate artifacts:

| Difficulty | DELIVER execution model |
|---|---|
| `simple` | Inline TDD cycle, single commit per scenario |
| `medium` | Inline TDD cycle, multi-commit per scenario, walking skeleton |
| `medium-hard` | Dispatch sub-agent per Gherkin scenario, write intermediate plan |
| `challenging` | Dispatch sub-agent per scenario, write spike notes under `details/{date}/`, multiple review passes |

Difficulty is assessed once at DISCOVER exit and never re-evaluated mid-pipeline.

## Immutable invariants (always blocking, including in `custom`)

The following invariants cannot be downgraded by any depth tier choice:

- **TDD mandatory** — at minimum Red-Green; no production code without a prior failing test.
- **Clean Architecture layer boundaries** — Domain depends on neither Application nor Infrastructure.
- **Test integrity** — no test may be deleted or disabled to pass GREEN.
- **state.json schema compliance** — every turn writes a valid state document.
- **HVE dated paths** — `research/{date}/`, `adrs/`, `details/{date}/`, `changes/{date}/`, `reviews/{date}/`.
- **Reviewers are read-only** — reviewers write exclusively to `reviews/{date}/`.
- **No secrets or credentials committed**.

## Per-gate enforcement levels (default mapping)

Enforcement levels:

- `advisory` — logged in `reviews/{date}/` but does not block.
- `warning` — blocks unless an explicit override with rationale is appended to `state.json::depthTierOverrides`.
- `blocking` — blocks with no override possible.

| Gate | basic | standard | comprehensive |
|---|---|---|---|
| Clean Architecture boundaries | blocking | blocking | blocking |
| TDD cycle respected | blocking | blocking | blocking |
| Test integrity | blocking | blocking | blocking |
| Mutation Domain/Application ≥ threshold | advisory | blocking | blocking |
| Mutation API/Infrastructure ≥ threshold | advisory | advisory | blocking |
| Gherkin gate (user-approved scenarios) | advisory | warning | blocking |
| ADR for non-trivial decisions | advisory | warning | blocking |
| Object Calisthenics (Domain) | advisory | warning | blocking |

## Consistency checks on `custom`

When the user selects `custom`, they populate `state.json::userPreferences.customDepth` with per-gate enforcement levels. The orchestrator refuses to proceed if any of the following invalid combinations is detected:

| Forbidden combination | Reason |
|---|---|
| Any invariant-mapped gate set to anything other than `blocking` | Immutable invariants |
| `mutationDomain: blocking` with `mutationDomainThreshold: 0` | A zero threshold makes the gate meaningless |
| `gherkinGate: advisory` combined with `mutationApi: blocking` | API tests without BDD = no observable behavior under test |
| `tddCycle` set to anything other than `blocking` | TDD is an immutable invariant |

On conflict the orchestrator halts and asks the user to correct `userPreferences.customDepth` before continuing.

## Output protocol

After evaluation, the orchestrator must:

1. Write `state.json::entryPoint`, `state.json::userPreferences.depthTier`, and `state.json::difficulty`.
2. If the depth tier is not `comprehensive`, append the rationale string to `state.json::depthTierOverrides`.
3. Surface the routing decision in the next user-facing message using an emoji checklist (✅ chosen axis values, 🛡️ active invariants).
4. Proceed to DISCUSS once the user acknowledges the routing summary.
