---
description: "Use when adding or changing an agent, worker, reviewer, skill or lens and reflecting its chain in the handbook/dashboard. Enforces source-derived catalogue coverage, factual narrative, FR/EN parity, and validation."
applyTo: "docs/website/{docs,i18n}/**/*.{md,mdx}"
---

# SKRAFT Handbook — Agent-Chain Sync

When the plugin gains or changes an agent, an internal sub-agent (worker),
a reviewer, a skill, or a review lens, the handbook must show the **new
orchestration chain** — not just a new reference row. A chain that exists in
`plugins/` but is invisible in `docs/website/` is a documentation gap.

## 1. Surface every relevant chain without duplicating catalogue pages

A new agent/worker/lens is only "documented" once it appears in **each** layer
below (FR and EN). Do not stop at one page. Paths are `doc` ids: EN under
`docs/website/docs/`, FR at the same path under
`docs/website/i18n/fr/docusaurus-plugin-content-docs/current/`.

| Layer | Page(s) | What to add |
|-------|---------|-------------|
| **Architecture** (Explanation) | `explanation/architecture` | Keep the graph at **L1 (orchestrator) + L2 (phase agents + reviewers)**. Add an L2 node + arrow only if a new phase agent/reviewer appears; update the legend if a new L1/L2 arrow kind appears. Do NOT add L3 fan-out nodes here — link them to their zoom page instead. |
| **Pipeline narrative** (Explanation) | `explanation/pipeline/{team,<phase>}` | In the owning agent's section, state who it delegates to and who reviews the result. |
| **Deep-dive / L3 zoom** (Explanation) | `explanation/deep-dive/*` | For an internal fan-out (worker), update the matching **L3 zoom page** (`mocking-microcks`, `contract-testing`) or add a new one; describe when a conditional lens joins the panel. |
| **Catalogue** (Reference) | `reference/catalogue` + the dashboard (`docs/website/static/dashboard/`) | No manual row. Scanner reads descriptors and dashboard renders identity, role, roots, dispatch edges, skills and stable anchors. |

Dashboard is sole exhaustive catalogue for agents, skills, workers and lenses.
Never create or regenerate per-item Markdown pages or overview indexes for these
families. Narrative pages explain only relationships readers need to understand.

## 2. Internal sub-agents are a fan-out, not a phase

Workers (`plugins/skraft-framework/com.github.copilot/agents/*-worker.agent.md`, `user-invocable: false`)
are dispatched **inside** a phase agent — they are never a 6th pipeline phase.
Show them as an internal fan-out under their owning agent (today: the
`software-engineer` in DELIVER), and state that the lead keeps the business TDD
cycle and verifies each worker in TIER-1 (RED → GREEN).

The system-level `architecture.md` stays at **L1 + L2**; each worker fan-out gets a
dedicated **L3 zoom page** under `explanation/deep-dive/` (e.g. `mocking-microcks`,
`contract-testing`) so the top-level diagram stays readable. A new worker capability
means a new zoom page (FR + EN), linked from `architecture.md` and from its phase page.

## 3. Conditional lenses join the panel only when active

A capability lens (e.g. `mock-fidelity-lens`, `contract-fidelity-lens`) is **not**
one of the CORE review lenses. Always frame it as joining the adversarial panel
*only when its capability is active*, and keep it honouring the same BLOCKER rule.

## 4. Link to stable dashboard anchors

Surface relationships as descriptive text or focused tables in existing pages.
Entity links target `pathname:///dashboard/#<kind>-<stable-id>` (same link in both locales).
Never link to retired per-item catalogue routes (`reference/agents/`, `reference/skills/`,
`reference/workers/`, `reference/lenses/`).

## 5. Preserve orchestration boundaries and order

- Optional product preflight: `backlog-discoverer → backlog-planner` when both
	are used; both remain directly invocable and precede engineering.
- Engineering entrypoint: `skraft-orchestrator` only for
	`RESEARCH → DESIGN → DISTILL → DELIVER`.
- Never show backlog agents as orchestrator children or claim orchestrator is
	global SKRAFT entrypoint.
- Keep brownfield and other directly invocable roots visible outside this chain.

## 6. FR/EN parity is non-negotiable

Every edit lands in BOTH locales with the same structure, same diagram,
same table. Do not let one language carry a chain the other lacks.

## 7. Validate before considering it done

```bash
npm run docs:check     # book.yml schema, FR labels, lint-nav, citations, scan-drift
node eng/catalog/scan.mjs
npm run docs:build     # both locales; a broken link, anchor or image fails the build
```

All three must be green. Only `—` and `→` are allowed
as non-ASCII characters in the prose.
