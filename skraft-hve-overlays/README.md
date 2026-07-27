# skraft-hve-overlays

SKRAFT rigor for HVE workflows through one global bootstrap instruction and one
`hve-rigor` skill. Additive only: HVE sources stay unchanged.

## Dependency

Leaf skills referenced by `hve-rigor` (`issue-refinement`,
`architecture-patterns`, `outside-in-tdd`, `craft-discipline`, and others) live
in the **`skraft`** plugin. Install `skraft` alongside this plugin. Missing leaf
skills block HVE route completion.

## Activation and enforcement

* `hve-rigor-bootstrap` provides always-available discovery guidance.
* `hve-rigor` is a single entrypoint (`skills/hve-rigor/SKILL.md`) that
	identifies the current HVE agent, phase, and target artifacts, then
	follows the SKRAFT agent convention: **Skill Loading — MANDATORY**, with
	startup requirements and trigger-based **Load on demand** tables. It loads
	only the matching local route reference under
	`skills/hve-rigor/references/`: `backlog.md`, `prd.md`,
	`rpi-research-plan.md`, `rpi-implementation.md`, or `rpi-review.md`.
	A missing route reference or leaf skill blocks completion rather than
	being silently skipped.
* Delegated HVE work carries the selected route and required leaf skills in its
	subagent brief.

## Components

| Component | Scope | Responsibility |
|---|---|---|
| `hve-rigor-bootstrap` | all paths | Detect HVE work and mandate skill loading |
| `hve-rigor` | HVE backlog, PRD, and RPI workflows | Select route and enforce loading contract |
| `references/backlog.md` | backlog route | Backlog quality gates |
| `references/prd.md` | PRD route | Requirement quality gates |
| `references/rpi-research-plan.md` | RPI Research and Plan | Architecture and test-design gates |
| `references/rpi-implementation.md` | RPI Implement | TDD and craft gates |
| `references/rpi-review.md` | RPI Review | Adversarial review and evidence gates |
