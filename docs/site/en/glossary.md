---
layout: doc
lang: en
title: "Glossary"
description: "SKRAFT global glossary: every craft term explained plainly — TDD, mutation testing, Object Calisthenics, gate, lens..."
---

> 🚧 GENERATED DRAFT — to be reviewed and completed by a human.

# Glossary

> All technical terms used in SKRAFT, explained without assuming software-craftsmanship mastery. Each definition notes where the term is used in the pipeline.

## A

**ADR** (Architecture Decision Record)
: A short document that records an architecture decision: the context, the options considered, the decision made and why. Produced during the DESIGN phase. Makes it possible to understand *why* code is written a certain way, not just *how*.

**Agent**
: In SKRAFT, an agent is a specialised AI program that plays a precise role in the pipeline (executor or reviewer). Each agent has a clear contract: what it receives, what it produces.

## B

**BDD** (Behaviour-Driven Development)
: A technique for writing usage scenarios for software *before* coding, in language understandable by everyone (Gherkin: `Given / When / Then`). Produced during the DISCUSS phase.

## C

**CQS** (Command-Query Separation)
: A design principle: a function either performs an action (command, modifies state) or asks a question (query, reads state), never both. SKRAFT reviewers respect CQS: they read but never modify.

**CQRS** (Command-Query Responsibility Segregation)
: An architectural extension of CQS: write and read flows are handled by separate components.

## D

**DDD** (Domain-Driven Design)
: A software development approach that places the *business domain* at the centre. Code reflects business vocabulary and rules. Reference: Evans, E., *Domain-Driven Design*, 2003.

## E

**Event Modeling**
: A modelling technique that represents a system as a sequence of events over time. Used during the DISCOVER phase to align everyone on what happens in the system.

**Event Sourcing**
: An architecture pattern where system state is reconstructed from a sequence of historical events, rather than stored directly.

## G

**Gate (Gxx)**
: A control checkpoint in the SKRAFT pipeline. Each phase has its gates: if a gate fails, the artifact is rejected and the cycle restarts. *Gxx* denotes a numbered gate (G01, G02...).

**Gherkin**
: A scenario description language for BDD, readable by non-developers. Structure: `Given` (context) / `When` (action) / `Then` (expected result).

## L

**Lens**
: In SKRAFT, a lens is a specialised viewpoint applied by the reviewer. There are four: architecture-boundaries, cold-reader, quality-gates, test-integrity.

## M

**Mutation Testing**
: A technique for evaluating test quality by intentionally introducing errors (*mutations*) into code and checking that tests catch them. A test that misses mutations proves nothing. Reference: Jia & Harman, 2011.

## O

**Object Calisthenics**
: A set of 9 design rules applied to business code to enforce high structural quality (no `else`, single level of indentation, etc.). Reference: Bay, J., 2008.

**Outside-In TDD**
: A TDD variant that starts with tests for observable behaviour (outer interface) and descends toward internal details. Reference: Freeman & Pryce, *Growing Object-Oriented Software, Guided by Tests*, 2009.

## P

**SKRAFT Pipeline**
: The 5-phase sequence DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER, with a reviewer per phase and control gates.

## R

**Reviewer**
: A read-only AI agent whose role is to validate or reject the artifact produced by the executor of the same phase. Never modifies the artifact (CQS principle).

**RPI** (Request → Plan → Implement)
: The basic HVE workflow. SKRAFT extends it with 4 additional phases.

**Rework**
: Work redone because a problem was detected too late. SKRAFT reduces rework by detecting problems early, at each phase.

## S

**state.json**
: A trace file produced and updated by the SKRAFT pipeline. Contains the current story state: phase, produced artifacts, verdicts, cycle history.

## T

**TDD** (Test-Driven Development)
: A technique for writing the test *before* the code. Cycle: Red (failing test) → Green (minimal code to pass) → Refactor (improve without breaking).

**TTM** (Time To Market)
: The time between an idea and its production release. One of the key indicators SKRAFT aims to reduce.

## U

**Use Case**
: A usage scenario of a system by a user. In SKRAFT, each pipeline pass handles exactly one Use Case (one *user story*).

**User Story**
: A short feature description from the user's perspective: `As a <who>, I want <what> so that <why>`.

## W

**Walking Skeleton**
: A minimal implementation that cuts through all system layers end to end — no complete functionality, just to validate that the architecture works. Reference: Freeman & Pryce, 2009.

---

> 🚧 This glossary is a draft. A human must verify definitions, fill in missing terms and validate references.

*Auto-generated page.*
