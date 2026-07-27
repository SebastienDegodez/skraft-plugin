# RPI research and plan route

Use for RPI Agent Research or Plan, Task Researcher, Task Planner, Researcher
Subagent, Plan Validator, and research, plan, details, or planning-log artifacts.

## Skill Loading — MANDATORY

Load each always-load skill before starting Research or Plan. Only announce
missing ones: `[SKILL MISSING] {skill-name}`. A missing mandatory skill blocks
phase completion.

### Always load for this route

* `architecture-patterns`
* `test-design-mandates`
* `bdd-methodology`

### Load on demand (trigger-based)

| Skill | Load when... |
|---|---|
| `adr-eligibility-gate` | Evaluating whether a structural choice is ADR-worthy, before drafting any ADR |
| `architecture-decisions` | The eligibility gate returns an ADR-worthy decision |
| `contract-testing` | An API or event integration boundary exists |

Before plan completion, require bounded-context and modularity classification,
ADRs for genuine non-baseline structural decisions, behavior-oriented
acceptance framing, a layer-appropriate test matrix, and Walking Skeleton order.
