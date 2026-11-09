---
title: "Glossary"
description: "Every craft term explained plainly: TDD, mutation testing, Object Calisthenics, gate, lens, and more."
---

# Glossary

A word you do not understand should not block your reading. This glossary explains every technical term in plain language, with no software craftsmanship background assumed.

## A

**Active pipeline**
The slug written in `.copilot-tracking/skraft-plans/.active-slug`: the run that `skraft status`, `skraft gate` and resume act on. One per working copy (so per worktree); it changes only through an explicit init, never by a guess.
→ See [Active pipeline](./run-journal.md)

**ADR (Architecture Decision Record)**
A short document that records an architectural decision: the context, the options considered, the chosen decision, and the reasons. Serves as the project's memory.
→ See [Patterns](./patterns.md)

**Ask node**
A workflow node of shape `hexagon` that puts a question to a human (`question="adr-ratification"`, `"scenario-review"`, `"mutation-plan"`). Its outgoing edges are labelled with the answers; a refusal (`REJECTED`, `REVISE`) leads back to the node whose work it refuses.
→ See [Answer a run's question](../how-to/answer-a-question.mdx)

**Agent**
In SKRAFT, a specialised AI program that plays a precise role in the pipeline (e.g. `backlog-discoverer`, `solution-architect`). An *executor* agent produces artifacts; a *reviewer* agent emits verdicts.
→ See [Agents](pathname:///dashboard/)

**Artifact**
Any file produced by the pipeline: refined stories, ADRs, BDD scenarios, code, test reports. Artifacts constitute the auditable trace of the work.

## B

**Base**
A repository's comparison point: `git merge-base HEAD <ref>`, `main` by default. It decides which components changed and replaces `{baseSha}` in commands. Journaled when the run starts.
→ See [Base](./skraft-config.md)

**Backlog**
A prioritised list of features or User Stories to develop. The backlog is the project's "to-do list".

**BDD (Behaviour-Driven Development)**
A development method where expected behaviours are described in structured natural language (Gherkin: *Given / When / Then*) before writing code. Allows non-developers to understand and validate tests.

## C

**Component**
A project of the repository (or of a neighbour repository) described in `skraft-config.json`: root, stack, commands. Gates run per component.
→ See [Component](./skraft-config.md)

**Clean Architecture**
A software architecture style that separates business rules from technical details (databases, frameworks, interfaces). Proposed by Robert C. Martin.
→ See [Patterns](./patterns.md)

**Craft (software craftsmanship)**
An approach to software development emphasising quality, best practices, and professionalism. A software craftsperson writes readable, tested, and maintainable code.

**Contract testing**
Checking that an API provider honours the contract its consumers expect, without an end-to-end test. Turned on per component in `skraft-config.json`.
→ See [Contract testing](../explanation/deep-dive/contract-testing.md)

**CQS (Command-Query Separation)**
A design principle: a method either modifies state (command) or returns a value (query), never both. In SKRAFT, reviewers are read-only (they are queries, not commands).

**CQRS (Command Query Responsibility Segregation)**
A principle that separates write operations (commands) from read operations (queries) in an application.

## D

**DDD (Domain-Driven Design)**
A design approach centred on the business domain. Code reflects the vocabulary and concepts of the business (*ubiquitous language*). Proposed by Eric Evans.
→ See [Patterns](./patterns.md)

**Dissent Rule**
A review rule: when only one lens finds what would send the work back and the others passed, `finding-refuter` judges its findings with every input of the review before they count.
→ See [Review before review](../explanation/deep-dive/review-before-review.md)

**DoR (Definition of Ready)**
An eight-item checklist a story must pass before entering engineering: problem, specific persona, domain examples, scenarios, criteria derived from the examples, size, technical notes, dependencies.
→ See [The backlog](../explanation/backlog.md)

## E

**Engine**
The SKRAFT code that decides every pipeline step (order, expected outputs, retries, gates), the same on every host.
→ See [Engine](../explanation/architecture.md)

**Environment question**
The question the engine asks when a step cannot run on the machine or with what `skraft-config.json` gives it (program not found, Git failing, no Docker or Podman answering a replay, a command stopped by a signal or crashed). It names the cause (the machine, `skraft-config.json`, or none the engine knows) and the log of the failing command. `RETRY` runs the same step again where it stopped, using no new attempt; `ABORT` blocks the run.
→ See [The environment question](./run-journal.md#environment-question)

**Event Modeling**
A specification technique that describes a system as a sequence of events over time. Facilitates communication between technical and business teams.

**Event Sourcing**
An architectural pattern where the state of a system is reconstructed from a sequence of immutable events, rather than a current state in a database.

## F

**Failure class**
What a failed gate is: `environment` (the machine or the config must change: missing program, program stopped), `unknown` (the command was stopped by a signal or crashed: a human reads its log) or `deterministic` (the command failed: the code must change).
→ See [Failure class](../how-to/run-gates.md)

**Failure signature**
Eight hexadecimal digits that name a failure once what varies between tries is taken out (times, durations, processes, ports, shas, temporary folders, attempt numbers, the working copy). An agent failing the same way on its last two attempts, or a node failing the same way 3 times since it last passed, is not sent the work back again.
→ See [Tracking folder and journal](./run-journal.md#events)

**Finding**
A defect a lens reports: the gate concerned, a severity (`blocker`, `high`, `medium`, `low`), a location and a description. Only `blocker`, `high` and `medium` findings that stand send the work back.
→ See [Gates](./gates.md#lens-answer)

## G

**Gate (quality gate)**
A named command of a component (`build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation`) that the engine runs itself to prove quality. Each gate leaves an evidence file and a `gate.ran` event. The engine runs them in DELIVER (the locked `gates` and `mutation` nodes); `skraft gate` runs them by hand.
→ See [skraft-config.json](./skraft-config.md); the lenses' review criteria: [Gates](./gates.md)

**Gherkin**
A structured language for writing BDD scenarios: `Given` (context), `When` (action), `Then` (expected result).

## H

**Host driver**
The host-specific part of SKRAFT (Claude Code mod, Copilot CLI workflow, Copilot SDK under VS Code, the `skraft next` / `skraft record` agent loop) that starts the agents and asks the questions the engine requests, deciding nothing.
→ See [Host driver](../explanation/architecture.md)

**HVE Core**
The set of agents, instructions and skills for GitHub Copilot published by Microsoft (`microsoft/hve-core`), on which SKRAFT was built. SKRAFT keeps its `.copilot-tracking/` tracking folder.
→ See [The event journal](../explanation/event-journal.md)

## I

**Infrastructure policy**
What a component's tests run each kind of dependency on, in a targeted scenario and in the walking skeleton: entry point in process / real, internal gateway in memory / Testcontainers, external gateway Microcks (the component's `mocking.strategy`), clock and randomness fake; for a React front end, MSW in targeted tests and Microcks in Playwright e2e. Plugin defaults per stack, overridden per component (`infrastructure`) in `skraft-config.json` only.
→ See [skraft-config.json](./skraft-config.md#infrastructure)

**INVEST**
The six qualities of a good story: independent, negotiable, valuable, estimable, small, testable (Wake, 2003).
→ See [The backlog](../explanation/backlog.md)

## J

**Journal (events.jsonl)**
Tracking-folder file where the engine writes one event per line, each line carrying the hash of the previous one. The run state is recomputed from it; a hand edit is detected.
→ See [Journal (events.jsonl)](./run-journal.md)

## L

**Lens (reviewer lens)**
In SKRAFT, a specialised viewpoint of the adversarial review, carried by an isolated, read-only agent `<name>-lens`. The host driver starts the lenses of a review node and the engine computes the verdict from their findings. Lenses shipped with the plugin: DESIGN `consistency`, `architecture-compliance`, `fitness`; DISTILL `coverage`, `business-alignment`, `testability`, `boundary-enforcement`; DELIVER `test-integrity`, `architecture-boundaries`, `cold-reader`, `mock-fidelity`, `contract-fidelity` (`quality-gates` is retired in V2: the engine runs the gates itself).
→ See [Lenses](pathname:///dashboard/)

## M

**Microcks**
A tool that simulates the APIs a component depends on, from their contracts; its tests start it through Testcontainers (uber native image, one container per test session), on Docker or Podman. It is the default mocking of every stack but React (`"mocking": { "strategy": "microcks" }`): the tests that use it then need Docker or Podman running, and a replay without either is INDETERMINATE, never skipped. `inprocess` does without it.
→ See [Microcks](./skraft-config.md)

**MoSCoW**
*Must*, *Should*, *Could*, *Won't* prioritisation used by triage and the story map.

**Mutation testing**
A technique that slightly modifies the source code (introduces "mutants") to verify that tests detect them. A test that does not detect a mutant is a weak test.

## O

**Object Calisthenics**
A set of 9 design rules applied to object-oriented code to enforce structural quality. Example: one level of indentation per method, no getters/setters.

**Outside-In TDD**
A TDD variant where tests start at the outermost level (observable behaviour) and descend to internal details. Also called "London School TDD".
→ See [Skills](pathname:///dashboard/)

## P

**Pattern (architecture pattern)**
A proven solution to a recurring problem. SKRAFT patterns (DDD, Clean Architecture, CQRS...) are documented with their original reference.
→ See [Patterns](./patterns.md)

**Pipeline**
The four phases RESEARCH → DESIGN → DISTILL → DELIVER a story goes through. The engine decides every step and a host driver starts the agents. DISCOVER and DISCUSS stay optional product workflows, upstream.
→ See [The pipeline](../explanation/pipeline/index.mdx)

## Q

**Quality bar**
The thresholds the `skraft-quality-bar` skill sets for every repository: 100 % mutation score and line coverage on Domain and Application, 80 % mutation score on API and Infrastructure. No configuration lowers them.
→ See [Software craftsmanship](../explanation/software-craftsmanship.md)

## R

**Ratification (ADR)**
A human's acceptance of the ADRs DESIGN proposed. Only the engine sets an ADR to `Accepted`, after a human answers `RATIFIED`; `REJECTED` sends DESIGN back with the reason.
→ See [Tracking folder and journal](./run-journal.md)

**Rework**
Work that must be redone because it did not pass review. SKRAFT aims to reduce rework by filtering defects early in the pipeline.

**Refuter (`finding-refuter`)**
The agent that checks a `blocker`, `high` or `medium` finding by reading the cited location: `confirmed`, `refuted` (citing the line read) or `unverifiable`. A refuted finding does not count.
→ See [Gates](./gates.md#refutation)

**Reviewer**
A read-only AI agent that judges the artifacts of an executor agent and never modifies them (CQS principle). In V2, phase reviewers give way to isolated lenses whose findings the engine combines into a verdict.

**Run report**
`run-report.md`, rewritten from the journal after each step: time, cost and retries of each step, the question the run waits on, each commit checked and its verdict, the failures sent back to an agent, the incidents asked of a human.
→ See [Run report](./run-journal.md#run-report)

## S

**Scenario review**
The question (`scenario-review`) a human answers once the DISTILL review approves: it names the story's scenarios in the order DELIVER builds them and S1's failing acceptance test. `APPROVED` delivers them one at a time; `REVISE` sends DISTILL back with the corrections.
→ See [Answer a run's question](../how-to/answer-a-question.mdx)

**Skill**
In SKRAFT, a tooled practice encapsulated in a `SKILL.md` file. A skill defines what to do, how to do it, and which references justify it.
→ See [Skills](pathname:///dashboard/)

**Slug**
The kebab-case name of a pipeline (`checkout-by-card`), picked by the developer. One slug = one pipeline = one `.copilot-tracking/skraft-plans/<slug>/` folder. Neither the engine nor an agent picks it.
→ See [Slug](./run-journal.md)

**State.json**
The v1 state file (`.copilot-tracking/skraft-plans/<slug>/state.json`), rewritten on each transition. In V2 it is replaced by the `events.jsonl` journal; `skraft migrate` converts an in-progress `state.json` into one.
→ See [Journal (events.jsonl)](./run-journal.md)

**Surviving mutant**
A change to the code the tests do not catch. It ends one of three ways: a test that kills it, the code deleted, or the mutant declared equivalent. In DELIVER the agent proposes and the developer chooses (`mutation-plan` question).
→ See [DELIVER](../explanation/pipeline/deliver.mdx)

## T

**TDD (Test-Driven Development)**
A method where tests are written *before* code. Cycle: Red (failing test) → Green (minimal code) → Refactor (improvement).

**Triage**
Classifying an issue — type, priority, effort in points — and spotting its duplicates, before choosing what enters a sprint.
→ See [DISCOVER](../explanation/pipeline/discover.md)

**TTM (Time-to-Market)**
The delay between defining a feature and its availability in production. A key metric for decision-makers.
→ See [For decision-makers](../explanation/for-executives.md)

## U

**Ubiquitous Language**
A shared vocabulary between developers and domain experts, used in both conversations and code. A central concept of DDD.

**Use Case**
A description of an interaction between an actor and the system to achieve a goal. In SKRAFT, each pipeline pass treats exactly one Use Case.

**User Story**
A short description of a feature from the user's perspective: "As a [role], I want [action] so that [benefit]."

## V

**Verdict**
The result of a review. In V2 the engine computes it from the lenses' typed findings: `APPROVED` or `NEEDS_REWORK` (the agent is started again with the findings). A `NEEDS_REWORK` on a review node with no `NEEDS_REWORK` edge stops the run with the code `review-rejected`. v1 used `APPROVE`, `CONDITIONAL_APPROVE` and `REJECT`.

## W

**Waiting (run)**
The status of a run whose question has no answer yet. The run does nothing more (fail closed) until a human answers with `skraft decide`, `/skraft decide` or `skraft_decide`; starting it again asks the same question.
→ See [Resume or unblock a run](../how-to/resume-a-run.mdx)

**Walking Skeleton**
The first iteration of a project that cuts through all architecture layers end to end with a minimal feature. Validates the architecture before building the details. In SKRAFT, scenario S1 of each story, tagged `@walking-skeleton`, in a back-end component: entry point → use case → real database. A story with no new entry point declares an exemption instead (`library`, `refactoring`, `docs-only`).
→ See [Walking Skeleton](../explanation/deep-dive/walking-skeleton.md)

## Sources

The terms in this glossary are defined from their reference works:

- Evans, E. *Domain-Driven Design*, 2003 — DDD, Ubiquitous Language.
- Martin, R. C. *Clean Architecture*, 2017 — Clean Architecture, CQS.
- Beck, K. *Test-Driven Development by Example*, 2003 — TDD.
- Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009 — Outside-In TDD, Walking Skeleton.
- Wiegers, K. *Peer Reviews in Software*, 2002 — review.
- Jia, Y. & Harman, M. *An Analysis and Survey of the Development of Mutation Testing*, 2011 — mutation testing.
- Wake, B. *INVEST in Good Stories, and SMART Tasks*, 2003 — INVEST.

The full bibliography is on the [Citations](./citations.mdx) page.

## See also <!-- #see-also -->

- [Bibliography](./citations.mdx)
- [Architecture patterns](./patterns.md)
- [Gates](./gates.md)
- [Software craftsmanship — why skraft makes it a rule](../explanation/software-craftsmanship.md)
