---
title: "Turn a PRD into a GitHub backlog"
description: "Run skraft-prd-backlog on an approved PRD, answer the framing, approve the story map, validate the handoff, publish to GitHub with no duplicate."
persona: tech-lead
---

# Turn a PRD into a GitHub backlog

Go from an approved PRD to ready epics and stories on GitHub, with their dependencies and
milestones.

## Prerequisites

- Copilot CLI with the `skraft-backlog` plugin installed
  ([Install skraft on a host](./install-on-a-host.mdx)). The
  `skraft-prd-backlog` workflow is a Copilot CLI dynamic workflow.
- `gh` signed in (`gh auth status`) with the right to create issues, labels and milestones on
  the target repository.
- The PRD in the repository, written on the canonical template: each requirement as a bullet
  `` * `FR-001` : <statement> `` (likewise `NFR-`, `AC-`, `CON-`, `GOAL-`), each epic as a
  heading `### EP-001 : <title>`.
- No `skraft-config.json`: `skraft-backlog` reads no key of it, so it runs in a repository `/skraft-init` never touched. The refusal `skraft is not initialised` belongs to the engineering pipeline alone.

## 1. Check the PRD

```markdown
### EP-001 : Online ordering

* `FR-001` : The customer picks a drink and its size.
* `FR-002` : The customer pays for the order by card.
```

An `FR` requirement belongs to the epic of the heading above it. A PRD with no `FR-###`
requirement is refused.

## 2. Start the workflow

Ask Copilot CLI, with the PRD's path:

```text
Run the skraft-prd-backlog workflow with prd docs/prds/online-ordering.md
```

| Argument | Effect |
|---|---|
| `prd` (required) | the PRD's path |
| `slug` | kebab-case name of the backlog; default: the PRD file name |
| `repo` | `owner/repo` to publish to; default: the repository of the working directory |
| `epics` | elaborate only these epics, for example `["EP-001"]` |
| `approve` | `true`: no slicer questions in the framing, no pause on the story map |
| `dryRun` | `true`: simulate the publication |
| `frame` | `false`: slice without framing questions |
| `corrections` | `true`: apply the corrections accepted in the canvas (step 5) |

Any other key is refused (`invalid-args`) and nothing starts. The working files are under
`.copilot-tracking/skraft-plans/<slug>/backlog/`.

## 3. Answer the framing, then approve the map

The run stops twice before it writes the stories. After each answer, resume the paused workflow
from `/workflows`.

1. **Framing** (`framing-answered`): the questions are in `framing.json` (how to slice channels,
   milestones, epics that are too dense, the slicer's questions). Answer in the *skraft backlog*
   canvas (ask Copilot to *"open the skraft backlog canvas"*), or write the answer in
   `framing.json`, under `answers`, by question id:

   ```json
   "answers": { "milestones": { "text": "M1: order at the counter, M2: payment" } }
   ```

   A question left unanswered takes its recommended option.
2. **Story map** (`story-map-approved`): read `story-map.md`. To change the slicing, edit
   `story-map.json`: the resume checks it again as it reads now. Its tables: [story-map.md](../reference/backlog-canvas.md#story-map).

## 4. Let the stories be written and reviewed

One `story-writer` per story, then the four planning lenses, epic by epic. Follow progress in the
canvas, **Progress** tab (**Suivi** for a French PRD: the canvas follows the PRD's language):
each story is approved, refused, or held back because it waits on a refused story. The
**Review** tab says why a story does not pass and how to fix it. Each counter, status and tab: [Backlog canvas](../reference/backlog-canvas.md#progress-tab).

![skraft backlog canvas, Suivi tab, during ELABORATE: "8 agents au travail", one story-writer per story with its attempt and how long it has run, then 3 epics, 16 stories, 9/16 written, none refused yet](/img/screenshots/fr/backlog-canvas-elaborate.png)

*Figure 1 — ELABORATE on an extract of a real PRD, written in French ([demo repository](https://github.com/SebastienDegodez/skraft-demo-event-storming)): eight `story-writer` agents at work.*

## 5. Fix a held story (if needed)

In the canvas, accept one of the corrections offered for the story (split it, declare a
dependency, sharpen a criterion…) or answer its open questions, then run again:

```text
Run the skraft-prd-backlog workflow with prd docs/prds/online-ordering.md and corrections true
```

![skraft backlog canvas, Revue tab: story EP-001-S05 "Attribuer un rôle applicatif" held back, the three reasons of its review, a "Répondre 2" button for its open questions, then the INVEST letters, each with the value found; on the left the stories of EP-001, two ready and three held back](/img/screenshots/fr/backlog-canvas-handoff-review.png)

*Figure 2 — A held story of the same run: the review says why, and its two open questions wait
for an answer.*

Only the stories touched are rewritten and reviewed. With no accepted correction and no pending
answer, the run is refused and nothing changes.

## 6. Validate the handoff and publish

When the run pauses on the handoff, the canvas sums up the backlog:

![skraft backlog canvas, Suivi tab, at the handoff: 3 epics, 16 stories, 16/16 written, 0 refused, 4 held back, 12 ready, 0/12 reviewed, 0 published, then epic EP-001 rejected at attempt 3 and its stories, ready or held back; at the bottom the "Aperçu à blanc" and "Créer les issues" buttons towards SebastienDegodez/skraft-demo-event-storming](/img/screenshots/fr/backlog-canvas-handoff-progress.png)

*Figure 3 — The handoff of the demo run: 12 stories ready to create, 4 held back.*

The run stops on `.copilot-tracking/github-issues/prds/<slug>/handoff.md` (`handoff-reviewed`).
Read the planned operations, then check the box:

```markdown
> - [x] Reviewed and validated by a qualified human reviewer
```

Resume the workflow. To see first what would be created, run it with `dryRun true`: it writes
`handoff-dryrun.md` alongside. Expected result in the workflow log:

```text
<owner/repo>: 14 created, 0 failed, 0 skipped
```

Every issue carries a hidden marker: running the workflow again creates nothing twice. The
canvas also lets you mark each story reviewed and create an epic as soon as it is ready
(**Mark reviewed**, **Dry run**, **Create the issues**); these actions belong to the person,
never to the agent.

## Troubleshooting

| Message | Action |
|---|---|
| `args.prd: the PRD defines no FR-### requirement` | Write the requirements as bullets `` * `FR-001` : … ``. |
| `agents not registered in this session: …` | Restart the Copilot session, or reinstall `skraft-backlog`, then run again. |
| `SLICE: N problem(s) left after 3 attempts` | Read the problems listed, fix `story-map.json` by hand, run again. |
| `args.epics: an epic it names is not in the story map` | Use the `EP-…` ids of `story-map.json`. |
| `check the Human Review box of …/handoff.md, then resume the run` | Check the box of step 6, resume. |
| `destination binding: <repo> answers as <other>` | Pass the repository's exact name in `repo` (a renamed or transferred repository answers under its new name). |
| Status `blocked` in PUBLISH, with `failed` or `skipped` | Resume: the publication goes on without creating again what exists; the detail is in `handoff-logs.md`. |

## Next steps <!-- #next-steps -->

- [Refine a backlog issue](./refine-backlog.md)
- [The backlog: from idea to ready story](../explanation/backlog.md) — why
  two human stops and planning lenses.
- [Gates: DISCUSS](../reference/gates.md#discuss) — the planning lenses'
  criteria.
