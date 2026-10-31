---
title: "First existing repository"
description: "Under GitHub Copilot CLI, have the brownfield analyst describe undocumented code, then turn its PRD into a backlog reviewed in the skraft backlog canvas."
persona: tech-lead
---

# First existing repository

In this tutorial, you start from a small existing codebase, with no tests and no documentation.
The `brownfield-analyst` agent draws a PRD from it; the `skraft-prd-backlog` workflow cuts that PRD
into epics and stories; you review the ready stories in the **skraft backlog** canvas. At the end,
the canvas shows your backlog, each ready story marked reviewed, and nothing is published to
GitHub yet.

One path; each step says what you should see. The agents are real: expect it to take a while and
to use Copilot credits.

:::info[Before you start]

- **Node 22** or later, and **Git**;
- **GitHub Copilot CLI**, signed in, in a client that shows canvases.

:::

## 1. Create the existing code {#1-create-the-existing-code}

In a terminal, create the `permis` folder:

```console
$ mkdir permis
$ cd permis
$ git init -b main
```

`package.json`:

```json
{
  "name": "permis",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

`src/eligibility.js`, the rule an insurance service applies to young drivers:

```js
const decisions = new Map()
const DAY = 24 * 60 * 60 * 1000

const ageOn = (birth, today) => {
  const age = today.getFullYear() - birth.getFullYear()
  const birthday = new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
  return today < birthday ? age - 1 : age
}

export const decide = (driver, today = new Date()) => {
  const decision = ageOn(new Date(driver.birthDate), today) >= 18
    ? { eligible: true }
    : { eligible: false, reason: 'âge minimum 18 ans' }
  decisions.set(driver.id, { ...decision, at: today })
  return decision
}

export const lastDecision = (driverId, today = new Date()) => {
  const kept = decisions.get(driverId)
  return kept && today - kept.at <= 30 * DAY ? kept : null
}
```

Commit:

```console
$ git add .
$ git commit -m "Eligibility as it runs today"
```

`git log --oneline` shows a single commit. The repository has no tests, no documentation and no
backlog: it is your existing code.

## 2. Install the plugins {#2-install-the-plugins}

```console
$ copilot plugin marketplace add SebastienDegodez/skraft-plugin
$ copilot plugin install skraft@skraft
$ copilot plugin install skraft-brownfield@skraft
$ copilot plugin install skraft-backlog@skraft
$ copilot plugin list
```

The three plugins are in the list.

## 3. Have the analyst describe the code {#3-have-the-analyst-describe-the-code}

Open a Copilot session in `permis` (`copilot`), type `/agent`, choose
`skraft-brownfield:brownfield-analyst`, then write:

```text
Analyze this repository and draft its PRD. Product: "Young drivers eligibility".
```

The analyst reads the structure, the manifest and the code. Each claim it writes is a **FACT** (read
by a tool) or an **INFERENCE** with its confidence (High, Medium, Low). It files its
characterization artifacts under
`.copilot-tracking/skraft-plans/<project>/characterization/<YYYY-MM-DD>/` and reads the verdict of
its confidence gate in `index.md`.

The repository has no tests: expect the **CONCERNS** verdict. The analyst then shows you its
validation checklist, every Low-confidence claim and every core feature without coverage, and
waits. Read it: the 18-year rule and the 30-day retention should be on it. Answer:

```console title="Copilot CLI"
> Confirmed.
```

:::note[Screenshot pending a real run]

A capture of the analyst's session, its validation checklist then your answer, needs a real
Copilot CLI session. Until then, the block above shows what you type.

:::

The analyst composes the PRD, then gives you its path under `docs/prds/`, the characterization and
schema gate verdicts, and the number of open questions. Open the PRD: its functional requirements
carry the ids `FR-001`, `FR-002`…, its non-functional requirements `NFR-…`. Commit it:

```console
$ git add docs/prds
$ git commit -m "docs: PRD from the existing code"
```

## 4. Cut the PRD into a backlog {#4-cut-the-prd-into-a-backlog}

In the same session, write, with the path the analyst gave you:

```text
Run the skraft-prd-backlog workflow with prd docs/prds/<name>.md and frame false.
```

`frame false` slices without the framing questions. Follow the run in `/workflows`: a script lists
every id of the PRD, then `backlog-slicer` writes the story map, which scripts check (every FR
covered, one tracer story per epic, acyclic dependencies).

The run pauses on the map. Open `.copilot-tracking/skraft-plans/<name>/backlog/story-map.md`: the
epics, their stories and their milestones. It suits you: resume the run from `/workflows`.

One `story-writer` per story writes each story in full; a script checks it against the Definition
of Ready; the four planning lenses review each epic. The run pauses again, at the handoff:
**nothing is published until a human has reviewed it**.

## 5. Review the backlog in the canvas {#5-review-the-backlog-in-the-canvas}

Ask Copilot:

```text
Open the skraft backlog canvas.
```

The canvas opens on the **Progress** tab:

![skraft backlog canvas, Progress tab: the key figures (2 epics, 4 stories, 1 refused, 1 held back, 2 ready, 0/2 reviewed), the bar of stories by stage, then epic EP-001 with its review verdict, its expected outcome and its three stories](/img/screenshots/en/backlog-canvas-progress.png)

*Figure 1 — The Progress tab: each epic in its own frame, with its planning-review verdict and its
stories. Captured on the canvas test workspace (an eligibility PRD close to yours, written in
French); your figures and stories depend on your PRD.*

Read the top row: how many stories are **ready**, **held back** by the review, or **refused** by
the checks. Click a refused story: the **Review** tab opens it as a checklist.

![skraft backlog canvas, Review tab: story EP-001-S02 refused, its Vague Persona, No Examples and Technical AC defects, then the six INVEST letters, each with the value found](/img/screenshots/en/backlog-canvas-review.png)

*Figure 2 — The Review tab: each INVEST letter and each Definition of Ready item with what was
found; a failing line says why and how to fix it.*

A refused or held-back story is not published: the checklist tells you what it lacks. Now open each
**ready** story, read its sheet, and click **Mark reviewed**. The bottom bar counts your reviews:
when it shows as many reviewed stories as ready ones, your first backlog is reviewed.

The workflow stays paused and nothing is created on GitHub: creation goes through the canvas's
**Create the issues** button, or through the Human Review box of `handoff.md` and then resuming the
run, when you decide to.

## What you built {#what-you-built}

The `permis` repository now has a PRD drawn from its code and a backlog of epics and stories, each
ready story reviewed by you, with nothing published yet. On the way, you learned that:

- `brownfield-analyst` describes existing code, telling facts from inferences, and asks you to
  validate what it could not prove before writing the PRD;
- the `skraft-prd-backlog` workflow cuts a PRD into epics and stories, checked by scripts then by
  four lenses, and stops twice for you;
- the skraft backlog canvas shows why each story is ready, held back or refused, and you are the one
  who marks it reviewed.

## Next steps {#next-steps}

- [The backlog: from idea to ready story](../explanation/backlog.md) — why each check and each lens exists.
- [Brownfield journey](../explanation/brownfield.md) — the characterization safety net, then Mikado or Strangler Fig refactoring.
- [First run under GitHub Copilot CLI](./first-run-copilot.md) — then take one story to its pull request.
