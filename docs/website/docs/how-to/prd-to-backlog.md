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
- The PRD in the repository, as the tool that wrote it left it (skraft, HVE `prd-builder`, BMad
  or by hand): skraft reads it and never rewrites it.
- No `skraft-config.json`: `skraft-backlog` reads no key of it, so it runs in a repository `/skraft-init` never touched. The refusal `skraft is not initialised` belongs to the engineering pipeline alone.

## 1. Check the PRD

```markdown
### EP-001 : Online ordering

* `FR-001` : The customer picks a drink and its size.
* `FR-002` : The customer pays for the order by card.
```

A requirement is defined where its id opens a heading, a bullet, a line, a bold run or the first
cell of a table row: `` * `FR-001` : … ``, `FR-001: …`, `**FR-1 Title.** …`, `| FR-001 | … |`.
An id that only appears in a list or a traceability matrix is a reference. Besides `FR`, `US`
counts as a requirement, and an HVE PRD's frontmatter (`requirement_id_prefixes`) adds its own
prefixes.

Epics come from the PRD when it proposes them: `### EP-001 : …` headings, `FEAT-###` features,
or the headings under a features section. When it proposes none, the framing explains the cut to
the product owner: one epic per capability delivered and deployed together (a bounded context is
an epic only when it deploys on its own). An FR belongs to the epic it sits under. A PRD in
draft, or one naming an FR it never defines, becomes a framing question: the PRD is never
changed. A PRD with no requirement at all is refused.

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
| `format` | `hve`: read the requirement families an HVE PRD declares; default: detected |
| `forge` | `github` or `azure-devops`; default: from the git remote. With `azure-devops`, `repo` is `organization/project` |
| `corrections` | `true`: apply the corrections accepted in the canvas (step 5) |

Any other key is refused (`invalid-args`) and nothing starts. The working files are under
`.copilot-tracking/skraft-plans/<slug>/backlog/`.

## 3. Answer the framing, then approve the map

The run stops three times before it writes the stories. After each answer, resume the paused workflow
from `/workflows`.

1. **Framing** (`framing-answered`): the questions are in `framing.json` (how to slice channels,
   milestones, epics that are too dense, the slicer's questions). Answer in the *skraft backlog*
   canvas (ask Copilot to *"open the skraft backlog canvas"*), or write the answer in
   `framing.json`, under `answers`, by question id:

   ```json
   "answers": { "milestones": { "text": "M1: order at the counter, M2: payment" } }
   ```

   A question left unanswered takes its recommended option.
2. **Epics** (`story-map-approved`): read `story-map.md`. The slicer has cut the PRD into epics
   only, with what each covers and the milestones; no story yet. To change the cut, edit
   `story-map.json`: the resume checks it again as it reads now. Its tables: [story-map.md](../reference/backlog-canvas.md#story-map).
   A plan the HVE planner left for the PRD gives the epics the slicer starts from; each one it
   does not follow has a line in **Decisions**.
3. **Stories** (`stories-approved`): each epic of the run (`epics`, default all) is cut into
   stories by a fresh agent, one epic after the other. Read `story-map.md` again, edit
   `story-map.json` if needed, resume.

## 4. Let the stories be written and reviewed

One `story-writer` per story, then the four planning lenses, epic by epic. Follow progress in the
canvas, **Progress** tab (**Suivi** for a French PRD: the canvas follows the PRD's language):
each story is approved, refused, or held back because it waits on a refused story. The
**Review** tab says why a story does not pass and how to fix it. Each counter, status and tab: [Backlog canvas](../reference/backlog-canvas.md#progress-tab).

![skraft backlog canvas, Suivi tab, during ELABORATE: "8 agents au travail", one story-writer per story with its attempt and how long it has run, then 3 epics, 16 stories, 9/16 written, none refused yet](/img/screenshots/fr/backlog-canvas-elaborate.png)

*Figure 1 — ELABORATE on an extract of a real PRD, written in French ([demo repository](https://github.com/SebastienDegodez/skraft-demo-event-storming)): eight `story-writer` agents at work.*

**For the product owner: work one epic at a time, in a fresh session.** On a large PRD, approve the
epics once, then cut and elaborate one epic per run, each run in a new Copilot session so that
its context starts clean: `epics: ["EP-001"]`, then `["EP-002"]`… The map stays the reference: each
run reuses `story-map.json` and `framing.json` as they are (resume the epics pause unchanged), and
creates as soon as its epic is ready. A story an earlier session published counts as ready: a
story waiting on it is not held back.

Re-slice regularly, when the PRD or what the team learned changes the cut: delete `story-map.json`
(and `framing.json` to be asked the framing again), then run again in a new session. Issues
already created are never changed nor closed, and a story the new map renames is created again:
re-slice only the epics not yet published.

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

## Publish to Azure DevOps Boards

With a git remote on `dev.azure.com` (or `forge: azure-devops` and `repo: organization/project`),
the same run publishes to Azure Boards through `az`. The process of the project decides the
cards:

| Process | PRD | Epic of the map | Story |
|---|---|---|---|
| Agile | Epic | Feature | User Story |
| Scrum | Epic | Feature | Product Backlog Item |
| CMMI | Epic | Feature | Requirement |
| Basic | — | Epic | Issue |

Each story is the child of its Feature and the successor of the stories it waits on
(`Predecessor` link); its priority, effort and status are tags, never Story Points or Priority.
The handoff is under `.copilot-tracking/workitems/prds/<slug>/handoff.md`.

### Sign in

You sign in, once, in your own terminal, before you start the run — as `gh auth login` for
GitHub. skraft never signs in, never asks for a token and never reads one: it calls `az`, which
uses your session. No personal access token (PAT) is needed on a developer machine.

```bash
az extension add --name azure-devops
az login
```

The run checks the access before any agent works: signed out, it stops at once and says to run
`az login`. A PAT is only for a guest user of the organization, for whom only
`az devops login --organization https://dev.azure.com/<org>` works (you paste the PAT when it asks;
`az` keeps it), or for an automation, where `az` reads it from the `AZURE_DEVOPS_EXT_PAT`
environment variable; in Azure Pipelines prefer a service connection. Either way you run it, not
skraft. The signed-in account creates work items in the project
(Contributors), and creates iterations only if you check the box below (a right often kept for
project administrators).

### Iterations

A milestone is an iteration that already exists, matched by name. A missing one is created only
if you check `Create the missing iterations` in the handoff, and only with the right to create
iterations. Otherwise, or when the creation is refused, its cards carry the tag
`milestone/<title>` and the result names the iterations to create by hand. The canvas does not
create Azure Boards cards: the workflow does, at its handoff.

## Troubleshooting

| Message | Action |
|---|---|
| `Azure DevOps: pass args.repo as organization/project, …` | Pass `repo: organization/project`, or run from a working copy whose remote is on `dev.azure.com`. |
| `az cannot read the Azure DevOps project: sign in once in a terminal with az login …` | Run `az login` in your terminal (or set `AZURE_DEVOPS_EXT_PAT` in an automation), check the `azure-devops` extension and `repo`, then run again. |
| `az: … failed` | The session expired or a right is missing: `az login` again, then resume. |
| `args.prd: the PRD defines no functional requirement — …` | Check that each requirement id opens its line, bullet, heading, bold run or table row; for an HVE PRD with prefixes of its own, pass `format: hve`. The PRD itself is never rewritten. |
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
