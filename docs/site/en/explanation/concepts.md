---
layout: doc
lang: en
title: "Core concepts"
description: "Cross-cutting concepts in SKRAFT: phase, agent, reviewer, gate, lens, artifact — and concepts specific to each pipeline phase."
persona: tech-lead
---

# Core concepts

SKRAFT invents nothing: it **assembles** proven software-engineering concepts and turns them into operational constraints applied at every pipeline phase. This page is the handbook's reference glossary. Each concept is explained, then linked to the phase and skill that operationalise it.

> Reading guide: 🧭 = cross-cutting concept · 🔎 DISCOVER · 💬 DISCUSS · 🏗️ DESIGN · 🧪 DISTILL · 🚀 DELIVER · 🛡️ Review.

---

## 🧭 Cross-cutting concepts

### Use Case

A Use Case captures a contract between stakeholders about expected system behaviour. In SKRAFT, **one story = one Use Case = one full pipeline cycle** (DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER). No batching, no shortcuts.

> « A use case captures a contract between the stakeholders of a system about its behavior. »
> — Cockburn, A., *Writing Effective Use Cases*, 2001.

### CQS — Command-Query Separation

CQS separates operations that modify state (commands) from those that read it (queries). In SKRAFT, executor agents **command** (they write artifacts), while reviewers **query** (they read without modifying).

> « Asking a question should not change the answer. »
> — Meyer, B., *Object-Oriented Software Construction, 2nd ed.*, 1997.

See [Architecture]({{ "/en/explanation/architecture" | relative_url }}) for the concrete application.

### CQRS — Command-Query Responsibility Segregation

CQRS extends CQS by separating read and write models. The orchestrator dispatches commands to executors (write model), then consults `state.json` as a derived read model to decide the next action.

> « Use different models for updating information and reading information. »
> — Fowler, M., *Bliki: CQRS*, 2011.

### Walking Skeleton

The thinnest slice that traverses **all** system layers end to end. SKRAFT's first iteration delivers a complete functional slice — not a prototype, a real vertical deliverable.

> « A walking skeleton is a tiny implementation of the system that performs a small end-to-end function. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

### HVE — Hypervelocity Engineering

The execution substrate ([microsoft/hve-core](https://github.com/microsoft/hve-core)): agents, instructions, and skills for GitHub Copilot built around the **RPI (Research → Plan → Implement)** methodology. SKRAFT replaces the RPI planner while reusing HVE conventions (`state.json`, `.copilot-tracking/` tree). See the [home page]({{ "/en/" | relative_url }}) for the SKRAFT × HVE synergy.

---

## 🔎 DISCOVER — Triage concepts

### Issue triage

Assign labels, priority, effort estimate, and detect duplicates. The `backlog-discoverer` produces an actionable triage report from the raw stream of ideas (issues, BRDs, PRDs). Skill: [issue-triage]({{ "/en/reference/skills/" | relative_url }}).

### Duplicate detection & artifact-driven discovery

Before creating a story, search the Git history and existing issues to avoid redundancy. Skill: [github-search-protocol]({{ "/en/reference/skills/" | relative_url }}) (GitHub search syntax, pagination, ranking).

### 3-axis routing (difficulty)

At the end of DISCOVER, SKRAFT evaluates three axes — **entry point**, **depth tier** (`basic | standard | comprehensive | custom`), and **difficulty tier** — then persists the decision in `state.json`. This routing adapts the execution depth for each subsequent phase. Skill: [skraft-difficulty-routing]({{ "/en/reference/skills/" | relative_url }}).

---

## 💬 DISCUSS — Refinement concepts

### User Story & acceptance criteria

Transform a raw issue into a structured story with verifiable acceptance criteria. Skill: [issue-refinement]({{ "/en/reference/skills/" | relative_url }}).

### INVEST

A good story is **I**ndependent, **N**egotiable, **V**aluable, **E**stimable, **S**mall, **T**estable. The `backlog-planner` refines each story until all six criteria are satisfied.

### DoR — Definition of Ready

An 8-point checklist that determines whether a story is ready to enter DESIGN. While the DoR is not fully green, the story stays in DISCUSS. Verified by [planning-review-criteria]({{ "/en/reference/skills/" | relative_url }}).

### MoSCoW & Sprint Planning

**Mu**st / **Sh**ould / **C**ould / **W**on't prioritisation, milestone management, velocity tracking, and resolution of inter-story dependency graphs. Skill: [sprint-planning]({{ "/en/reference/skills/" | relative_url }}).

---

## 🏗️ DESIGN — Architecture concepts

### Event Modeling

A modelling method that describes the system as a **Command → Event → Read Model** flow over time. Serves as the shared backbone for the entire team.

> « The model is the backbone of a language used by all team members to describe the system. »
> — Evans, E., *Domain-Driven Design*, 2003.

### DDD — Domain-Driven Design (strategic & tactical)

- **Strategic**: decomposition into **Bounded Contexts**, context mapping, ubiquitous language.
- **Tactical**: **Aggregate**, **Entity**, **Value Object**, **Domain Event**, **Repository**.

The `solution-architect` models these elements; the [architecture-patterns]({{ "/en/reference/skills/" | relative_url }}) skill covers their composition.

### Clean Architecture

Strict isolation of business logic from infrastructure via the **dependency rule**: inner layers know nothing about outer ones. Frameworks and databases become mere details.
👉 Dedicated page: **[Clean Architecture in detail]({{ "/en/explanation/clean-architecture" | relative_url }})**.

### Event Sourcing

Persist the sequence of events rather than the final state, reconstructed by replay. Often combined with CQRS for domains with high auditability needs. Covered by [architecture-patterns]({{ "/en/reference/skills/" | relative_url }}).

### ADR — Architecture Decision Record

Each structural decision is frozen in an immutable ADR capturing **context → options → decision → consequences**, with a status lifecycle (proposed → accepted → superseded). Guarantees that the *why* behind choices remains traceable. Skill: [architecture-decisions]({{ "/en/reference/skills/" | relative_url }}).

### Pattern fitness

Choosing a pattern means evaluating its fit to the problem (not a reflex). The reviewer verifies this fitness via [architecture-review-criteria]({{ "/en/reference/skills/" | relative_url }}).

---

## 🧪 DISTILL — Executable specification concepts

### BDD & Gherkin

Describe expected behaviour in **Given / When / Then** language, aligned with the domain vocabulary. The `acceptance-designer` produces executable scenarios. Skill: [bdd-methodology]({{ "/en/reference/skills/" | relative_url }}).

### Test Design Mandates

A coverage matrix that assigns **each behaviour to the right Clean Architecture level**, without redundancy, and plans the outside-in implementation order. Skill: [test-design-mandates]({{ "/en/reference/skills/" | relative_url }}).

### Contract Testing

Verify that two services honour a shared contract (consumer/provider) without a full integration test. Skill: [contract-testing]({{ "/en/reference/skills/" | relative_url }}).

---

## 🚀 DELIVER — Disciplined implementation concepts

### Outside-In TDD (double loop)

Start with the acceptance test (outer loop, observable behaviour) and let the internal design emerge through the inner TDD loop. Skill: [outside-in-tdd]({{ "/en/reference/skills/" | relative_url }}).

> « Start with an acceptance test that exercises the functionality you want to build. »
> — Freeman, S. & Pryce, N., *Growing Object-Oriented Software, Guided by Tests*, 2009.

### RED → GREEN → REFACTOR

The fundamental TDD rhythm: write a failing test, make it pass with the simplest code, then refactor. Skill: [red-synthesize-green]({{ "/en/reference/skills/" | relative_url }}).

> « Write new code only if an automated test has failed; eliminate duplication. »
> — Beck, K., *Test-Driven Development by Example*, 2003.

### Mutation Testing

The Mutation Score measures test **effectiveness** (not just coverage) by injecting faults and verifying that tests detect them. An insufficient score blocks the PASS verdict. Skills: [mutation-testing]({{ "/en/reference/skills/" | relative_url }}), [quality-gates-dotnet]({{ "/en/reference/skills/" | relative_url }}).

> « Mutation testing provides high-fidelity assessment of test suite effectiveness. »
> — Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.

### Object Calisthenics

Nine discipline rules that improve object design daily (one level of indentation per method, no `else`, wrap primitives, no blind getters/setters…). Workshop constraints verified by the reviewer.

> « Nine steps to better software design today. »
> — Bay, J., *Object Calisthenics*, 2008.

### Craft Discipline & Test Refactoring

- [craft-discipline]({{ "/en/reference/skills/" | relative_url }}): self-discipline checkpoints the software-engineer applies to their own work before committing.
- [test-refactoring-catalog]({{ "/en/reference/skills/" | relative_url }}): refactor tests (helper extraction, domain renaming, deduplication) without changing coverage.

### Quality Gates & Evidence Contract

A structured evidence log attests the state of quality gates (tests, build, mutation, RED/GREEN integrity). The engineer **fills** it (writer), the reviewer **reads** it (reader). Skills: [quality-gates-evidence-contract]({{ "/en/reference/skills/" | relative_url }}), [resolving-stack-commands]({{ "/en/reference/skills/" | relative_url }}).

---

## 🛡️ Review — Independent validation concepts

### Adversarial Review Lenses

Each reviewer produces a verdict through **4 independent lenses** then a weighted synthesis. The lenses examine the same artifact from different angles (quality-gates, architecture-boundaries, test-integrity, cold-reader). Skill: [adversarial-review-lenses]({{ "/en/reference/skills/" | relative_url }}).

### Review Criteria per phase

Each phase has its own gate grid and scoring rubric: [discovery-review-criteria]({{ "/en/reference/skills/" | relative_url }}), [planning-review-criteria]({{ "/en/reference/skills/" | relative_url }}), [architecture-review-criteria]({{ "/en/reference/skills/" | relative_url }}), [acceptance-review-criteria]({{ "/en/reference/skills/" | relative_url }}).

### Playwright Evidence

For UI behaviours, Playwright captures and traces serve as objective proof of working functionality. Skill: [playwright-evidence]({{ "/en/reference/skills/" | relative_url }}).

---

## See also

- [The pipeline phase by phase]({{ "/en/explanation/pipeline/" | relative_url }})
- [System architecture]({{ "/en/explanation/architecture" | relative_url }})
- [Clean Architecture in detail]({{ "/en/explanation/clean-architecture" | relative_url }})
- [Skills reference]({{ "/en/reference/skills/" | relative_url }})
