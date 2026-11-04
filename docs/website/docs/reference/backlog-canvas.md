---
title: "Backlog canvas and story map"
description: "Each part of the skraft backlog canvas (header, counters, stories, review, handoff actions) and of story-map.md: what it holds, how to read it, when to act."
persona: tech-lead
---

# Backlog canvas and story map

The *skraft backlog* canvas shows a `skraft-prd-backlog` run as it writes and reviews stories; `story-map.md` is the slicing it works from.

Why the run stops for a human, and where the planning lenses fit: [The backlog](../explanation/backlog.md).

:::note[About the figures]
The canvas follows the PRD's language. The figures come from a run on a PRD written in French, so their labels are French (*Suivi* = Progress, *Revue* = Review, *retenue* = held back, *prête* = ready); the text names the English labels.
:::

## Header <!-- #header -->

**Holds**: the backlog's slug (a selector when the workspace has several), the **Progress** and **Review** tabs, `n/n FR covered · n deferred`, the verdict counts of all stories (passing, warning, failing), and the target repository.

**Read it to** know which backlog is open, whether every functional requirement of the PRD is carried by a story, and how many stories pass.

**Act when** requirements are deferred (`n deferred`) or stories fail: open the **Review** tab.

![Header of the canvas: backlog "assistant-event-storming", tabs Suivi and Revue, "16/16 FR couvertes · 0 reportées", verdicts 1 passing, 13 with a warning, 2 failing, repository SebastienDegodez/skraft-demo-event-storming](/img/screenshots/fr/backlog-canvas-header.png)

*Figure 1 — The header of a real run; the demo PRD is written in French, so the canvas reads in French; [demo repository](https://github.com/SebastienDegodez/skraft-demo-event-storming).*

## Progress tab <!-- #progress-tab -->

### Counters <!-- #counters -->

**Holds**: eight figures: epics, stories, files written (`written/stories`), refused, held back, ready, reviewed (`reviewed/ready`), published. Below, one bar with a segment per stage and its legend. Refused and held-back figures turn red and amber when not zero. Ready, reviewed and published stay dimmed with "after the creation plan" until the run has produced that plan.

**Read it to** see how far the backlog is from GitHub: *refused* (the writer's file failed its checks), *held back* (the file passes but waits on a refused story or leaves open questions), *ready* (waiting for a human review), *reviewed*, *published*.

**Act when** *refused* or *held back* is not zero: fix them (see [Corrections and questions](#corrections)) before the handoff.

![Counters: 3 épics, 16 stories, 16/16 fiches écrites, 0 refusée, 4 retenues, 12 prêtes, 0/12 relue, 0 publiée; the bar: 12 prêtes à relire, 4 retenues](/img/screenshots/fr/backlog-canvas-counters.png)

*Figure 2 — The counters and the stage bar of a real run; the demo PRD is written in French, so the canvas reads in French; [demo repository](https://github.com/SebastienDegodez/skraft-demo-event-storming).*

### Agents at work <!-- #agents -->

**Holds**: while the run is in ELABORATE, a line "n agents at work" with one `story-writer` per story, its attempt and how long it has run.

**Read it to** know the run is alive and which stories are being written.

**Act when** never: wait. The view fills in as the workflow writes. An example is in [Turn a PRD into a GitHub backlog](../how-to/prd-to-backlog.md), Figure 1.

### Stories <!-- #story-list -->

**Holds**: filter chips (All, To review, Refused, Held back, Ready, Published, Questions, each with its count) and a search by id or title. Then one framed card per epic: its verdict (`approved`, `needs rework`, `rejected`, `not reviewed yet`) and the attempt of its lens review, its outcome, *Done when*, the findings on the epic itself, and a strip with one cell per story. Per story: verdict icon, id, title, `TRACER` for the epic's tracer bullet, FR ids, `after <story>` (what it waits on), milestone, one bar of six INVEST then eight Definition of Ready ticks, status, points, MoSCoW, and the count of open questions when there are some.

**Read it to** find the stories to look at: red or amber ticks point at the INVEST letter or DoR item that fails.

**Act when** a story is refused or held back: click it, the **Review** tab opens on it.

![Story list: filters Toutes 16, À relire 12, Refusées 0, Retenues 4, Prêtes 12, Publiées 0, Questions 15; epic EP-001 rejetée at attempt 3 with its outcome and done-when; S01 ready with a warning and 3 questions, S02 ready, S03 held back](/img/screenshots/fr/backlog-canvas-story-list.png)

*Figure 3 — The stories of epic EP-001 in a real run; the demo PRD is written in French, so the canvas reads in French; [demo repository](https://github.com/SebastienDegodez/skraft-demo-event-storming).*

## Review tab <!-- #review-tab -->

### Reasons and INVEST <!-- #review-reasons -->

**Holds**: for the story in focus: title, id, epic, milestone, MoSCoW, points, the statement (As / I want / so that), a dock with its state, the tick index, **Answer n** and **Mark reviewed**, the anti-patterns detected (Vague Persona, No Examples, Technical AC…), the reasons a held story is held, then the INVEST and Definition of Ready checklists. Each line gives what was found (a quote, a count, a dependency) and, when it fails, opens to *why* and *Fix*. Below: the lens findings and the story sheet.

**Read it to** learn why a story does not pass and what to change.

**Act when** a line is red or amber: open it, read *Fix*, then *See in the sheet* to land on the passage.

![Review of story EP-001-S05 "Attribuer un rôle applicatif", retenue: statement, tick bar, button Répondre 2, three reasons for the hold, Indépendante waiting on EP-001-S01 and EP-001-S02, Négociable passing](/img/screenshots/fr/backlog-canvas-review-reasons.png)

*Figure 4 — The review of a held story in a real run; the demo PRD is written in French, so the canvas reads in French; [demo repository](https://github.com/SebastienDegodez/skraft-demo-event-storming).*

### Corrections and questions <!-- #corrections -->

**Holds**: the corrections the review offers for a story (split it, declare a dependency, sharpen a criterion), and its open questions. A question lists proposed answers and a free field; **Save** keeps the answer as a draft, **Withdraw** removes it.

**Read it to** see what the writer cannot settle alone.

**Act when** a held story has questions: pick or write the answers (**Answer n** in the dock), then run `skraft-prd-backlog` again with `corrections true`. The writer folds the drafts into the story files; only the stories touched are rewritten and reviewed.

## Handoff actions <!-- #handoff -->

**Holds**: a footer with `n/n ready stories reviewed`, the count of open questions (a link to the first story that has some), the target repository (`to owner/repo`), and three buttons: **Mark reviewed** (in each story's dock), **Dry run** and **Create the issues** (**Create n issues** once a selection exists).

**Read it to** know what a creation would do: the dry run lists what would be created, linked or already exists.

**Act when** the run pauses on the handoff: review each ready story, run **Dry run**, then **Create the issues**. Creation makes exactly the last dry run, which expires after 15 minutes, and refuses a selection that changed since. These actions belong to a person: the agent can read, explain and preview, never mark a story reviewed nor create.

![Footer: "0/12 prêtes relues", "30 questions ouvertes", "vers SebastienDegodez/skraft-demo-event-storming", buttons Aperçu à blanc and Créer les issues](/img/screenshots/fr/backlog-canvas-handoff-actions.png)

*Figure 5 — The handoff footer of a real run; the demo PRD is written in French, so the canvas reads in French; [demo repository](https://github.com/SebastienDegodez/skraft-demo-event-storming).*

## story-map.md <!-- #story-map -->

The slicing the run writes in `.copilot-tracking/skraft-plans/<slug>/backlog/` before the stories, and the second human stop. Edit `story-map.json`, never the `.md`: the workflow renders it again on resume.

| Section | Holds |
|---|---|
| Milestones | `Milestone`, `Title`, `Due`, `Stories`, `Points` |
| Build order | one row per story, in the order to build: `# \| Story \| Epic \| Milestone \| MoSCoW \| Points \| Waits on \| Covers` |
| Epics | per epic: its title, outcome and *done when* checklist |

`(tracer)` after a story id marks the tracer bullet of its epic. `Waits on` lists the stories that must come first (`—` for none); `Covers` lists the requirement ids it carries.

From the demo PRD, written in French:

```markdown
| # | Story | Epic | Milestone | MoSCoW | Points | Waits on | Covers |
|---|-------|------|-----------|--------|--------|----------|--------|
| 1 | EP-001-S01 (tracer) — Créer une séance depuis le modèle Big Picture | EP-001 | M1 | must | 3 | — | FR-004 |
| 2 | EP-001-S02 — Rejoindre une séance par code | EP-001 | M1 | must | 2 | EP-001-S01 | FR-002 |
| 3 | EP-001-S03 — S'authentifier via le fournisseur SSO de l'organisation | EP-001 | M1 | must | 3 | — | FR-001 |
```

## See also <!-- #see-also -->

- [Turn a PRD into a GitHub backlog](../how-to/prd-to-backlog.md)
- [Refine a backlog issue](../how-to/refine-backlog.md)
- [Gates: DISCUSS](./gates.md#discuss)
