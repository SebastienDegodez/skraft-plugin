---
layout: doc
lang: en
title: "Getting started"
description: "Install SKRAFT V2, describe a small repository, and run one story from RESEARCH to its pull request description."
persona: software-engineer
---

# Getting started

> In this tutorial, you install SKRAFT, describe a small repository in `skraft-config.json`,
> and run the story "#42 Pay by card" through RESEARCH, DESIGN, DISTILL, DELIVER and PUBLISH.

You follow one path, from start to finish. Each step shows what you should see. A full run
starts real agents: expect it to take a while and to cost what your host charges for them.

## What you need

- **Node 22** or later, and npm;
- **Git**;
- **Claude Code** (for GitHub Copilot CLI or VS Code, see [On another host](#on-another-host)
  after the path).

## 1. Create the small repository

Create a `shop` folder, open a terminal in it and create the repository:

```text
git init -b main
```

Create `web/package.json`:

```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

Create `web/src/cart.js`:

```js
export const total = (prices) => prices.reduce((sum, price) => sum + price, 0)
```

Create `web/test/cart.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { total } from '../src/cart.js'

test('the total of a cart adds its prices', () => {
  assert.equal(total([2, 3]), 5)
})
```

The mutation gate runs StrykerJS. Install it in `web`:

```text
npm install --save-dev --prefix web @stryker-mutator/core @stryker-mutator/tap-runner
```

and create `web/stryker.config.json`:

```json
{
  "testRunner": "tap",
  "mutate": ["src/**/*.js"],
  "tap": { "testFiles": ["test/**/*.test.js"], "nodeArgs": ["--test-reporter=tap"] }
}
```

Add `node_modules/` and `reports/` to a `.gitignore` at the root of `shop`, record a first commit,
then work on a branch of your own:

```text
git add .
git commit -m "Start the shop"
git switch -c pay-by-card
```

## 2. Install the plugin

Open Claude Code in the `shop` folder. Type these two commands **in the conversation**, not in a
terminal:

```text
/plugin marketplace add SebastienDegodez/skraft-plugin
/plugin install skraft
```

Open `/plugin`: `skraft` appears under installed plugins.

**On Windows**, if `/plugin marketplace add` fails because of a path that is too long, clone the
repository to a short path, then add that clone:

```powershell
git clone https://github.com/SebastienDegodez/skraft-plugin C:\s\skraft
```

```text
/plugin marketplace add C:\s\skraft
/plugin install skraft
```

## 3. Write `skraft-config.json`

The `skraft` command line is a Node script shipped with the plugin. Run it from the root of your
repository, in sh or in PowerShell alike:

```text
node "<skraft plugin folder>/engine/drivers/cli/skraft.mjs" init
```

Replace `<skraft plugin folder>` with the folder where the host installed the skraft plugin. From
here on, `skraft …` means this full command.

`skraft init` looks for the projects in the repository and writes one **component** per project:
a part of the repository with its root, its stack, its paths and its commands. You see:

```text
skraft-config.json: web (javascript, web)
```

Open `skraft-config.json` at the root of `shop`:

```json
{
  "components": [
    {
      "name": "web",
      "root": "web",
      "stack": "javascript",
      "paths": {
        "src": ["src/"],
        "tests": ["test/"]
      },
      "commands": {
        "test": "npm test",
        "mutation": "npx stryker run --incremental --reporters json,clear-text"
      }
    }
  ]
}
```

`test` comes from the script in `web/package.json`; `mutation` is the StrykerJS default, which
writes its report where the engine reads it. `paths` is also the **write scope** of DELIVER: the
software engineer may write only in `web/src` and `web/test`. A JavaScript component mocks in
process by default, so it needs no Docker. Commit the file:

```text
git add skraft-config.json
git commit -m "chore: describe the shop for skraft"
```

## 4. Check with `skraft doctor`

`skraft doctor` checks that every command can run on your machine and shows what each agent will
run on:

```text
skraft doctor
```

You see, with your own paths and versions:

```text
ok    node: Node v22.…
ok    config: 1 components: web
ok    web/test: npm → /usr/local/bin/npm
ok    web/mutation: npx → /usr/local/bin/npx
ok    models/claude-code: every family the workflow's agents run on has a model on claude-code
WARN  models/copilot: no model on copilot for researcher (1 dispatch), planner (1 dispatch), reviewer (13 dispatches), standard (4 dispatches), implementer (3 dispatches), economy (1 dispatch); these run on the session's model
ok    vscode: …
models on claude-code:
  step             agent                         type     family       tier      model   effort  source (family/model/effort)
  research         solution-researcher           phase    researcher   standard  sonnet  -       agent/tier/host
  design           solution-architect            phase    planner      frontier  opus    -       agent/tier/host
  design_review    consistency-lens              lens     reviewer     economy   haiku   -       type/tier/host
  …
  design_review    finding-refuter               refuter  standard     standard  sonnet  -       escalation/family/host
  …
  pr_writer        pr-writer                     phase    economy      economy   haiku   -       agent/family/host
models on copilot:
  …
skraft doctor: no check failed, 1 with a warning
```

The Copilot warning does not matter in Claude Code. A `FAIL` line (program not found, missing
root, component without a gate command) is fixed in the configuration: follow the
[Configure components]({{ "/en/how-to/configure-components" | relative_url }}) guide.

## 5. Start the story

In the Claude Code conversation, type:

```text
/skraft checkout #42 Pay by card
```

`checkout` is the **slug**: the name of the pipeline, in kebab-case. `#42` is the issue number,
`Pay by card` its title. When the repository's remote names a GitHub forge and `gh` is signed in,
the engine reads the issue there and every agent reads its body, acceptance criteria included.
Here the repository has no remote: the run starts all the same, its agents get the number and the
title only, and the journal says why the body was not read. Claude Code answers:

```text
skraft checkout started — progress in the Skraft pane.
```

The **Skraft** pane opens. It draws the workflow, one row per phase followed by its steps, and
marks each step as it runs.

The first step is a question. A dialog headed **Pull request** asks:

```text
May skraft push this branch and open or update its pull request when a run ends, and keep one comment on its story's issue up to date with the run's progress, time and cost? ACCEPTED or DECLINED; the answer is kept in skraft-config.json (publish.pullRequest) for every later run.
```

This repository has no remote: choose **DECLINED**. The answer is written into
`skraft-config.json` (`"publish": { "pullRequest": false, … }`) and not asked again. The
screenshots question is not asked: no component is a front end.

## 6. RESEARCH and DESIGN

The pane log shows each step, for example:

```text
checkout: publish_consent DECLINED
checkout: visuals_consent DECLINED (no component of skraft-config.json is a front end (stack react, or an e2e command), so no screenshot is taken)
checkout: solution-researcher, attempt 1
```

`solution-researcher` fills the research document the engine pre-created:
`.copilot-tracking/skraft-plans/checkout/research/<YYYY-MM-DD>/checkout-research.md`.

`solution-architect` then designs the story: its documents go under
`.copilot-tracking/skraft-plans/checkout/details/<YYYY-MM-DD>/`, its ADRs under `docs/adr/`. The
engine refuses the step if the architect wrote anywhere else. Three lenses review the design
(consistency, architecture-compliance, fitness); a `NEEDS_REWORK` verdict sends the design back
with the confirmed findings.

When the design proposes an ADR, a dialog headed **ADR** asks:

```text
Ratify the Proposed ADRs docs/adr/adr-001-<title>.md? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.
```

Read the ADR, then choose **RATIFIED**. The engine marks it `Accepted` and commits it alone as
`docs(adr): ratify ADR-001`. With **REJECTED**, a second dialog asks your reason, which goes
back to the architect.

If you close a dialog without answering, the run **waits**. Answer later with
`/skraft decide <answer>` in the conversation, or with a button of the pane; the run resumes
where it stopped.

## 7. DISTILL and DELIVER

`acceptance-designer` writes the scenarios and the test plan
(`details/<YYYY-MM-DD>/test-plan-checkout.md`) and commits the failing acceptance tests. Four
lenses review it (coverage, business-alignment, testability, boundary-enforcement).

`software-engineer` then delivers in TDD cycles. Each cycle is a `test(…)` commit that fails, then
a `feat(…)` or `fix(…)` commit that makes it pass, each citing `#42`. After each step the engine
replays the red commits: a "red" commit whose tests pass is refused.

The engine then runs the gates itself, from `web`: `test`, then `mutation`. Mutation must reach
100 % on the business core (a `domain` or `application` folder) and 80 % elsewhere; surviving
mutants go back to the software engineer file by file, under the test-integrity lens. Last, the
DELIVER review runs its lenses (test-integrity, architecture-boundaries, cold-reader).

## 8. PUBLISH

`pr-writer` writes the summary of the pull request, and the engine renders the rest from the
journal. Since you declined publication, nothing is pushed; the pane log says:

```text
checkout: publish: pull request not opened: skraft-config.json sets publish.pullRequest to false; pull-request.md holds its description, and skraft publish opens it once that is fixed
```

The run ends with this notification:

```text
skraft checkout: done — PUBLISH closed
```

## 9. Read the run

In the terminal, at the root of `shop`:

```text
skraft status
```

You see:

```text
skraft checkout: done
RESEARCH  closed
DESIGN  closed
DISTILL  closed
DELIVER  closed
PUBLISH  closed
cost: … USD
PUBLISH closed
```

The `cost:` line appears when the host reports the cost. `skraft report` prints the time, cost
and retries of each step:

```text
skraft checkout: done
| Step | Phase | Visits | Attempts | Retries | Time | Cost | Outcome |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| publish_consent | RESEARCH | 1 | 1 | 0 | … | - | answered |
| visuals_consent | RESEARCH | 1 | 1 | 0 | 0 s | - | skipped |
| research | RESEARCH | 1 | 1 | 0 | … | … | done |
| design | DESIGN | 1 | 1 | 0 | … | … | done |
| design_review | DESIGN | 1 | 1 | 0 | … | … | approved |
| adr | DESIGN | 1 | 1 | 0 | … | - | answered |
| … | | | | | | | |
| gates | DELIVER | 1 | 1 | 0 | … | - | pass |
| mutation | DELIVER | 1 | 1 | 0 | … | - | pass |
| deliver_review | DELIVER | 1 | 1 | 0 | … | … | approved |
| visuals | DELIVER | 1 | 1 | 0 | 0 s | - | skipped |
| pr_writer | PUBLISH | 1 | 1 | 0 | … | … | done |
| publish | PUBLISH | 1 | 1 | 0 | … | - | local |
| Total | | | … | … | … | … | |
PUBLISH closed
```

A step sent back by a review or a gate shows more visits and retries. The tracking folder
`.copilot-tracking/skraft-plans/checkout/` now holds:

| File | What it is |
|---|---|
| `events.jsonl` | the journal: one signed, hash-chained event per fact |
| `WORKFLOW.md` | the workflow graph with each step done |
| `run-report.md` | the table `skraft report` prints |
| `qa-report.md` | the test plan, the last gates with the mutation score, the red commits, each review's verdict |
| `pull-request.md` | the pull request description, ready to publish |
| `gates/web/` | the evidence of each gate run: command, folder, result, output |
| `reviews/` | what each review pass read, and its `verdict.yaml` |

`git log --oneline` shows the commits of the run on `pay-by-card`: the research and design
documents, the ratified ADR, the failing acceptance tests, then the red and green commits of each
TDD cycle.

## What you learned

- `skraft init` describes your repository as components in `skraft-config.json`, and their
  paths are the write scope of DELIVER;
- `skraft doctor` tells you what your machine is missing before a run, and which model each agent
  runs on;
- `/skraft <slug> #<issue> <title>` starts the story; the engine drives every phase, asks you
  only for decisions, and records everything;
- `skraft status` and `skraft report` read the run from its journal;
- the run ends with a pull request description, published when you consent.

To publish this one later, add a remote, install and sign in to `gh`, then run `skraft publish`:
typed by you, it consents for that publication.

## On another host

- **GitHub Copilot CLI**: in step 5, select `skraft:skraft-orchestrator` and give it the slug, the
  issue and the title; it runs the `skraft-pipeline` workflow. Questions appear in the workflow
  log; Copilot asks you to confirm each answer, or you answer with `skraft decide` in a terminal.
- **VS Code**: in step 5, run
  `node "<skraft plugin folder>/engine/drivers/copilot-sdk/skraft-run.mjs" checkout --issue 42 --title "Pay by card"`
  in a terminal. Without the Copilot SDK, ask `skraft-orchestrator` in the chat: it conducts
  `skraft next` / `skraft record`. `skraft doctor` says which of the two applies.

The other steps do not change.

## Next pages

- [Configure components]({{ "/en/how-to/configure-components" | relative_url }})
- [Customise SKRAFT]({{ "/en/how-to/customisation" | relative_url }})
- [Run the gates and read their evidence]({{ "/en/how-to/run-gates" | relative_url }})
- [Resume or unblock a run]({{ "/en/how-to/resume-a-run" | relative_url }})
- [The `skraft` command line]({{ "/en/reference/cli" | relative_url }})
- [Engine, drivers, depth 1]({{ "/en/explanation/architecture" | relative_url }})
