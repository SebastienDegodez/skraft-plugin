---
name: story-elaboration
description: Use when one story of an approved story map must be written in full before design — the story file the skraft-prd-backlog workflow checks against the Definition of Ready and the planning lenses review. Covers what the map fixes, reading the PRD passages the story covers, domain examples, Given/When/Then criteria traced to examples and requirement ids, tasks, the dev notes a builder needs without reading the whole PRD, and the story-file schema.
---

# Story Elaboration

You write one story file from its entry in the approved story map. A script checks it against
the Definition of Ready, then four planning lenses review its epic.

Load `issue-refinement` and follow it for everything about the story itself: the story format and
persona, INVEST, domain examples with real values, Given/When/Then criteria derived from the
examples, the 8 DoR items, the 8 antipatterns and the effort scale. This skill adds only what the
file must hold and how it stays inside the approved map.

## What the map fixes

The map entry is approved: keep its `id`, `epic`, `covers`, `after` and `milestone`.

- Every id in `covers` is carried by at least one criterion's `covers`.
- `dependencies` lists exactly the stories of `after`, each with the reason it waits; add none,
  drop none. A dependency you believe is missing goes in `openQuestions`.
- `effort.points` may differ from the map's estimate (1, 2, 3, 5 or 8). Above 8, write the
  story anyway and say in `openQuestions` how to split it.

## Read before writing

For each id in `covers`, read in the PRD: the FR statement and its fields, the `AC-###` the FR
lists, the `NFR-###` thresholds and the `DD-###` decisions it cites, the persona of its actor.
Write only what those passages state. A detail the PRD leaves open goes in `openQuestions`,
never into a criterion.

## What the file adds to `issue-refinement`

- `examples`: at least 3, one of them an edge or refusal case; reuse the values of the PRD's
  `AC-###` when they exist. Each has an `id` the criteria point at.
- `acceptanceCriteria`: 3 to 7, each with `example` (the example it derives from) and `covers`
  (the PRD ids it proves).
- `tasks`: the work in build order; each names the criteria it serves; every criterion is served.
  Tests are part of each task, never a task of their own.
- `devNotes.context`: what a builder needs to know without reading the whole PRD — the
  decisions, thresholds, boundaries and behaviour that must not change.
- `devNotes.references`: one line per PRD id the builder should open, with why.
- `devNotes.testing`: how each criterion is proven (the acceptance test at the use-case boundary,
  the NFR measurement).
- `technicalNotes`: `["None identified"]` when there is none.
- `effort.rationale`: one sentence (criteria count, integrations, unknowns).
- `openQuestions`: optional; what the PRD leaves open.

Write in the language of the PRD. The exact shape is in
[story-file-schema.md](references/story-file-schema.md). When the workflow sends the file back
with problems or review findings, fix exactly those and change nothing else.

Sources: the dev notes and task traceability paraphrase the BMAD-METHOD story guidance
(<https://github.com/bmad-code-org/BMAD-METHOD>, MIT).
