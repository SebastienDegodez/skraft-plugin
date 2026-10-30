---
description: "Use when writing or editing SKRAFT handbook pages under docs/site/ (FR or EN). Enforces Diátaxis, the Starbucks artifact flow, current product-to-engineering ordering, dashboard catalogue ownership, and FR/EN parity."
applyTo: "docs/site/**/*.md"
---

# SKRAFT Handbook — Content Conventions

The SKRAFT site (`docs/site/`) is a **handbook**, not a pile of reference pages.
Every page must serve a reader following a thread, not just document a feature.
These rules apply to FR and EN pages equally.

## 1. Diátaxis — every page has exactly one mode

Classify each page into one of the four Diátaxis modes and write it accordingly.
Never mix modes on the same page.

| Mode | Purpose | Voice | Examples in this site |
|------|---------|-------|-----------------------|
| **Tutorial** | Learn by doing, one guided path | "you will..." | the end-to-end running-example walkthrough, getting-started |
| **How-to** | Solve one task | imperative steps | install the plugin, add a lens |
| **Explanation** | Understand *why* | discursive, cites sources | principles, review-before-review, deep-dives |
| **Reference** | Look up facts | terse, tabular, no "why" (link to the explanation) | hosts, cli, gates, patterns, glossary |

The sidebar (`_data/book.yml` `parts`) is grouped by these modes, and the **folder
layout mirrors them** (per language):

```
fr/
  index.md                 (home — router)
  tutorials/               Learn      — guided first runs
  how-to/                  Do         — one task per page (install, configure, gates,
                                        resume, answer, models, lens, eject, agent,
                                        review a PR, publish, migrate, backlog,
                                        brownfield, evaluate a skill, contribute)
  explanation/             Understand
    pipeline/              journeys, running example, phases, team
    deep-dive/             review-before-review, outside-in-tdd, walking-skeleton,
                           mocking-microcks, contract-testing, reading-a-verdict
    architecture, event-journal, guardrails, token-economy, customisation-trade-offs,
    backlog, brownfield, software-craftsmanship, domain-driven-design,
    clean-architecture, evaluation-strategy, for-executives
  dashboard/               Look up — agents, skills, workers, lenses, chains
  reference/               Look up — hosts, cli, workflow-dot, phases, skraft-config,
                           run-journal, gates, patterns, citations, glossary, changelog
```

A new page must declare which mode it belongs to and live in the matching folder.
The Starbucks running example is **narrative**, so it lives under `explanation/pipeline/`,
not `tutorials/`. Task-oriented pages (customise the pipeline, propose a pattern)
are **how-to**, so they live under `how-to/`, not `tutorials/`.

## 2. The running thread is the artifact flow

The thread that ties the handbook together is **"each artifact becomes the context
of the next phase"**:

```text
triaged issue → INVEST story → research → ADR + event model → Gherkin scenario → code + evidence
DISCOVER      → DISCUSS      → RESEARCH → DESIGN              → DISTILL          → DELIVER
optional, autonomous                       orchestrated engineering pipeline
```

`backlog-discoverer` followed by `backlog-planner` are two autonomous, optional
product workflows. When both are used, this order is mandatory. They run before
`skraft-orchestrator`, never within its dispatch list. `skraft-orchestrator` is
the single entrypoint for the `RESEARCH → DESIGN → DISTILL → DELIVER`
engineering pipeline, not the global SKRAFT entrypoint. Brownfield workflows
and other directly invocable roots remain outside this chain.

Make this chain visible — do not leave phases described in isolation.

## 3. Running example — Starbucks (illustrative)

Use **one single running example across all phases**: ordering and paying for a
drink in the Starbucks mobile app.

- Keep it generalist and self-explanatory (no domain expertise required).
- It is **illustrative, invented for teaching** — it is NOT derived from the
  codebase. Mark it as an "illustrative example" in the page's language so
  readers never confuse it with attested facts from the plugin.
- Never invent metrics or numbers for it. Qualitative only.
- Do not introduce a second competing example. Starbucks is the only running example.

Per-phase artifact the example produces:

| Step | Artifact (input → output) |
|------|---------------------------|
| DISCOVER | raw issue "enable mobile ordering" → triaged & prioritised |
| DISCUSS | INVEST story "order a customised drink" + at least 3 acceptance criteria |
| RESEARCH | refined story → research brief and constraints |
| DESIGN | ADR (payment) + event model `PlaceOrder` → `OrderPaid` |
| DISTILL | Gherkin Given cart / When payment / Then receipt |
| DELIVER | RED→GREEN commits + mutation score |

## 4. Connectors required on every pipeline phase page

Each `docs/site/{fr,en}/explanation/pipeline/{phase}.md` MUST include:

1. A localized **"you are here" ribbon** at the top showing optional
  product preflight before `RESEARCH → DESIGN → DISTILL → DELIVER`, with the current step
   highlighted (use `{% include phase-ribbon.html current="<phase>" %}`).
2. A localized **"What enters / What exits"** block naming
   the upstream artifact consumed and the downstream artifact produced.
3. The **Starbucks running-example box** showing what the example looks like at this phase.
4. The existing localized **"Gates crossed here"** block linking
   to the reference gates page (`{{ "/fr/reference/gates" | relative_url }}`).

## 5. FR/EN parity is mandatory

- Every page exists in BOTH `fr/` and `en/` with the **same English basename**,
  no exception.
- Content is equivalent in both languages — same sections, same example, same
  artifact flow. Do not let one language drift ahead.

## 6. Catalogue ownership, links and citations

- Dashboard is sole catalogue for agents, skills, workers and lenses. Never add
  or regenerate one Markdown page per descriptor.
- Link catalogue entities to localized dashboard anchors:
  `/{lang}/dashboard/#agent-<id>`, `#worker-<id>`, `#lens-<id>`, or `#skill-<id>`.
- Keep factual orchestration in architecture, pipeline narrative and L3
  deep-dives; dashboard owns exhaustive rows and relationships.

- Internal links use `{{ "/fr/…" | relative_url }}` — never a bare `/fr/…`
  (the baseurl `/skraft-plugin` must be applied, or the link 404s).
- A claim attributed to an author carries a citation whose key exists in
  `_data/citations.yml`: `[Author, year]({{ cites }}#cite-<key>)`, or a quotation
  `> "quote of 25 words or fewer"` then `> — Author, *Title*, Year.`. The Starbucks
  example is exempt (it is fiction). A page with no attributed claim carries none.
- Reference pages follow `reference_template` from `_data/book.yml`: a title and a
  one-sentence intro callout are required; the why lives in the linked explanation.
- Every product fact is checked in the plugin code; never describe a v1 behaviour
  as current.

## 7. Validation before considering a page done

```bash
# citations
node scripts/check-citations.mjs --citations docs/site/_data/citations.yml --pages "docs/site/**/*.md"
# build (Ruby is keg-only — export PATH first)
export PATH="/opt/homebrew/opt/ruby/bin:/opt/homebrew/lib/ruby/gems/4.0.0/bin:$PATH"
cd docs/site && bundle exec jekyll build
# smoke tests
npx playwright test
```
