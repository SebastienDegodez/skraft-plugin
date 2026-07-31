---
layout: doc
lang: en
title: "Reference — Skills"
description: "SKRAFT skills: tooled practices, what they do, when to use them."
---

# Reference — Skills

> A *skill* is a tooled practice: a tested procedure an agent loads exactly when it
> needs it. Each skill answers a precise craft problem.

## Usage order — grouped by agent

### 0) Single entry point — [skraft-orchestrator]({{ "/en/reference/agents/skraft-orchestrator" | relative_url }})

- **[skraft-difficulty-routing](skraft-difficulty-routing.html)** — 3-axis routing (entry point, depth tier, difficulty tier).
- **[adversarial-review-lenses](adversarial-review-lenses.html)** — multi-lens adversarial synthesis.
- **[contract-testing](contract-testing.html)** — cross-phase API contract capability (DESIGN → DISTILL → DELIVER).
- **[playwright-evidence](playwright-evidence.html)** — E2E evidence capture at pipeline end.

### 1) DISCOVER — [backlog-discoverer]({{ "/en/reference/agents/backlog-discoverer" | relative_url }})

- **[github-search-protocol](github-search-protocol.html)** — GitHub Search query building, pagination, filtering.
- **[issue-triage](issue-triage.html)** — labels, priority, effort, duplicates, sprint proposal.

### 2) DISCOVER review — [backlog-discoverer-reviewer]({{ "/en/reference/agents/backlog-discoverer-reviewer" | relative_url }})

- **[discovery-review-criteria](discovery-review-criteria.html)** — gates G1-G6 for DISCOVER artefacts.
- **[adversarial-review-lenses](adversarial-review-lenses.html)** — adversarial panel verdict.

### 3) DISCUSS — [backlog-planner]({{ "/en/reference/agents/backlog-planner" | relative_url }})

- **[issue-refinement](issue-refinement.html)** — raw issue → INVEST story + acceptance criteria.
- **[sprint-planning](sprint-planning.html)** — sprint prioritisation, capacity, dependencies.

### 4) DISCUSS review — [backlog-planner-reviewer]({{ "/en/reference/agents/backlog-planner-reviewer" | relative_url }})

- **[planning-review-criteria](planning-review-criteria.html)** — gates G1-G8 for DISCUSS artefacts.
- **[adversarial-review-lenses](adversarial-review-lenses.html)** — adversarial panel verdict.

### 5) DESIGN — [solution-architect]({{ "/en/reference/agents/solution-architect" | relative_url }})

- **[architecture-patterns](architecture-patterns.html)** — Event Modeling, strategic/tactical DDD, CQRS, Event Sourcing.
- **[architecture-decisions](architecture-decisions.html)** — ADR decisions, alternatives, lifecycle.

### 6) DESIGN review — [solution-architect-reviewer]({{ "/en/reference/agents/solution-architect-reviewer" | relative_url }})

- **[architecture-review-criteria](architecture-review-criteria.html)** — DESIGN gates on ADRs, diagrams, contracts.
- **[adversarial-review-lenses](adversarial-review-lenses.html)** — adversarial panel verdict.

### 7) DISTILL — [acceptance-designer]({{ "/en/reference/agents/acceptance-designer" | relative_url }})

- **[bdd-methodology](bdd-methodology.html)** — Gherkin structure (Given/When/Then, outline, tags).
- **[test-design-mandates](test-design-mandates.html)** — coverage matrices + outside-in order.
- **[outside-in-tdd](outside-in-tdd.html)** — outside-in TDD double loop from observable behaviour.
- **[resolving-stack-commands](resolving-stack-commands.html)** — stack-based concrete command resolution.

### 8) DISTILL review — [acceptance-designer-reviewer]({{ "/en/reference/agents/acceptance-designer-reviewer" | relative_url }})

- **[acceptance-review-criteria](acceptance-review-criteria.html)** — gates G1-G6 for DISTILL artefacts.
- **[adversarial-review-lenses](adversarial-review-lenses.html)** — adversarial panel verdict.

### 9) DELIVER — [software-engineer]({{ "/en/reference/agents/software-engineer" | relative_url }})

- **[outside-in-tdd](outside-in-tdd.html)** — end-to-end outside-in TDD strategy.
- **[red-synthesize-green](red-synthesize-green.html)** — RED → minimal implementation → GREEN cycle.
- **[ordered-test-list](ordered-test-list.html)** — strict one-test-at-a-time progression (TPP + FLFI) for incremental TDD.
- **[clean-architecture-testing](clean-architecture-testing.html)** — layer/boundary test strategy.
- **[craft-discipline](craft-discipline.html)** — self-discipline checkpoints before commit.
- **[test-refactoring-catalog](test-refactoring-catalog.html)** — post-GREEN test refactoring.
- **[mutation-testing](mutation-testing.html)** — mutation-score quality verification.
- **[quality-gates-evidence-contract](quality-gates-evidence-contract.html)** — evidence-log schema contract.
- **[quality-gates-dotnet](quality-gates-dotnet.html)** — quality-gate commands for .NET stack.

### 9b) DELIVER — internal workers (software-engineer sub-agents)

- **[mocking-strategy-roster](mocking-strategy-roster.html)** — mocking strategy + stack resolution.
- **[mocking-microcks-dotnet](mocking-microcks-dotnet.html)** — .NET Microcks mock wiring.
- **[mocking-inprocess-dotnet](mocking-inprocess-dotnet.html)** — .NET in-process double wiring.
- **[contract-testing-roster](contract-testing-roster.html)** — stack + Microcks opt-in for provider contracts.
- **[contract-testing-dotnet](contract-testing-dotnet.html)** — provider contract baseline + optional Microcks layer.
- **[contract-testing](contract-testing.html)** — contract capability reused by contract worker.
- **[resolving-stack-commands](resolving-stack-commands.html)** — test/build/mutation command resolution for workers.

### 10) DELIVER review — [software-engineer-reviewer]({{ "/en/reference/agents/software-engineer-reviewer" | relative_url }})

- **[adversarial-review-lenses](adversarial-review-lenses.html)** — review-lens orchestration.

### Outside pipeline — direct usage

- **[create-custom-agent](create-custom-agent.html)** — build a custom agent (`.agent.md`): tools, instructions, handoffs.

## See also

- [Architecture patterns]({{ "/en/reference/patterns" | relative_url }})
- [The Outside-In TDD deep dive]({{ "/en/explanation/deep-dive/outside-in-tdd" | relative_url }})
