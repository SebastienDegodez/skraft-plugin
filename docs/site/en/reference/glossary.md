---
layout: doc
lang: en
title: "Glossary"
description: "Every craft term explained plainly: TDD, mutation testing, Object Calisthenics, gate, lens, and more."
---

# Glossary

> A word you do not understand should not block your reading. This glossary explains every technical term in plain language, with no software craftsmanship background assumed.

## A

**Active pipeline**
The slug written in `.copilot-tracking/skraft-plans/.active-slug`: the run that `skraft status`, `skraft gate` and resume act on. One per working copy (so per worktree); it changes only through an explicit init, never by a guess.
→ See [Active pipeline]({{ "/en/reference/run-journal" | relative_url }})

**ADR (Architecture Decision Record)**
A short document that records an architectural decision: the context, the options considered, the chosen decision, and the reasons. Serves as the project's memory.
→ See [Patterns]({{ "/en/reference/patterns" | relative_url }})

**Agent**
In SKRAFT, a specialised AI program that plays a precise role in the pipeline (e.g. `backlog-discoverer`, `solution-architect`). An *executor* agent produces artifacts; a *reviewer* agent emits verdicts.
→ See [Agents]({{ "/en/dashboard/" | relative_url }})

**Artifact**
Any file produced by the pipeline: refined stories, ADRs, BDD scenarios, code, test reports. Artifacts constitute the auditable trace of the work.

## B

**Base**
A repository's comparison point: `git merge-base HEAD <ref>`, `main` by default. It decides which components changed and replaces `{baseSha}` in commands. Journaled when the run starts.
→ See [Base]({{ "/en/reference/skraft-config" | relative_url }})

**Backlog**
A prioritised list of features or User Stories to develop. The backlog is the project's "to-do list".

**BDD (Behaviour-Driven Development)**
A development method where expected behaviours are described in structured natural language (Gherkin: *Given / When / Then*) before writing code. Allows non-developers to understand and validate tests.

## C

**Component**
A project of the repository (or of a neighbour repository) described in `skraft-config.json`: root, stack, commands. Gates run per component.
→ See [Component]({{ "/en/reference/skraft-config" | relative_url }})

**Clean Architecture**
A software architecture style that separates business rules from technical details (databases, frameworks, interfaces). Proposed by Robert C. Martin.
→ See [Patterns]({{ "/en/reference/patterns" | relative_url }})

**Craft (software craftsmanship)**
An approach to software development emphasising quality, best practices, and professionalism. A software craftsperson writes readable, tested, and maintainable code.

**CQS (Command-Query Separation)**
A design principle: a method either modifies state (command) or returns a value (query), never both. In SKRAFT, reviewers are read-only (they are queries, not commands).

**CQRS (Command Query Responsibility Segregation)**
A principle that separates write operations (commands) from read operations (queries) in an application.

## D

**DDD (Domain-Driven Design)**
A design approach centred on the business domain. Code reflects the vocabulary and concepts of the business (*ubiquitous language*). Proposed by Eric Evans.
→ See [Patterns]({{ "/en/reference/patterns" | relative_url }})

## E

**Engine**
The SKRAFT code that decides every pipeline step (order, expected outputs, retries, gates), the same on every host.
→ See [Engine]({{ "/en/explanation/architecture" | relative_url }})

**Event Modeling**
A specification technique that describes a system as a sequence of events over time. Facilitates communication between technical and business teams.

**Event Sourcing**
An architectural pattern where the state of a system is reconstructed from a sequence of immutable events, rather than a current state in a database.

## F

**Failure class**
What a failed gate is: `environment` (the machine or the config must change: missing program, Docker stopped) or `deterministic` (the command failed: the code must change).
→ See [Failure class]({{ "/en/how-to/run-gates" | relative_url }})

## G

**Gate (quality gate)**
A named command of a component (`build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation`) that the engine runs itself to prove quality. Each gate leaves an evidence file and a `gate.ran` event. Today you run them with `skraft gate`; in lot 3 they become DELIVER steps.
→ See [skraft-config.json]({{ "/en/reference/skraft-config" | relative_url }}); the v1 skill review gates: [Gates (v1)]({{ "/en/reference/gates" | relative_url }})

**Gherkin**
A structured language for writing BDD scenarios: `Given` (context), `When` (action), `Then` (expected result).

## H

**Host driver**
The host-specific part of SKRAFT (Claude Code mod, Copilot CLI workflow) that starts the agents and asks the questions the engine requests, deciding nothing.
→ See [Host driver]({{ "/en/explanation/architecture" | relative_url }})

## J

**Journal (events.jsonl)**
Tracking-folder file where the engine writes one event per line, each line carrying the hash of the previous one. The run state is recomputed from it; a hand edit is detected.
→ See [Journal (events.jsonl)]({{ "/en/reference/run-journal" | relative_url }})

## L

**Lens (reviewer lens)**
In SKRAFT, a specialised viewpoint of the adversarial review, carried by an isolated, read-only agent `<name>-lens`. The host driver starts the lenses of a review node and the engine computes the verdict from their findings. Lenses shipped with the plugin: DESIGN `consistency`, `architecture-compliance`, `fitness`; DISTILL `coverage`, `business-alignment`, `testability`, `boundary-enforcement`; DELIVER `test-integrity`, `architecture-boundaries`, `cold-reader`, `mock-fidelity`, `contract-fidelity` (`quality-gates` is retired in V2: the engine runs the gates itself).
→ See [Lenses]({{ "/en/dashboard/" | relative_url }})

## M

**Microcks**
A tool that simulates the APIs a component depends on, from their contracts; it runs in Docker. It is a component's default mocking (`"mocking": { "strategy": "microcks" }`): the `test`, `architecture`, `coverage` and `mutation` gates then need Docker to answer. `inprocess` does without it.
→ See [Microcks]({{ "/en/reference/skraft-config" | relative_url }})

**Mutation testing**
A technique that slightly modifies the source code (introduces "mutants") to verify that tests detect them. A test that does not detect a mutant is a weak test.

## O

**Object Calisthenics**
A set of 9 design rules applied to object-oriented code to enforce structural quality. Example: one level of indentation per method, no getters/setters.

**Outside-In TDD**
A TDD variant where tests start at the outermost level (observable behaviour) and descend to internal details. Also called "London School TDD".
→ See [Skills]({{ "/en/dashboard/" | relative_url }})

## P

**Pattern (architecture pattern)**
A proven solution to a recurring problem. SKRAFT patterns (DDD, Clean Architecture, CQRS...) are documented with their original reference.
→ See [Patterns]({{ "/en/reference/patterns" | relative_url }})

**Pipeline**
The four phases RESEARCH → DESIGN → DISTILL → DELIVER a story goes through. The engine decides every step and a host driver starts the agents. Today only RESEARCH is driven by the engine; DESIGN, DISTILL and DELIVER come in lot 3. DISCOVER and DISCUSS stay optional product workflows, upstream.
→ See [The pipeline]({{ "/en/explanation/pipeline/" | relative_url }})

## R

**Rework**
Work that must be redone because it did not pass review. SKRAFT aims to reduce rework by filtering defects early in the pipeline.

**Reviewer**
A read-only AI agent that judges the artifacts of an executor agent and never modifies them (CQS principle). In V2, phase reviewers give way to isolated lenses whose findings the engine combines into a verdict.

## S

**Skill**
In SKRAFT, a tooled practice encapsulated in a `SKILL.md` file. A skill defines what to do, how to do it, and which references justify it.
→ See [Skills]({{ "/en/dashboard/" | relative_url }})

**Slug**
The kebab-case name of a pipeline (`checkout-by-card`), picked by the developer. One slug = one pipeline = one `.copilot-tracking/skraft-plans/<slug>/` folder. Neither the engine nor an agent picks it.
→ See [Slug]({{ "/en/reference/run-journal" | relative_url }})

**State.json**
The v1 state file (`.copilot-tracking/skraft-plans/<slug>/state.json`), rewritten on each transition. In V2 it is replaced by the `events.jsonl` journal; `skraft migrate` (lot 11) will convert an in-progress `state.json`.
→ See [Journal (events.jsonl)]({{ "/en/reference/run-journal" | relative_url }})

## T

**TDD (Test-Driven Development)**
A method where tests are written *before* code. Cycle: Red (failing test) → Green (minimal code) → Refactor (improvement).

**TTM (Time-to-Market)**
The delay between defining a feature and its availability in production. A key metric for decision-makers.
→ See [For decision-makers]({{ "/en/explanation/for-executives" | relative_url }})

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

**Walking Skeleton**
The first iteration of a project that cuts through all architecture layers end to end with a minimal feature. Validates the architecture before building the details.

## Sources

The terms in this glossary are defined from their reference works:

- Evans, E. *Domain-Driven Design*, 2003 — DDD, Ubiquitous Language.
- Martin, R. C. *Clean Architecture*, 2017 — Clean Architecture, CQS.
- Beck, K. *Test-Driven Development by Example*, 2003 — TDD.
- Freeman, S. & Pryce, N. *Growing Object-Oriented Software, Guided by Tests*, 2009 — Outside-In TDD, Walking Skeleton.
- Wiegers, K. *Peer Reviews in Software*, 2002 — review.
- Jia, Y. & Harman, M. *An Analysis and Survey of the Development of Mutation Testing*, 2011 — mutation testing.

The full bibliography is on the [Citations]({{ "/en/reference/citations" | relative_url }}) page.
