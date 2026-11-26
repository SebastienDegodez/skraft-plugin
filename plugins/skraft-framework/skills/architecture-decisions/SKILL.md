---
name: architecture-decisions
description: Use when deciding whether a candidate architectural choice deserves an ADR ("should I write an ADR for X?", "how many ADRs does this story need?", "too many ADRs", baseline versus decision), when documenting a decision as an ADR, evaluating trade-offs between alternatives, or managing the lifecycle of existing decisions. Covers the eligibility gate, ADR template, status transitions, consequence analysis, and quality criteria. Not for choosing which pattern to adopt (architecture-patterns).
---

# Architecture Decisions

## Overview

Architecture Decision Records (ADRs) are lightweight documents that capture architectural decisions together with their context, alternatives considered, and consequences. They are the institutional memory of the architecture.

**Purpose:** An ADR answers the question: "Why does the architecture look the way it does?" Future readers — including future you — should be able to understand any structural decision without needing to ask the original author.

**Core rule:** One ADR per decision. A decision is a single, clear choice with trade-offs. Zero ADRs is the normal outcome of a pass: what the team imposed or the project documents already state is written there, not in an ADR.

---

## ADR Template

Read [references/adr-template.md](references/adr-template.md) before writing or rewriting an ADR, never from memory: the Blank Template, the file naming rules, the row of the decision index, the ADR Quality Checklist and filled examples.

Every ADR opens with the YAML header of that template, before its `# ADR-{NNN}` title: `adr`, `title`, `status`, `chosen`, `decision` (one sentence), `supersedes`, `date`, `ratified_by`. Its body holds Context with the ranked decision drivers, Decision, Consequences, Alternatives Rejected and Confirmation.

---

## Status and Lifecycle

```
Proposed → Accepted → Deprecated
         │          ↘ Superseded by ADR-{NNN}
         ↘ Rejected   (terminal)
```

- **Proposed:** Decision is drafted and awaiting human ratification. A draft, not a record: rewrite it in place when a review or a story asks for a change; delete it when a human refuses it (see *A draft the human refuses*)
- **Accepted:** Option was evaluated and adopted — the architecture reflects it
- **Rejected:** Option was evaluated and explicitly declined — the ADR records the analysis so the debate is not re-run later without new evidence. Terminal: a `Rejected` ADR never becomes `Deprecated` or `Superseded`
- **Deprecated:** An `Accepted` decision is no longer relevant (e.g., the feature was removed), but was never superseded
- **Superseded:** An `Accepted` decision has been replaced by a newer one — always reference the successor
- A partial replacement is a new ADR that `amends` the old one, never a status variant such as `Superseded (partial)`.

**Linking rule:** When ADR-002 supersedes ADR-001:
- ADR-001 status: `Superseded by ADR-002`
- ADR-002 names ADR-001 on its `**Supersedes:**` line (or `**Amends:**` for a partial replacement) and its `supersedes:` (or `amends:`) header field, nowhere else. Its Context and Decision state its own decision without restating or citing ADR-001.
- No ADR cites any other ADR, by `ADR-NNN`, link or `docs/adr/` path: any ADR may be superseded, so the reference goes stale.

**No ADR on the default branch is ever deleted.** The historical record of why a decision was made is as valuable as the decision itself.

**A draft the human refuses** is not a decision: delete its file and its row in `docs/adr/decisions-index.md`, renumber the remaining `Proposed` drafts of the pass so no number is skipped, and write the choice in place in its `Destination`. Never redraft it, never split it into other ADRs, never write another ADR on the same subject.

**Which ADR is immutable — read its header `status`:**

| Status | Change its decision by |
|---|---|
| `Proposed` (`ratified_by: null`), not yet on the default branch | Rewriting it in place: content, header and index row. It stays `Proposed`; the human ratifies the new text. Never supersede or amend it, and never give it `amended_by`, `amended_in_place`, `superseded_by` or a history section; git keeps the drafts. |
| `Proposed`, already on the default branch | A new ADR that supersedes or amends it. Only its status lines change; the engine refuses any other change. |
| `Accepted` | A new ADR that supersedes it (linking rule above). Its body and decision never change; its status moves only to `Superseded by ADR-NNN` or `Deprecated`, never back to `Proposed` nor to `Rejected`. |
| `Rejected`, `Deprecated`, `Superseded` | Nothing: terminal, the status stays. A new question gets a new ADR. |

One exception: when the run's feedback says an ADR is not on the default branch yet, it is still a draft of the pull request whatever its status — edit it in place and set it back to `Proposed`.

A conflict no in-place rewrite of a `Proposed` ADR settles is a question for the human: stop and report it through the execution context's channel (in a skraft run, a blocked result whose summary holds the question and its options). Never write a file for the human to answer in.

### Human-in-the-loop ratification

The `Proposed → Accepted | Rejected` transition is owned by a human, not the agent. The ratification channel is supplied by the execution context (the skraft engine's question in a pipeline run, an in-terminal prompt in a local run).

**Both transitions are committed:** the `Proposed` revision AND the final `Accepted` / `Rejected` revision land in git history. The trail of "we paused here for a human" is part of the architectural record.

### Rejected ADRs

A `Rejected` ADR documents that an option was seriously evaluated and the team decided NOT to adopt it. The ADR exists so the same debate is not re-opened in six months without new evidence.

- **Filename:** named after the SUBJECT — `adr-NNN-event-sourcing.md`, NEVER `adr-NNN-event-sourcing-rejected.md`. The verdict lives in `Status:`, not in the filename.
- **Decision phrasing:** MAY start with "We will not adopt X because…" — this is precisely what a `Rejected` status means.
- **Trigger requirement:** a `Rejected` ADR is written ONLY when a story or measurable force in the current batch raised the question (Eligibility Gate, Q4). A `Rejected` ADR with no triggering story is a non-decision artefact and is forbidden.
- **Alternatives Rejected section** is flipped: list what the team adopted INSTEAD (e.g., "state-based persistence with audit-log table").

---

## Decision Digest — cheap-to-read verdict surface

The full ADR body is the *rationale*. No reader (the ratification question, the reviewer, DISTILL, the architect on a new pass) should re-read a whole ADR body just to learn its **verdict**. The digest is the stable, cheap-to-read surface that carries only the verdict-bearing fields. It exists in two mirrored forms.

### Per-ADR decision header

Every ADR file begins with the YAML frontmatter of the Blank Template, **before** the `# ADR-{NNN}` title. A reader reads ONLY this frontmatter (the first ~10 lines) to obtain `status`, `chosen`, and the one-line `decision`. Load the prose body solely when the *rationale* is needed (e.g. re-evaluating a supersession). Keep the header free of dynamic noise — no timestamps beyond `date`, no per-run paths — so it stays a stable prefix.

### Project-global decision index — `docs/adr/decisions-index.md`

An append-only registry, sibling of `docs/adr/supersessions.md`. One row per ADR aggregates the header fields. One read of this file yields every decision in the project without opening a single ADR body.

Its header row and an example: [references/adr-template.md](references/adr-template.md).

Write rule: when an ADR is first committed (`Status: Proposed`), append its row with `Ratified by: —`. On the ratification status flip, update **only** the `Status` and `Ratified by` cells of that row in place — once the ADR is `Accepted`, the row is never removed and never reordered (numbering stays monotonic, matching the supersession-registry doctrine); while it is `Proposed`, edit the row in place with its ADR.

### Reading the digest cheaply

Read the verdict, never the body. Prefer, in order:

1. **Whole project at once** — read `docs/adr/decisions-index.md` (one small file = every decision).
2. **One ADR's verdict** — search `docs/adr/decisions-index.md` for the line starting with `| 007 `.
3. **One ADR's header** — read only the first ~12 lines of the ADR file: the YAML frontmatter ends at the second `---`, so `status`, `chosen` and `decision` are there.

---

## Ratification Contract (single source of the human gate)

This is the canonical definition of the `Proposed -> Accepted | Rejected` gate.

1. **Agent drafts, human decides.** The agent commits every story-triggered ADR with `Status: Proposed` and appends its digest row. The agent NEVER self-ratifies — it cannot set `Accepted` / `Rejected` on its own authority.
2. **Gate fires after quality review, not before.** Ratification is requested only once the DESIGN reviewer has APPROVED the artefacts. Asking a human to ratify a draft that may fail adversarial review wastes their attention and trains rubber-stamping.
3. **The gate is a hard pre-condition for the next phase.** No downstream phase (DISTILL) may begin while any ADR in the current pass is still `Proposed`. Advancing without the verdict is a post-hoc checkpoint — the decision would already be in effect before the human chose.
4. **The verdict surface is the digest.** The gate presents the decision index / headers (the one-line decisions), NOT the full ADR bodies. The human may open a body on demand via the link.
5. **Both revisions land in git.** The `Proposed` commit AND the final `Accepted` / `Rejected` commit are both committed — the trail of "we paused for a human here" is part of the architectural record. On the flip, set `ratified_by` in the header and update the index row.
6. **Channel is supplied by the execution context.** In the skraft pipeline the engine asks the human after DESIGN and, on ratification, sets `Accepted`, `ratified_by` and the index row itself and commits them; the agent never writes these. In a standalone local run, prompt the developer in-terminal. This skill prescribes the contract, not the transport.

---

## Eligibility Gate — before drafting any ADR

Run the gate on every candidate choice before writing an ADR body, none excepted: no kind of choice skips it. Every candidate starts `NOT ELIGIBLE`; it becomes `ELIGIBLE` only when it passes every question. Answer the questions in order; the first one that settles the verdict ends the gate.

ADRs record **additions** and **deviations** from the project baseline. The baseline itself is never an ADR: the conventions enforced by project skills and architecture tests, and everything the project's documents or its `Accepted` ADRs already decide, whether or not a test enforces it.

### Q0 — Is the choice already decided?

Search `ARCHITECTURE.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/architecture/` (the context map and each context's tactical design) and the `Accepted` ADRs of `docs/adr/decisions-index.md`. A choice they state, under any wording, is decided: its bounded contexts, their relationships, a module per context, a rule written but not yet tested.

YES → `NOT ELIGIBLE — documented in <path>:<line>`. Cite the line; the choice stays where it is written, or is completed there.

### Q0b — Is the choice imposed?

Imposed by the team, the PRD, the platform or an earlier decision: a front-end stack, an end-to-end test tool, how static resources are served, a build plugin, a hosting target.

YES → `NOT ELIGIBLE — constraint`. Destination: `ARCHITECTURE.md`, `CONTRIBUTING.md` or `AGENTS.md`.

### Q1 — Is the choice already enforced by a project skill or an automated architecture test?

Baseline examples: pure domain service with no IO (Clean Architecture layering, `clean-architecture-*` skill and architecture tests); CQS at method level, one handler per command or query; validation at the boundary with a pure core; convention-based DI registration; Value Object with a pure validator (tactical DDD); the repository pattern and where a repository interface lives, Domain or Application (`clean-architecture-*` skill).

YES → `NOT ELIGIBLE — <skill or test that already enforces it>`.

### Q1b — Is it a project principle, convention or procedure?

These belong in `ARCHITECTURE.md`, `CONTRIBUTING.md` or `AGENTS.md`, never in an ADR: where a kind of file lives (static resources, message files, tests), test naming and which build phase runs a test, the install command of a local tool, CI rules (pinned actions, runner), toolchain and version policy, a module responsibility, a rule such as "no business logic in the entry point". The usual layout is `AGENTS.md` linking `@ARCHITECTURE.md` (modules, dependency direction, targets) and `@CONTRIBUTING.md` (setup, validation commands, pull request rules).

YES → `NOT ELIGIBLE — documentation: <file> § <section>`. The architect writes it in place in that file; never as an ADR section, and never as a review finding that sends it into an ADR. An ADR cites those files for the principles it respects and records only the trade-off between alternatives. A story that contradicts them is a blocked result for the human, not an ADR. An ADR that mixes an eligible decision with a baseline one (an aggregate boundary plus where its repository interface lives) keeps the eligible decision only: delete the baseline part, never move it to a new ADR.

### Q2 — Is the choice framed as a good practice or as avoiding an antipattern?

Examples: "no hardcoded phase names", "don't duplicate validation logic", "avoid magic strings".

YES → `NOT ELIGIBLE — baseline good practice / antipattern avoidance`. Reframing it as a context-mapping relationship ("config as Published Language, guard as Conformist") changes nothing: a relationship goes to `docs/architecture/context-map.md` (Q3).

### Q3 — Is the choice costly to undo and does it reach beyond one bounded context?

Both must hold. Costly to undo: reversing it means migrating data, rewriting several modules or renegotiating a contract. Beyond one context: it binds several bounded contexts, modules, deployables or teams. It does when it:
- establishes or changes a layer boundary for the whole application
- chooses an aggregate boundary that crosses an existing context boundary
- **adopts** a pattern that adds complexity across contexts: CQRS+Bus, Event Sourcing, Saga
- chooses a physical isolation for a bounded context that departs from the baseline (a module or service per context instead of packages) or a coupling mechanism between contexts (an event instead of a read of a published snapshot)
- affects a cross-cutting concern (error handling strategy, validation approach, transaction boundary)

Domain design is never an ADR: the bounded contexts, their Core/Supporting/Generic type and their relationships (Anti-Corruption Layer, Conformist, Published Language, Open Host Service, Shared Kernel) go to `docs/architecture/context-map.md`.

A choice confined to one bounded context → `NOT ELIGIBLE — local design`. Destination: `docs/architecture/{bounded-context}.md`. An aggregate inside the context, an Anti-Corruption Layer or translation inside its gateway, a mapping, a local type, a Specification.

NO → `NOT ELIGIBLE — no complexity addition beyond baseline`. Implementation details (naming, formatting), configuration choices (connection string format, environment variable names) and library versions without architectural impact land here; switching EF Core to Dapper does not, it changes the data access strategy. So do: a front-end stack; an end-to-end test tool; how static resources are served; a build plugin; where a UI component is placed or mounted; a route tree; a member added to an existing enum or vocabulary; page state or URL parameters wiring; a library inside an adopted framework, unless it imposes a layer boundary or a data-loading model — then the ADR records that constraint, not the library's use.

### Q4 — Did a story, an AC or a measurable force in the current batch raise the question?

Silence = baseline default. An AC requires evaluating the choice, the event model surfaced it as a decision point, or a technical constraint (performance, security, integration) forced it.

NO → `NOT ELIGIBLE — unraised question; non-decision artefact (G14)`. A `Rejected` ADR follows the same rule.

A choice argued from a future need fails Q4 too: "identical today but may diverge", "in case a second consumer appears", "ready for scale". Today's stories raise today's questions → `NOT ELIGIBLE — anticipation`.

### Q5 — Does the choice have genuine trade-offs?

Score it against the 5 Universal Forces: Simplicity, Consistency, Performance, Evolvability, Team capability. Read [references/decision-drivers.md](references/decision-drivers.md) for the question each force asks, the scoring table to put in Context when the decision is hard, and the signs of an analysis that is not genuine: no ADR has only upsides.

Fewer than two alternatives genuinely possible → `NON-DECISION`. High on all five → `NOT ELIGIBLE — no genuine trade-offs; should be baseline`. Tension between at least two forces → `ELIGIBLE — genuine trade-off`.

### Gate output

One block per candidate:

```
Candidate: Fail-closed posture for dispatch gate
Verdict: ELIGIBLE
Reason: Q0 NO, Q0b NO, Q1 NO, Q2 NO, Q3 YES (cross-cutting error strategy), Q4 YES (AC-04), Q5 YES (over-blocking vs silent drift)
Destination: docs/adr/adr-004-fail-closed-dispatch.md

Candidate: VO + validation at boundary
Verdict: NOT ELIGIBLE
Reason: Q1 YES — Clean Architecture layering + tactical DDD enforce this
Destination: ARCHITECTURE.md § Modules (already stated)

Candidate: No hardcoded phase names
Verdict: NOT ELIGIBLE (as framed)
Reason: Q2 YES — "no hardcoding" is a good practice, not a decision

Candidate: Four bounded contexts, one package each in the existing modules
Verdict: NOT ELIGIBLE
Reason: Q0 YES — documented in ARCHITECTURE.md:24 and docs/architecture/context-map.md:8
Destination: docs/architecture/context-map.md (already stated)

Candidate: Anti-Corruption Layer translating the upstream submission into local types
Verdict: NOT ELIGIBLE
Reason: Q3 — local design: the translation sits in one context's gateway
Destination: docs/architecture/proposal.md § Gateways

Candidate: Separate local types because the two shapes "may diverge"
Verdict: NOT ELIGIBLE
Reason: Q4 — anticipation: the shapes are identical today and no story asks them to differ
Destination: none; reuse the upstream shape
```

### Drafting an ELIGIBLE candidate

1. Before any option, rank the decision drivers in Context: the forces, quality attributes and constraints this choice serves, most important first.
2. Judge each option against those drivers, in their order; the reason an alternative is rejected names the driver it loses on.
3. Each row of `Alternatives Rejected` is an approach the research document evaluated, or says why it is new to it.
4. `## Confirmation` names the architecture test, rule or fitness check that proves the decision holds, by what it checks, never by its file; "None possible, because …" when none can, never left out.
5. Before the final ADR, check it against the ADR Quality Checklist of [references/adr-template.md](references/adr-template.md).

Every candidate carries a `Destination: <document> § <section>`; a `NOT ELIGIBLE` choice is written in place there. Write an ADR only for an `ELIGIBLE` candidate. Gate failures map to review findings: DOC-AS-ADR (Q0, Q0b, Q1b), ADR-INFLATION (Q1, Q3), GOOD-PRACTICE ADR (Q2), BASELINE DRIFT (Q1 + Q3), UNRAISED QUESTION (Q4), NON-DECISION (Q5).

---

## References

- [adr-template.md](references/adr-template.md) — Blank Template, file naming, decision index row, ADR Quality Checklist, filled auto-insurance examples, each with its YAML header
- [decision-drivers.md](references/decision-drivers.md) — the 5 Universal Forces, trade-off analysis table, decision scenarios, red flags
