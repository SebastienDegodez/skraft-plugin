---
description: "Use when writing or editing SKRAFT handbook pages under docs/website/ (FR or EN). Enforces Diátaxis, the Starbucks artifact flow, current product-to-engineering ordering, dashboard catalogue ownership, and FR/EN parity."
applyTo: "docs/website/{docs,i18n}/**/*.{md,mdx}"
---

# SKRAFT Handbook — Content Conventions

The SKRAFT site (`docs/website/`, Docusaurus) is a **handbook**, not a pile of reference pages.
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

`docs/website/book.yml` `parts` gives one sidebar per mode, and the **folder layout mirrors
them**. A page's `doc` id is its EN path without extension; EN lives at
`docs/website/docs/<doc>.md`, FR at the same path under
`docs/website/i18n/fr/docusaurus-plugin-content-docs/current/`:

```
docs/website/docs/         (EN; the FR tree has the same shape)
  index.mdx                (home — router)
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
  reference/               Look up — catalogue (links to the dashboard), hosts, cli,
                           workflow-dot, phases, skraft-config, run-journal, gates,
                           patterns, evaluation-tooling, citations, glossary, changelog
```

A new page must be declared by its `doc` id in `book.yml`, under the part of its mode, and
live in the matching folder.
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

Each `explanation/pipeline/{phase}.md` (EN and FR) MUST include:

1. The **"you are here" ribbon**: front matter `phase: <phase>`; the site renders the
   ribbon from it. Never write the ribbon in the body.
2. A localized **"What enters / What exits"** block naming
   the upstream artifact consumed and the downstream artifact produced.
3. The **Starbucks running-example box** showing what the example looks like at this phase.
4. The existing localized **"Gates crossed here"** block linking
   to the reference gates page (`../../reference/gates.md`).

## 5. FR/EN parity is mandatory

- Every page exists in BOTH locales at the **same relative path and file name** (the
  `doc` id), with the same extension, no exception.
- Content is equivalent in both languages — same sections, same example, same
  artifact flow. Do not let one language drift ahead.

## 6. Catalogue ownership, links and citations

- Dashboard is sole catalogue for agents, skills, workers and lenses. Never add
  or regenerate one Markdown page per descriptor.
- Link the catalogue as a whole to the `reference/catalogue.md` doc (relative file link).
  Link one catalogue entity to its dashboard anchor, the same in both locales:
  `pathname:///dashboard/#agent-<id>`, `#worker-<id>`, `#lens-<id>`, or `#skill-<id>`.
- Keep factual orchestration in architecture, pipeline narrative and L3
  deep-dives; dashboard owns exhaustive rows and relationships.

- Internal links are relative file links with the extension (`../how-to/run-gates.md`,
  `../reference/citations.mdx#cite-<key>`), resolved from the page's own folder in its
  own locale. Never a site-absolute link (`/fr/…`, `/en/…`, `/how-to/…`) and never Liquid
  (`{{ … }}`, `{% … %}`): `lint-nav` refuses both. Static files outside the docs
  (dashboard, deck) use `pathname:///<path>`; images use `/img/<path>`.
- A claim attributed to an author carries a citation whose key exists in
  `docs/website/data/citations.yml`:
  `[Author, year](<relative path to reference/citations.mdx>#cite-<key>)`, or a quotation
  `> "quote of 25 words or fewer"` then `> — Author, *Title*, Year.`. The Starbucks
  example is exempt (it is fiction). A page with no attributed claim carries none.
- Reference pages follow `reference_template` from `book.yml`: a title and a
  one-sentence lead are required; the why lives in the linked explanation.
- Every product fact is checked in the plugin code; never describe a v1 behaviour
  as current.

## 7. Page shape

Every page:

- Front matter `title` and `description` (at most 160 characters: it is the card text and the
  search snippet). One H1. The first paragraph after the H1 is the lead; no intro blockquote.
- `.md` unless the page holds JSX (Tabs, a component, an import); then `.mdx`, in both locales.
- Heading ids shared by FR and EN: `## Title <!-- #id -->` in `.md`, `## Title {/* #id */}` in
  `.mdx`. An anchor a link targets keeps its id.
- Tutorials and how-tos end on `## Next steps` (2–3 links); reference and explanation pages end
  on `## See also`.

Per mode (prose words, code and tables excluded):

| Mode | Budget | Shape |
|---|---|---|
| Tutorial | ≤ 1,500 | Lead = what the reader will have built. `:::info[Before you start]` (≤ 5 bullets). One H2 per step, each ending on a visible result (a `console` block or a screenshot). "What you built", then Next steps. One host per tutorial: no Tabs. |
| How-to | ≤ 800 | Lead = the goal in one sentence. "Prerequisites" (≤ 5 bullets). Numbered steps. Host differences in `<Tabs groupId="host" queryString="host">` with one `<TabItem>` per host (Claude Code, Copilot CLI, VS Code). "Troubleshooting" with one H3 per symptom. |
| Explanation | ≤ 1,500 | Lead = the question answered. Why, then how. At most one diagram per H2. Jargon defined inline or in `:::note[Jargon]`. No steps. |
| Reference | ≤ 2,500 | Lead = what it describes. One link to the explanation that gives the why. Tables and `console` blocks. |

Admonitions: `:::<type>[Title]` … `:::`, bracket titles only. `note` aside, `tip` shortcut,
`info` context and the running example (EN `:::info[☕ Running example — Starbucks *(illustrative)*]`, FR
`:::info[☕ Fil rouge — Starbucks *(exemple illustratif)*]`),
`warning` something that loses work, `danger` an irreversible action, `caution` not verified on
a host (`:::caution[Not verified on V2]`). Decisions and jargon use `:::note[Decision]` and
`:::note[Jargon]`.

Terminal blocks: fence language `console`, optional `title="<name>"`. `$ ` starts a POSIX
command, `PS> ` a PowerShell command, `> ` a command typed in a host prompt (title the block with
the host name); a trailing `\` continues a command; every other line is output. Files,
templates and trees keep their own language (`text`, `json`, `yaml`…).

Diagrams: ` ```mermaid ` fences. Screenshots: `![alt](/img/screenshots/<lang>/<file>)`.

## 8. Validation before considering a page done

```bash
npm run docs:check     # book.yml schema, FR labels, lint-nav, citations, scan-drift
npm run docs:build     # both locales; a broken link, anchor or image fails the build
```
