---
description: "Use when adding or changing an agent, sub-agent (worker), reviewer, skill or review lens under plugins/ and the SKRAFT handbook (docs/site/) must reflect the new orchestration chain. Enforces where each agent-chain must be surfaced, FR/EN parity, no dangling derived links, and the validation gate. Load before editing any docs/site page that describes agent orchestration, fan-out, or lenses."
applyTo: "docs/site/**/*.md"
---

# SKRAFT Handbook — Agent-Chain Sync

When the plugin gains or changes an agent, an internal sub-agent (worker),
a reviewer, a skill, or a review lens, the handbook must show the **new
orchestration chain** — not just a new reference row. A chain that exists in
`plugins/` but is invisible in `docs/site/` is a documentation gap.

## 1. Surface every chain in all four places

A new agent/worker/lens is only "documented" once it appears in **each** layer
below (FR and EN). Do not stop at one page.

| Layer | Page(s) | What to add |
|-------|---------|-------------|
| **Architecture** (Explanation) | `{fr,en}/explanation/architecture.md` | Extend the mermaid graph with the new node(s) + an arrow showing who dispatches/reads it; update the legend if a new arrow kind appears. |
| **Pipeline narrative** (Explanation) | `{fr,en}/explanation/pipeline/{team,<phase>}.md` | In the owning agent's section, state who it delegates to and who reviews the result. |
| **Deep-dive** (Explanation) | `{fr,en}/explanation/deep-dive/*` | If the change touches review/adversarial panels, describe when the new lens joins. |
| **Reference** (Reference) | `{fr,en}/reference/{agents,skills,lens}/...` | Add the terse factual row/table entry (name, role, when active). |

## 2. Internal sub-agents are a fan-out, not a phase

Workers (`plugins/agents/workers/<capability>/*.agent.md`, `user-invocable: false`)
are dispatched **inside** a phase agent — they are never a 6th pipeline phase.
Show them as an internal fan-out under their owning agent (today: the
`software-engineer` in DELIVER), and state that the lead keeps the business TDD
cycle and verifies each worker in TIER-1 (RED → GREEN).

## 3. Conditional lenses join the panel only when active

A capability lens (e.g. `mock-fidelity-lens`, `contract-fidelity-lens`) is **not**
one of the CORE review lenses. Always frame it as joining the adversarial panel
*only when its capability is active*, and keep it honouring the same BLOCKER rule.

## 4. Never link to a page that does not exist

Surface new agents/workers/lenses as **descriptive text or table rows** in an
existing page. Do not create a markdown link to a per-item derived page unless
that file already exists — a dangling `relative_url` 404s and breaks the build.

## 5. FR/EN parity is non-negotiable

Every edit lands in BOTH `fr/` and `en/` with the same structure, same diagram,
same table. Do not let one language carry a chain the other lacks.

## 6. Validate before considering it done

```bash
node scripts/check-citations.mjs --citations docs/site/_data/citations.yml --pages "docs/site/**/*.md"
export PATH="/opt/homebrew/opt/ruby/bin:/opt/homebrew/lib/ruby/gems/4.0.0/bin:$PATH"
cd docs/site && bundle exec jekyll build
```

Both must be green (citations valid, build done). Only `—` and `→` are allowed
as non-ASCII characters in the prose.
