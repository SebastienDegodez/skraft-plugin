---
layout: doc
lang: en
title: "First run under GitHub Copilot CLI"
description: "Install SKRAFT in GitHub Copilot CLI, start a story with the orchestrator agent, answer its questions in the chat and follow the run to PUBLISH."
persona: software-engineer
---

# First run under GitHub Copilot CLI

> In this tutorial, you install SKRAFT in GitHub Copilot CLI, start the story "#42 Pay by card" on
> a small repository, answer its questions in the chat, and follow the run to the end. At the
> end, the workflow log says `checkout: done: PUBLISH closed` and `skraft report` shows each step of
> the run.

One path, from start to finish; each step says what you should see. The run starts real agents:
expect it to take a while and to use Copilot credits.

## What you need

- **Node 22** or later, and npm;
- **Git**;
- **GitHub Copilot CLI**, signed in to your account.

## 1. Create the small repository

In a terminal, create the `shop` folder and its files:

```text
mkdir shop
cd shop
git init -b main
```

`web/package.json`:

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

`web/src/cart.js`:

```js
export const total = (prices) => prices.reduce((sum, price) => sum + price, 0)
```

`web/test/cart.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { total } from '../src/cart.js'

test('the total of a cart adds its prices', () => {
  assert.equal(total([2, 3]), 5)
})
```

`web/stryker.config.json`, for the mutation gate:

```json
{
  "testRunner": "tap",
  "mutate": ["src/**/*.js"],
  "tap": { "testFiles": ["test/**/*.test.js"], "nodeArgs": ["--test-reporter=tap"] }
}
```

Create a `.gitignore` at the root holding two lines, `node_modules/` and `reports/`. Install
StrykerJS, then commit on a branch of your own:

```text
npm install --save-dev --prefix web @stryker-mutator/core@9.6.1 @stryker-mutator/tap-runner@9.6.1
git add .
git commit -m "Start the shop"
git switch -c pay-by-card
```

`git status` shows nothing left to commit.

## 2. Install the plugin

Still in the terminal:

```text
copilot plugin marketplace add SebastienDegodez/skraft-plugin
copilot plugin install skraft@skraft
copilot plugin list
```

`skraft` is in the list.

## 3. Describe the repository

The `skraft` command line is a Node script shipped with the plugin. From the root of `shop`, with
`<skraft plugin folder>` the folder where Copilot installed the plugin:

```text
node "<skraft plugin folder>/engine/drivers/cli/skraft.mjs" init
```

From here on, `skraft …` means that full command, or the `skraft` command that
[`skraft install`]({{ "/en/how-to/install-on-a-host" | relative_url }}#skraft-command) sets up. You see:

![Terminal: skraft init answers "skraft-config.json: web (javascript, web)"]({{ "/assets/screenshots/shared/terminal-init.svg" | relative_url }})

*Figure 1 — One component, `web`, with its `test` and `mutation` commands, is written to
`skraft-config.json`.*

Commit the configuration, then check the machine:

```text
git add skraft-config.json .gitignore
git commit -m "chore: describe the shop for skraft"
skraft doctor
```

The last line of `skraft doctor` says `no check failed, 3 with a warning`. No warning blocks:
`forge` says the repository has no remote yet, `web` has no JavaScript mocking recipe, and the small repository calls no service; `models/copilot`
says that, with no model configured, each agent runs on your session's model.

## 4. Start the story

Open a Copilot session in `shop`:

```text
copilot
```

Type `/agent`, choose `skraft:skraft-orchestrator`, then write:

```text
Start the checkout pipeline for issue 42, titled "Pay by card".
```

The agent starts the `skraft-pipeline` dynamic workflow with `{ slug: "checkout", issue: 42, title:
"Pay by card" }`. The repository has no remote: the run starts anyway, and its agents get the
issue's number and title only.

Before any phase, on the first run of a working copy, Copilot asks once in the chat: *Start this run
with the configuration of this working copy?* If your client shows canvases, the `skraft-pipeline`
canvas opens on its **Configuration** tab: the forge, the components and their commands, the
consents, the model of each agent and the quality bar. Edit what you need there and save, then
answer **START**. START is kept in `skraft-config.local.json`, so the next runs start without asking;
STOP starts nothing. Pass `configure: true` to the workflow to be asked again. The canvas also has a
**Run** tab (where the run stands) and a **Workflow** tab (each workflow the run can follow, the
current step highlighted).

## 5. Answer the first question

Copilot asks you one question in the chat, once: may skraft push the branch and open the pull
request when the run ends? If your Copilot client shows canvases, ask it to open the
`skraft-pipeline` canvas: it shows the same question and the workflow.

![skraft-pipeline canvas: status WAITING, a "We need you" button in the header and a "Pull request" box with the question and how to answer it, RESEARCH open on publish_consent, the other phases to come]({{ "/assets/screenshots/shared/pipeline-canvas-question.png" | relative_url }})

*Figure 2 — The `skraft-pipeline` canvas of the `shop` repository: the run waits for the answer to
`publish_consent-1`. The canvas shows; you answer in the chat.*

Choose **DECLINED**: this repository has no remote. The answer is written to `skraft-config.json`
and is not asked again.

## 6. Follow RESEARCH and DESIGN

Type `/workflows` to see the run's log. Each agent appears there with its model family:

```text
checkout: solution-researcher, attempt 1 — researcher · standard · model chosen by the host
```

Once the architect has proposed an ADR and the three design review lenses have approved it, Copilot
asks you the next question: ratify the ADR. The canvas shows it too:

![skraft-pipeline canvas: status WAITING with a "We need you" button on the ADR question adr-1, RESEARCH ticked, DESIGN open with design and design_review done, adr under way; below the workflow, the approved design_review and each agent's model]({{ "/assets/screenshots/shared/pipeline-canvas-adr.png" | relative_url }})

*Figure 3 — The run waits for the ADR's ratification. Captured on the integration tests' scripted
repository, whose ADR is named `adr-001-card-payment.md`; yours carries the title the architect
gave it.*

Open the ADR under `docs/adr/`, read it, then choose **RATIFIED** in the chat. The engine marks it
`Accepted` and commits it: `docs(adr): ratify ADR-001`.

## 7. Let DISTILL, DELIVER and PUBLISH finish

The run goes on without you: acceptance tests, TDD cycles, gates, the DELIVER review, mutation,
then the pull request description. The `/workflows` log ends like this:

![skraft-pipeline workflow log: phase PUBLISH, pr-writer, the pull request not opened as publish.pullRequest is false, PUBLISH closed, then checkout: done: PUBLISH closed]({{ "/assets/screenshots/shared/terminal-workflow-log.svg" | relative_url }})

*Figure 4 — The end of the log: the description is written to `pull-request.md`, nothing is pushed,
the run is done.*

The canvas then ticks every phase:

![skraft-pipeline canvas: status DONE, "PUBLISH closed", RESEARCH to PUBLISH ticked with each step and its outcome, then the approved reviews and the passed gates]({{ "/assets/screenshots/shared/pipeline-canvas-done.png" | relative_url }})

*Figure 5 — A finished run in the canvas (integration tests' scripted repository). The steps from
`kill_proposal` to `mutation_gates` stay grey: no mutant survived.*

## 8. Read the run's report

In the terminal, at the root of `shop`:

```text
skraft report
```

![Terminal: skraft report, a table of one row per step with its visits, attempts, retries, time, cost and outcome, a Total row, then the question adr-1 answered RATIFIED by host-confirmed]({{ "/assets/screenshots/shared/terminal-report-done.svg" | relative_url }})

*Figure 6 — The report of a finished run. On the scripted repository the agents answer at once,
hence the zero times; under Copilot, the Cost column stays empty: Copilot counts in credits.*

The last table says who answered: `host-confirmed`, that is you, in Copilot's dialog. Finally open
`.copilot-tracking/skraft-plans/checkout/pull-request.md`: it is the pull request description your
run produced.

## What you learned

- under Copilot CLI, the `skraft:skraft-orchestrator` agent starts the `skraft-pipeline` workflow,
  and the engine drives each phase;
- each decision is put to you once, in the chat; your answer is journaled `host-confirmed`;
- `/workflows` shows the run's log, and the `skraft-pipeline` canvas the workflow and the pending
  question, never taking an answer;
- `skraft report` reads the run from the journal: each step, its passes and its answers.

## Next pages

- [Answer a run's question]({{ "/en/how-to/answer-a-question" | relative_url }}) — when the question could not be asked, or you closed it.
- [Resume a run]({{ "/en/how-to/resume-a-run" | relative_url }})
- [Choose the agents' models]({{ "/en/how-to/choose-models" | relative_url }}) — to clear the `models/copilot` warning.
- [Hosts]({{ "/en/reference/hosts" | relative_url }}#copilot-cli) — the workflow, the canvas and the `skraft_decide` tool.
- [Getting started]({{ "/en/tutorials/getting-started" | relative_url }}) — the same path under Claude Code.
