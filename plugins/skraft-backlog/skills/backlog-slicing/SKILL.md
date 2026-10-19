---
name: backlog-slicing
description: Use when an approved PRD must be cut into epics and stories before any story is written — the story map the skraft-prd-backlog workflow checks and a human approves. Covers epic boundaries, the tracer bullet, real prerequisites versus restated order, milestones from the PRD's release plan, coverage of every requirement id, and the story-map.json schema.
---

# Backlog Slicing

You turn a PRD into a story map: epics, their stories in build order, milestones, and the
requirements you defer. You write one file, `story-map.json`; a script checks it and a human
approves it before any story is written. Write no story detail: one sentence per story.

## Inputs

- The PRD.
- `inventory.json`: every requirement id the PRD defines (`FR-###`, `NFR-###`, `AC-###`,
  `CON-###`, `GOAL-###`) with the epic heading each FR sits under. Every `FR` id must end up in
  one story's `covers` or in `deferred` with a reason. Never invent an id.

## Epics

- One epic per PRD epic heading (`EP-###`) when the PRD has them; keep its id and title.
  Without epic headings: one epic per capability delivered and deployed together.
- `covers`: every id its stories cover, plus the NFR and CON ids that bind it.
- `outcome`: one sentence — for whom, what changes.
- `doneWhen`: 2 to 5 end checks, one of them production delivery.
- Order epics as they are built: the platform baseline (setup, CI, deployment) is the first epic
  or the first stories of the first epic.

## Stories

- A story is one step toward its epic's `doneWhen`, sized for one engineer in one to three days:
  `effort` 1, 2, 3, 5 or 8. Above 8, split it; never shrink it ("for now", "placeholder",
  "simplified", "wired later" is a second story).
- The first story of each epic is its **tracer bullet** (`tracer: true`): the thinnest path
  through every layer the epic touches, demonstrable when done. Then the story you are least sure of.
- `covers`: the FR, NFR and AC ids this story delivers. Split an FR across stories only when each
  delivers a distinct part; say which part in its `description`.
- `persona`: the specific role from the PRD's personas who benefits — never "user" or a developer.
- `description`: one sentence, what works when done.
- `moscow`: `must` for the PRD's MUST requirements, `should`, `could` otherwise.
- `milestone`: the release slice it ships in (see Milestones).
- 8 to 12 stories per epic is typical; past 12, propose a split of the epic in `decisions`.

## Dependencies (`after`)

- `after` lists only real prerequisites: a story that needs data, a decision or code another
  story produces. Never restate the build order; never add a dependency "to be safe".
- A dependency runs one way: never two stories waiting on each other, never a cycle. When two
  stories need each other, merge them or extract the shared part into an earlier story.
- A story never waits on a story of a later milestone.
- Stories touching the same code form one ordered lane; a contract two lanes share is its own
  early story.

## Milestones

- One milestone per release slice of the PRD (lots, phases, increments). Without one, cut by
  demonstrable user journey segment.
- `id`: short and stable (`L1`); `title`: `v{major}.{minor}-{theme}` (`v0.1-socle`); `dueOn`:
  `YYYY-MM-DD` when the PRD dates it; `description`: one sentence.

## Deferred and decisions

- `deferred`: `{ "id": "FR-191", "reason": "…" }` only when the PRD itself defers the
  requirement or places it after this backlog's release; quote the PRD's reason.
- `decisions`: one dated line per slicing choice, the tracer bullet of each epic included:
  `"2026-10-19 Decision: …"`.

## Schema

The exact shape is in [story-map-schema.md](references/story-map-schema.md). Keep every id you
were given; when the workflow sends the map back with problems, fix exactly those and change
nothing else.

Sources: slicing rules paraphrase the BMAD-METHOD product-owner slicing guidance
(<https://github.com/bmad-code-org/BMAD-METHOD>, MIT) and the HVE functional planner
(<https://github.com/microsoft/hve-core>, CC BY 4.0).
