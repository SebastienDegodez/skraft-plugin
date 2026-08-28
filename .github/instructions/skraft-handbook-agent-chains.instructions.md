---
description: "Use when adding or changing an agent, worker, reviewer, skill or lens and reflecting its chain in the handbook/dashboard. Enforces source-derived catalogue coverage, factual narrative, FR/EN parity, and validation."
applyTo: "docs/site/**/*.md"
---

# SKRAFT Handbook — Agent-Chain Sync

When the plugin gains or changes an agent, an internal sub-agent (worker),
a reviewer, a skill, or a review lens, the handbook must show the **new
orchestration chain** — not just a new reference row. A chain that exists in
`plugins/` but is invisible in `docs/site/` is a documentation gap.

## 1. Surface every relevant chain without duplicating catalogue pages

A new agent/worker/lens is only "documented" once it appears in **each** layer
below (FR and EN). Do not stop at one page.

| Layer | Page(s) | What to add |
|-------|---------|-------------|
| **Architecture** (Explanation) | `{fr,en}/explanation/architecture.md` | Keep the graph at **L1 (orchestrator) + L2 (phase agents + reviewers)**. Add an L2 node + arrow only if a new phase agent/reviewer appears; update the legend if a new L1/L2 arrow kind appears. Do NOT add L3 fan-out nodes here — link them to their zoom page instead. |
| **Pipeline narrative** (Explanation) | `{fr,en}/explanation/pipeline/{team,<phase>}.md` | In the owning agent's section, state who it delegates to and who reviews the result. |
| **Deep-dive / L3 zoom** (Explanation) | `{fr,en}/explanation/deep-dive/*` | For an internal fan-out (worker), update the matching **L3 zoom page** (`mocking-microcks`, `contract-testing`) or add a new one; describe when a conditional lens joins the panel. |
| **Catalogue** (Reference) | `{fr,en}/dashboard/` | No manual row. Scanner reads descriptors and dashboard renders identity, role, roots, dispatch edges, skills and stable anchors. |

Dashboard is sole exhaustive catalogue for agents, skills, workers and lenses.
Never create or regenerate per-item Markdown pages or overview indexes for these
families. Narrative pages explain only relationships readers need to understand.

## 2. Internal sub-agents are a fan-out, not a phase

Workers (`plugins/skraft-framework/agents/workers/<capability>/*.agent.md`, `user-invocable: false`)
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

## 4. Link to stable localized dashboard anchors

Surface relationships as descriptive text or focused tables in existing pages.
Entity links target `/{lang}/dashboard/#<kind>-<stable-id>` through
`relative_url`. Never link to retired per-item catalogue routes.

## 5. Preserve orchestration boundaries and order

- Optional product preflight: `backlog-discoverer → backlog-planner` when both
	are used; both remain directly invocable and precede engineering.
- Engineering entrypoint: `skraft-orchestrator` only for
	`RESEARCH → DESIGN → DISTILL → DELIVER`.
- Never show backlog agents as orchestrator children or claim orchestrator is
	global SKRAFT entrypoint.
- Keep brownfield and other directly invocable roots visible outside this chain.

## 6. FR/EN parity is non-negotiable

Every edit lands in BOTH `fr/` and `en/` with the same structure, same diagram,
same table. Do not let one language carry a chain the other lacks.

## 7. Validate before considering it done

```bash
node scripts/check-citations.mjs --citations docs/site/_data/citations.yml --pages "docs/site/**/*.md"
node scripts/scan-drift.mjs --out .skraft-docs/ledger.json
node eng/catalog/scan.mjs
export PATH="/opt/homebrew/opt/ruby/bin:/opt/homebrew/lib/ruby/gems/4.0.0/bin:$PATH"
cd docs/site && bundle exec jekyll build
```

Both must be green (citations valid, build done). Only `—` and `→` are allowed
as non-ASCII characters in the prose.
