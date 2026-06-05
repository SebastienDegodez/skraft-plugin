---
description: "Use when writing or editing SKRAFT handbook pages under docs/site/ (FR or EN). Enforces the Diátaxis structure, the Starbucks fil rouge, the artifact-flow connectors between phases, and FR/EN parity. Load before authoring any handbook page, phase page, catalogue page, or deep-dive."
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
| **Tutoriel / Tutorial** | Learn by doing, one guided path | "vous allez…" / "you will…" | the end-to-end fil-rouge walkthrough, getting-started |
| **Guide pratique / How-to** | Solve one task | imperative steps | install the plugin, customise an agent |
| **Explication / Explanation** | Understand *why* | discursive, cites sources | principles, why-review-before-review, deep-dives |
| **Référence / Reference** | Look up facts | terse, tabular | agents, skills, gates, lenses, patterns |

The sidebar (`_data/book.yml` `parts`) is grouped by these modes, and the **folder
layout mirrors them** (per language):

```
fr/
  index.md                 (home — router)
  tutorials/               Learn   — getting-started, customisation, contributing
  explanation/             Understand
    pipeline/              the 5 phases + overview + team + fil-rouge (narrative)
    deep-dive/             outside-in-tdd, walking-skeleton, review-before-review
    architecture, concepts, clean-architecture, hve-core, hve-vs-skraft,
    traces, for-executives, pourquoi-review-avant-review
  reference/               Look up — agents/, skills/, gates, lens, patterns,
                           citations, glossaire, changelog
```

A new page must declare which mode it belongs to and live in the matching folder.
The Starbucks fil rouge is **narrative**, so it lives under `explanation/pipeline/`,
not `tutorials/`.

## 2. The fil rouge is the artifact flow

The thread that ties the handbook together is **"each artifact becomes the context
of the next phase"**:

```
issue triée → story INVEST → ADR + modèle d'événements → scénario Gherkin → code + evidence
DISCOVER   →  DISCUSS      →  DESIGN                    →  DISTILL          →  DELIVER
```

Make this chain visible — do not leave phases described in isolation.

## 3. Running example — Starbucks (illustrative)

Use **one single running example across all phases**: ordering and paying for a
drink in the Starbucks mobile app.

- Keep it generalist and self-explanatory (no domain expertise required).
- It is **illustrative, invented for teaching** — it is NOT derived from the
  codebase. Mark it as such (e.g. "exemple illustratif" / "illustrative example")
  so readers never confuse it with attested facts from the plugin.
- Never invent metrics or numbers for it. Qualitative only.
- Do not introduce a second competing example. Starbucks is the only fil rouge.

Per-phase artifact the example produces:

| Phase | Artifact (entrée → sortie) |
|-------|----------------------------|
| DISCOVER | raw issue "enable mobile ordering" → triaged & prioritised |
| DISCUSS | INVEST story "order a customised drink" + ≥3 acceptance criteria |
| DESIGN | ADR (payment) + event model `PlaceOrder` → `OrderPaid` |
| DISTILL | Gherkin Given cart / When payment / Then receipt |
| DELIVER | RED→GREEN commits + mutation score |

## 4. Connectors required on every pipeline phase page

Each `docs/site/{fr,en}/explanation/pipeline/{phase}.md` MUST include:

1. A **"vous êtes ici" / "you are here" ribbon** at the top showing
   `DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER` with the current phase
   highlighted (use `{% include phase-ribbon.html current="<phase>" %}`).
2. A **"Ce qui entre / Ce qui sort"** ("What enters / What exits") block naming
   the upstream artifact consumed and the downstream artifact produced.
3. The **Starbucks fil-rouge box** showing what the example looks like at this phase.
4. The existing **"Les gates franchies ici" / "Gates crossed here"** block linking
   to the reference gates page (`{{ "/fr/reference/gates" | relative_url }}`).

## 5. FR/EN parity is mandatory

- Every page exists in BOTH `fr/` and `en/` with the **same basename**
  (exceptions already in `_data/book.yml`).
- Content is equivalent in both languages — same sections, same example, same
  artifact flow. Do not let one language drift ahead.

## 6. Links and citations (existing rules — keep green)

- Internal links use `{{ "/fr/…" | relative_url }}` — never a bare `/fr/…`
  (the baseurl `/skraft-plugin` must be applied, or the link 404s).
- Any factual claim in an Explanation page carries a citation in the format:
  `> « quote ≤25 words »` then `> — Author, *Title*, Year.` where author+year
  exist in `_data/citations.yml`. The Starbucks example is exempt (it is fiction).
- Catalogue/reference pages follow the `catalogue_template` block contract from `_data/book.yml`.

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
