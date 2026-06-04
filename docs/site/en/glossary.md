---
layout: doc
lang: en
title: "Glossary"
description: "Every craft term explained plainly: TDD, mutation testing, Object Calisthenics, gate, lens, and more."
---

> 🚧 GENERATED DRAFT — to be reviewed and completed by a human.

# Glossary

> A word you do not understand should not block your reading. This glossary explains every technical term in plain language, with no software craftsmanship background assumed.

<!-- 🚧 To complete: verify and enrich each definition with concrete examples.
     Add missing terms identified while writing other pages.
     Link each term to the catalogue pages that use it. -->

## A

**ADR (Architecture Decision Record)**
A short document that records an architectural decision: the context, the options considered, the chosen decision, and the reasons. Serves as the project's memory.
→ See [Patterns](/en/catalogue/patterns)

**Agent**
In SKRAFT, a specialised AI program that plays a precise role in the pipeline (e.g. `backlog-discoverer`, `solution-architect`). An *executor* agent produces artifacts; a *reviewer* agent emits verdicts.
→ See [Agents](/en/reference/agents/)

**Artifact**
Any file produced by the pipeline: refined stories, ADRs, BDD scenarios, code, test reports. Artifacts constitute the auditable trace of the work.

## B

**Backlog**
A prioritised list of features or User Stories to develop. The backlog is the project's "to-do list".

**BDD (Behaviour-Driven Development)**
A development method where expected behaviours are described in structured natural language (Gherkin: *Given / When / Then*) before writing code. Allows non-developers to understand and validate tests.

## C

**Clean Architecture**
A software architecture style that separates business rules from technical details (databases, frameworks, interfaces). Proposed by Robert C. Martin.
→ See [Patterns](/en/catalogue/patterns)

**Craft (software craftsmanship)**
An approach to software development emphasising quality, best practices, and professionalism. A software craftsperson writes readable, tested, and maintainable code.

**CQS (Command-Query Separation)**
A design principle: a method either modifies state (command) or returns a value (query), never both. In SKRAFT, reviewers are read-only (they are queries, not commands).

**CQRS (Command Query Responsibility Segregation)**
A principle that separates write operations (commands) from read operations (queries) in an application.

## D

**DDD (Domain-Driven Design)**
A design approach centred on the business domain. Code reflects the vocabulary and concepts of the business (*ubiquitous language*). Proposed by Eric Evans.
→ See [Patterns](/en/catalogue/patterns)

## E

**Event Modeling**
A specification technique that describes a system as a sequence of events over time. Facilitates communication between technical and business teams.

**Event Sourcing**
An architectural pattern where the state of a system is reconstructed from a sequence of immutable events, rather than a current state in a database.

## G

**Gate (quality gate)**
A checkpoint between two phases of the SKRAFT pipeline. A gate defines precise criteria that must be met to progress. If criteria are not met, the phase restarts.
→ See [Gates](/en/catalogue/gates)

**Gherkin**
A structured language for writing BDD scenarios: `Given` (context), `When` (action), `Then` (expected result).

## L

**Lens (reviewer lens)**
In SKRAFT, a specialised viewpoint applied during adversarial review. The 4 lenses are: `architecture-boundaries`, `cold-reader`, `quality-gates`, `test-integrity`.
→ See [Lenses](/en/catalogue/lens)

## M

**Mutation testing**
A technique that slightly modifies the source code (introduces "mutants") to verify that tests detect them. A test that does not detect a mutant is a weak test.

## O

**Object Calisthenics**
A set of 9 design rules applied to object-oriented code to enforce structural quality. Example: one level of indentation per method, no getters/setters.

**Outside-In TDD**
A TDD variant where tests start at the outermost level (observable behaviour) and descend to internal details. Also called "London School TDD".
→ See [Skills](/en/reference/skills/)

## P

**Pattern (architecture pattern)**
A proven solution to a recurring problem. SKRAFT patterns (DDD, Clean Architecture, CQRS...) are documented with their original reference.
→ See [Patterns](/en/catalogue/patterns)

**Pipeline**
The sequence of 5 SKRAFT phases: DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER. Each phase has an executor agent, a reviewer, and a gate.
→ See [The pipeline](/en/pipeline/)

## R

**Rework**
Work that must be redone because it did not pass review. SKRAFT aims to reduce rework by filtering defects early in the pipeline.

**Reviewer**
A read-only AI agent that emits a verdict (`APPROVE`, `CONDITIONAL_APPROVE`, `REJECT`) on artifacts produced by an executor agent. A reviewer never modifies artifacts (CQS principle).

## S

**Skill**
In SKRAFT, a tooled practice encapsulated in a `SKILL.md` file. A skill defines what to do, how to do it, and which references justify it.
→ See [Skills](/en/reference/skills/)

**State.json**
A traceability file produced by the SKRAFT pipeline. It contains the history of phases, artifacts, and verdicts for a User Story.

## T

**TDD (Test-Driven Development)**
A method where tests are written *before* code. Cycle: Red (failing test) → Green (minimal code) → Refactor (improvement).

**TTM (Time-to-Market)**
The delay between defining a feature and its availability in production. A key metric for decision-makers.
→ See [For decision-makers](/en/for-executives)

## U

**Ubiquitous Language**
A shared vocabulary between developers and domain experts, used in both conversations and code. A central concept of DDD.

**Use Case**
A description of an interaction between an actor and the system to achieve a goal. In SKRAFT, each pipeline pass treats exactly one Use Case.

**User Story**
A short description of a feature from the user's perspective: "As a [role], I want [action] so that [benefit]."

## V

**Verdict**
The result of a review by a reviewer: `APPROVE` (validated), `CONDITIONAL_APPROVE` (validated with conditions), `REJECT` (to be corrected). A `REJECT` triggers a correction and a new review.

## W

**Walking Skeleton**
The first iteration of a project that cuts through all architecture layers end to end with a minimal feature. Validates the architecture before building the details.

## Sources

<!-- 🚧 To complete: add citations from citations.yml. -->
