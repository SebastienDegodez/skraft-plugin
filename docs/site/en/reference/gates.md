---
layout: doc
lang: en
title: "Review gates"
description: "The gates (Gxx) crossed per phase: what each gate checks and why."
---

# Review gates

> A *gate* is an explicit, binary criterion: the reviewer declares it PASS or FAIL
> before the pipeline moves to the next phase. Nothing implicit, nothing "by feel".

## Why — the problem it solves

Without written criteria, a review depends on the reviewer's mood and memory. Gates
make the review **reproducible**: every verdict rests on a checklist known in advance,
shared by the producer and the reviewer. A failing gate blocks the transition (BLOCKER)
or flags a risk (HIGH/MEDIUM) — never a vague feeling.

## How to read this catalogue

Each phase has its own gate grid, checked by an **independent reviewer** organised
into *lenses* (each lens groups the gates defending one quality). For every gate:
its `Gxx` identifier, what it checks and its **pass condition** (binary).

The four artefact-review phases — DISCOVER, DISCUSS, DESIGN, DISTILL — also carry a
**severity**, which says how a failed gate lands in the reviewer's verdict:

| Severity | Meaning | Effect on verdict |
| --- | --- | --- |
| **BLOCKER** | Fundamental violation invalidating the artefact. | Forces `rejected` — the phase does not pass. |
| **HIGH** | Significant flaw, source of downstream rework. | Forces `changes_requested`. |
| **MEDIUM** | Design smell, sub-optimal choice. | Forces `changes_requested`. |
| **LOW** | Style or consistency detail. | `approved` with a note. |

DELIVER carries no such scale: **every quality gate blocks**. There is no advisory
level, no warning level, no override and no rationale that buys an exemption — the
`skraft-quality-bar` skill owns the enforcement level of every gate and the value of
every threshold, and nothing downstream restates them.

Total: **48 gates** across the 5 phases. What follows is the full grid, exactly as
each reviewer applies it.

---

## DISCOVER — G1 to G6

Reviewer: `backlog-discoverer-reviewer`. 3 lenses. Checks the triage report and the
sprint proposal.

### Lens 1 — Completeness

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G1** | All 3 discovery modes (assigned, artifact-driven, search-based) were considered — or the report explicitly documents why a mode was skipped. | All modes accounted for in the report. | HIGH |
| **G2** | No open P0 or P1 issue exists in the repo while being absent from the triage report. Sample-checked on the 5 most recent. | Zero critical issue absent from triage. | BLOCKER |

### Lens 2 — Prioritization

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G3** | Every P0 has a written justification; P1→P3 follows descending business value; no priority inversion. | No inversions, all P0 justified. | HIGH |
| **G4** | The sprint proposal respects declared capacity (team-days × 0.7); no P2/P3 takes a slot while a P0/P1 is excluded; no issue above 8 points in the sprint. | Capacity respected, issues above 8 points excluded. | HIGH |

### Lens 3 — Duplicate detection

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G5** | Two issues do not describe the same problem (normalized title similarity > 80%). | Zero undetected duplicate pair. | HIGH |
| **G6** | Pairs at 40–80% similarity are flagged with a recommendation (merge, link, keep separate). | All near pairs flagged. | MEDIUM |

---

## DISCUSS — G1 to G8

Reviewer: `backlog-planner-reviewer`. 4 lenses. Checks stories, acceptance criteria
and the sprint plan.

### Lens 1 — INVEST

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G1** | Each story satisfies the 6 INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable). | All criteria pass for every story. | HIGH |
| **G2** | All stories are independently deliverable; no circular dependency. | The dependency graph is a valid DAG. | HIGH |

### Lens 2 — Acceptance-criteria quality

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G3** | Each story has ≥ 3 acceptance criteria in Given/When/Then or bullet format; none is an implementation step. | 3+ criteria per story, correct format, no technical prescription. | HIGH |
| **G4** | No criterion has two valid interpretations for a domain expert with no code knowledge (no HTTP code, HTTP verb, class name). | Every criterion resolves to a single outcome. | BLOCKER |

### Lens 3 — Planning coherence

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G5** | Stories fit the milestone theme; none spans multiple themes without decomposition. | Every story aligns with the milestone theme and time-box. | HIGH |
| **G6** | No circular dependency; the delivery sequence respects topological order. | The graph is a DAG, sequencing is derivable. | BLOCKER |

### Lens 4 — Definition of Ready compliance

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G7** | Each story passes the 8 DoR items: problem statement, specific persona, ≥ 3 domain examples, UAT scenarios, criteria derived from UAT, right-sized, technical notes, dependencies. | 8/8 items for every story. | BLOCKER |
| **G8** | Zero CRITICAL anti-pattern (Implement-X, Giant Stories, No Examples) nor HIGH (technical AC, generic data, tests after code, vague persona, missing dependencies). | No critical anti-pattern detected. | BLOCKER / HIGH |

---

## DESIGN — G1 to G15

Reviewer: `solution-architect-reviewer`. 3 lenses + 1 cross-cutting escalation gate.
Checks ADRs, the supersession registry, diagrams, contracts, consistency matrices.

### Lens 1 — Consistency

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G1** | Every structural commitment — visible in a diagram or detected in code (command/query bus, event store, saga, cross-context ACL) — is justified by a traceable `Accepted` ADR. | Each structural element references ≥ 1 accepted ADR. | BLOCKER |
| **G2** | No two ADRs contradict each other; every supersession is recorded both in the new ADR body AND in the append-only `supersessions.md` registry. | Zero contradicting decision, complete supersession links. | BLOCKER |
| **G10** | A consistency matrix exists per story and its `consistency-gate` line is `PASS`; the back-propagation journal explains every rewrite. | One matrix per story, all PASS. | BLOCKER |
| **G12** | Every supersession-plan row is realised (ADR body, registry row, no artefact still citing the superseded ADR as source of truth). | All three conditions hold per supersession. | BLOCKER |
| **G14** | No ADR encodes the verdict in the **filename**; the verdict lives in the `Status:` frontmatter. A `Status: Rejected` is admissible only if it traces to a story and names the adopted alternative. | Zero verdict-bearing filename, every rejection traced. | BLOCKER |

### Lens 2 — Architecture compliance

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G3** | Dependency rule: Domain and Application layers depend on neither Infrastructure nor API. | Zero Infrastructure/API import in Domain or Application. | BLOCKER |
| **G4** | All application interfaces (repositories, gateways, publishers) are defined in the Application layer, never in Infrastructure. | Zero infrastructure-defined interface. | BLOCKER |
| **G5** | Each aggregate enforces its own invariants, not another aggregate's. | Zero cross-aggregate invariant. | HIGH |
| **G6** | The context map declares every inter-context relationship with an explicit pattern (ACL, Conformist, Shared Kernel, Partnership, OHS, Published Language) and every label is admissible. | Zero unlabelled arrow, zero inadmissible label. | HIGH |

### Lens 3 — Fitness

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G7** | Every DISCUSS story maps to ≥ 1 trigger (Command or Query) in the event model. | All story IDs appear in a slice. | HIGH |
| **G8** | Every **Command** has at least one corresponding domain event; Queries are exempt. | Zero command without an event. | HIGH |
| **G9** | No aggregate, context, Event Sourcing adoption or Saga is introduced without story justification. | Zero unjustified architectural element. | MEDIUM |
| **G11** | Every ADR adopting a complexity-adding pattern (CQRS, Event Sourcing, Saga, eventual consistency, micro-service split, ACL) cites an admissible force AND evaluates the "do without" option. | Admissible force + "do without" alternative per complexity-adding ADR. | HIGH |
| **G15** | No ADR ratifies a constraint that is the project's **enforced baseline** (method-level CQS, Clean Architecture boundaries, convention-based DI, repository). Deviations and additions remain valid. | Zero `Accepted` ADR restating an enforced baseline. | HIGH |

### Cross-cutting — Escalation

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G13** | Every `decision-drift-*` blocker has a sibling `-resolution.md` file with the human's answer. An open blocker means a human must decide. | A resolution file for every blocker. | BLOCKER (short-circuit) |

> If G13 fails, the reviewer returns `REJECTED` immediately **without** evaluating
> other gates: the next action is human escalation, not a retry.

---

## DISTILL — G1 to G8

Reviewer: `acceptance-designer-reviewer`. 4 lenses. Checks Gherkin scenarios, the
test plan and the implementation plan.

### Lens 1 — Coverage

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G1** | AC↔scenario bijection: every acceptance criterion maps to ≥ 1 scenario, no scenario is orphaned. | All criteria covered, no orphan scenario. | BLOCKER |
| **G2** | Boundary conditions and negative cases from domain examples are represented as scenarios. | ≥ 1 edge case per business rule. | HIGH |

### Lens 2 — Business alignment

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G3** | All vocabulary in Given/When/Then steps belongs to the business lexicon — no class, method, HTTP verb or framework name. | Zero technical identifier in `.feature` files. | HIGH |
| **G4** | Steps contain no implementation detail (HTTP code, ORM term, SQL, DI container). | Zero implementation leak. | BLOCKER |

### Lens 3 — Testability

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G5** | Each step is implementable without asking for clarification: a single meaning in the business vocabulary. | Each step maps to a unique action/state. | HIGH |
| **G6** | Each scenario in the `.feature` files has a matching entry in the implementation plan (file path + use-case boundary). | Bijection scenarios ↔ plan entries. | HIGH |

### Lens 4 — Boundary enforcement

| ID | What the gate checks | Pass condition | Severity |
| --- | --- | --- | --- |
| **G7** | Each coverage-matrix row targets an Application-layer use case named in the contracts — never an Infrastructure adapter as entry point. | Each entry references a use-case boundary. | BLOCKER |
| **G8** | At least one walking skeleton scenario per major flow is identified (tag `@smoke` or marked in the matrix). | ≥ 1 walking skeleton per flow. | HIGH |

---

## DELIVER — G1 to G11

Producer: `software-engineer`; verifier: `quality-gates-lens`. Every gate is attested
by **falsifiable evidence** (git SHA, tool output written to disk) the reviewer
re-resolves without ever re-running the build.

**Every gate below blocks**, on every repository and every work item. The framework
once carried a repo-wide strictness dial that could lower this grid — fewer reviewer
lenses, a smaller mutation threshold, the Gherkin gate switched off. That dial is gone,
and it was also the framework's cost governor: every run now pays the full shape. The
repository owner accepted that trade deliberately — quality is not negotiable.

| ID | What the gate attests | Pass condition |
| --- | --- | --- |
| **G1** | Acceptance test(s) pass. | The active story's BDD scenario is green. |
| **G2** | All unit tests pass. | The full unit suite is green. |
| **G3** | The build passes. | Compilation / type-check succeeded. |
| **G4** | Static analysis passes. | Linter/analyzer reported no blocking issue. |
| **G5** | Architecture rules pass. | Dependency-direction tests (Clean Architecture) pass. |
| **G6** | Mutation score meets the bar. | Both sequenced mutation scripts exited `0`: core first (Domain and Application, 100%), then boundary (API and Infrastructure, 90%). |
| **G7** | No mocks in the Domain/Application core. | Grep-based attestation: zero mock-framework symbol in those layers. |
| **G8** | Conventional commit format. | Every covered commit matches `<type>(<scope>): <subject>`. |
| **G9** | No test tampering (RED→GREEN integrity). | For each cycle, the test file changed only by **addition** between RED and GREEN snapshots. |
| **G10** | RED observed: the test ran and **failed** before the implementation landed. | For each cycle, a RED stdout captured at RED time and hashed by sha256, plus a recorded **non-zero** exit code. |
| **G11** | Line coverage meets the bar. | The coverage runner, invoked with the bar's threshold flags (100% line on Domain and Application), exited `0`. |

> **G6 is an exit code, not a number.** Each `quality-gates-<tech>` adapter bundles two
> sequenced mutation scripts — `mutation-core.sh` then `mutation-boundary.sh` on .NET.
> Each script carries its own expected value and passes it to the runner's `--break-at`,
> so the runner exits non-zero below the bar and **that exit code is the verdict**. Core
> runs first and short-circuits: there is nothing to learn from mutating adapters while
> the domain is unproven. A score read from a report and judged in prose is an opinion
> about a gate, not a gate — and G11 is attested the same way, by the coverage runner's
> own threshold flags.

> A genuinely irrelevant gate is marked `not_applicable` **with a rationale** — never
> as a substitute for `fail` or missing evidence. A gate that *cannot* run — no mutation
> runner installed, no SDK — is `fail`, never `not_applicable`.

---

## Verdict logic

On the four artefact-review phases, the reviewer aggregates gates with a deterministic
rule — no fuzzy weighting:

| Finding | Verdict |
| --- | --- |
| ≥ 1 **BLOCKER** gate failed (or G13 open in DESIGN) | `rejected` |
| ≥ 1 **HIGH** gate, no BLOCKER | `changes_requested` |
| **MEDIUM** gates only | `changes_requested` |
| **LOW** gates only, or everything passes | `approved` |

On DELIVER the rule is flat, because every gate blocks:

| Finding | Verdict |
| --- | --- |
| ≥ 1 gate is `fail` — whichever id | `fail` |
| Log missing or malformed, referenced file unreachable, sha256 or snapshot mismatch | `inconclusive` |
| Every applicable gate is `pass` and every reference resolves | `pass` |

`inconclusive` is never equivalent to `pass`: absence of evidence is not evidence of
success.

## Why this practice

> « A software inspection is a rigorous review with explicit entry and exit criteria. »
> — Wiegers, K., *Peer Reviews in Software*, 2002.

Explicit entry/exit criteria are exactly what a gate materialises: the phase is only
"done" once its gates are crossed.

## Pitfalls & anti-patterns

- **Cosmetic gate**: a criterion too vague ("the code is clean") is not a gate — you
  need a verifiable binary test.
- **Complacent reviewer**: if the producer and the reviewer are the same person, the
  gate loses its power. SKRAFT mandates an *independent* reviewer.
- **Short-circuit**: some gates (e.g. DESIGN G13) short-circuit the whole review if an
  unresolved human blocker remains — do not bypass them.
- **Negotiated bar**: a DELIVER gate cannot be talked down. There is no strictness
  setting, no advisory level and no rationale that grants an exemption — a gate that
  did not pass has not passed.

## Going further

- [The adversarial review lenses](lens.html)
- [Review before review]({{ "/en/explanation/why-review-before-review" | relative_url }})
- [The review-before-review deep dive]({{ "/en/explanation/deep-dive/review-before-review" | relative_url }})

## Sources

- Wiegers, K. *Peer Reviews in Software*, 2002.

Terms to know: **gate**, **reviewer**, **BLOCKER**, **INVEST**, **walking skeleton**
— see the [glossary]({{ "/en/reference/glossary" | relative_url }}).
