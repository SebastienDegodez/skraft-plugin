---
title: "Getting started"
description: "Install SKRAFT V2 in Claude Code, describe a small repository, and run one story from RESEARCH to its pull request description."
persona: software-engineer
---

# Getting started

In this tutorial, you install SKRAFT in Claude Code, describe a small repository in
`skraft-config.json`, and run the story "#42 Pay by card" through RESEARCH, DESIGN, DISTILL,
DELIVER and PUBLISH. At the end, `skraft status` shows every phase closed and the pull request
description waits for you in the tracking folder.

You follow one path, from start to finish. Each step says what you should see. A full run starts
real agents: expect it to take a while and to cost what Claude Code charges for them.

:::info[Before you start]

- **Node 22** or later, and npm;
- **Git**;
- **Claude Code**.

:::

## 1. Create the small repository <!-- #1-create-the-small-repository -->

Create a `shop` folder, open a terminal in it and create the repository:

```console
$ git init -b main
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

```console
$ npm install --save-dev --prefix web @stryker-mutator/core@9.6.1 @stryker-mutator/tap-runner@9.6.1
```

and create `web/stryker.config.json`:

```json
{
  "testRunner": "tap",
  "mutate": ["src/**/*.js"],
  "tap": { "testFiles": ["test/**/*.test.js"], "nodeArgs": ["--test-reporter=tap"] }
}
```

Add `node_modules/` and `reports/` to a `.gitignore` at the root of `shop`, make a first commit,
then work on a branch of your own:

```console
$ git add .
$ git commit -m "Start the shop"
$ git switch -c pay-by-card
```

`git status` shows nothing left to commit.

## 2. Install the plugin <!-- #2-install-the-plugin -->

Open Claude Code in the `shop` folder. Type these two commands **in the conversation**, not in a
terminal:

```console title="Claude Code"
> /plugin marketplace add SebastienDegodez/skraft-plugin
> /plugin install skraft
```

Open `/plugin`: `skraft` is listed among the installed plugins.

:::note[Screenshot pending a real run]

A capture of `/plugin install` and of `skraft` in the installed plugins needs a real Claude Code
session. Until then, the block above shows what you type.

:::

## 3. Describe the repository with `skraft init` <!-- #3-describe-the-repository-with-skraft-init -->

The `skraft` command line is a Node script shipped with the plugin. Run it from the root of `shop`:

```console
$ node "<skraft plugin folder>/engine/drivers/cli/skraft.mjs" init
```

To find that folder, look for the script under Claude Code's plugins folder:

```text
find ~/.claude/plugins -path '*engine/drivers/cli/skraft.mjs'
```

The printed line is the script's full path; replace `<skraft plugin folder>` with what comes before
`/engine/`. From here
on, `skraft …` means that full command, or the `skraft` command that
[`npm i -g @skraft/cli`](../how-to/install-on-a-host.mdx#skraft-command) sets up.

`skraft init` looks for the projects of the repository and writes one **component** per project: a
part of the repository with its root, its stack, its paths and its commands. You see:

![Terminal: skraft init answers "skraft-config.json: web (javascript, web)"](/img/screenshots/shared/terminal-init.svg)

*Figure 1 — `skraft init` found one component, `web`, in JavaScript.*

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

`test` comes from the script of `web/package.json`; `mutation` is the StrykerJS default. `paths` is
also the **write scope** of DELIVER: the software engineer may write only in `web/src` and
`web/test`. `skraft init` also added `skraft-config.local.json`, your personal layer, to
`.gitignore`. Commit both files:

```console
$ git add skraft-config.json .gitignore
$ git commit -m "chore: describe the shop for skraft"
```

## 4. Check with `skraft doctor` <!-- #4-check-with-skraft-doctor -->

`skraft doctor` checks that every command can run on your machine and shows which model each agent
will run on:

```console
$ skraft doctor
```

You see, with your own paths and versions:

![Terminal: skraft doctor, ok lines and three WARN lines, then the model table under Claude Code, and "no check failed, 3 with a warning"](/img/screenshots/shared/terminal-doctor.svg)

*Figure 2 — `skraft doctor` on the `shop` repository: no check failed, three warnings. The model
table is cut after its first rows.*

The three warnings do not block this tutorial: the first says the repository has no remote yet (a run
with an issue number is refused without one, step 5); the second says no mocking recipe exists for a JavaScript
component, and the small repository calls no service; the third only concerns Copilot.
The last line is what matters: `no check failed`.

## 5. Start the story <!-- #5-start-the-story -->

In the Claude Code conversation, type:

```console title="Claude Code"
> /skraft checkout #42 Pay by card
```

`checkout` is the **slug**: the name of the pipeline, in kebab-case. `#42` is the issue number,
`Pay by card` its title. The repository has no remote, so the issue cannot be read: the run is refused
(`issue-unreadable`) and nothing is journaled. Without `#42` the run starts, and its agents get no issue.
Claude Code answers:

```console
skraft checkout started — progress in the Skraft pane.
```

The **Skraft** pane opens. It draws the workflow, one line per phase followed by its steps, and
ticks each step as it runs.

:::note[Screenshot pending a real run]

A capture of the **Skraft** pane in Claude Code needs a real session. Until then, the block above
shows what Claude Code prints when the run starts.

:::

Right away, a dialog titled **Pull request** asks whether skraft may push the branch and open the
pull request when the run ends. **Leave it open** for the next step.

## 6. Watch the run from a terminal <!-- #6-watch-the-run-from-a-terminal -->

While the dialog waits, run in a terminal, at the root of `shop`:

```console
$ skraft status
```

![Terminal: skraft status shows "skraft checkout: waiting", RESEARCH open, the other phases pending, and the publish-consent question](/img/screenshots/shared/terminal-status-waiting.svg)

*Figure 3 — The run waits for your answer: RESEARCH is open, and the `publish-consent` question is
the dialog's.*

`skraft status` reads the journal the engine writes; it changes nothing in the run.

Go back to the dialog: this repository has no remote, choose **DECLINED**. The answer is written to
`skraft-config.json` (`"publish": { "pullRequest": false, … }`) and is not asked again. No question
about screenshots is asked: no component is a front end.

## 7. RESEARCH and DESIGN <!-- #7-research-and-design -->

The pane's log shows each step, for example:

```text
checkout: publish_consent DECLINED
checkout: visuals_consent DECLINED (no component of skraft-config.json is a front end (stack react, or an e2e command), so no screenshot is taken)
checkout: solution-researcher, attempt 1
```

`solution-researcher` fills the research document the engine pre-created:
`.copilot-tracking/skraft-plans/checkout/research/<YYYY-MM-DD>/checkout-research.md`.

`solution-architect` then designs the story: the context map, the tactical design and the event
model go under `docs/architecture/` and `docs/domain/event-model/`, its ADRs under `docs/adr/`; the
contracts and the consistency matrix go under
`.copilot-tracking/skraft-plans/checkout/details/<YYYY-MM-DD>/`. Three lenses review the design
(consistency, architecture-compliance, fitness).

When the design proposes an ADR, a dialog titled **ADR** asks:

```text
Ratify the Proposed ADRs docs/adr/adr-001-<title>.md? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.
```

Open the ADR, read it, then choose **RATIFIED**. The engine marks it `Accepted` and commits it
itself: `git log --oneline -1 -- docs/adr` shows `docs(adr): ratify ADR-001`.

## 8. DISTILL and DELIVER <!-- #8-distill-and-deliver -->

`acceptance-designer` writes the scenarios (under `docs/features/`) and the test plan
(`details/<YYYY-MM-DD>/test-plan-checkout.md`) and commits the failing acceptance tests. Four
lenses review it (coverage, business-alignment, testability, boundary-enforcement).

`software-engineer` then delivers in TDD cycles: a `test(…)` commit that fails, then a `feat(…)` or
`fix(…)` commit that makes it pass. The engine replays each red commit: a "red" commit whose tests
pass is refused.

The engine then runs the component's gates (`test`), then the DELIVER review (test-integrity,
architecture-boundaries, cold-reader), then mutation, once, on the reviewed code. The pane ticks
`gates`, `deliver_review` and `mutation`.

## 9. PUBLISH <!-- #9-publish -->

`pr-writer` writes the summary of the pull request; the engine renders the rest from the journal.
As you declined publishing, nothing is pushed; the pane's log says:

```text
checkout: publish: pull request not opened: skraft-config.json sets publish.pullRequest to false; pull-request.md holds its description, and skraft publish opens it once that is fixed
```

The run ends on this notification:

```console
skraft checkout: done — PUBLISH closed
```

## 10. Read the result <!-- #10-read-the-result -->

In the terminal, at the root of `shop`:

```console
$ skraft status
```

![Terminal: skraft status shows "skraft checkout: done" and RESEARCH to PUBLISH closed](/img/screenshots/shared/terminal-status-done.svg)

*Figure 4 — A finished run: every phase is `closed`. Captured on the integration tests' scripted
repository; under Claude Code, a `cost:` line is added with the cost the host reported.*

Run the gates yourself on the delivered code:

```console
$ skraft gate --all
```

![Terminal: skraft gate --all, pass web/test and pass web/mutation, "2 gates passed on web"](/img/screenshots/shared/terminal-gates.svg)

*Figure 5 — Both gates of the `web` component pass.*

The tracking folder `.copilot-tracking/skraft-plans/checkout/` now holds:

| File | What it is |
|---|---|
| `events.jsonl` | the journal: one signed, chained event per fact |
| `WORKFLOW.md` | the workflow graph with each step done |
| `run-report.md` | the table `skraft report` prints: time, cost and retries of each step |
| `qa-report.md` | the test plan, the last gates with the mutation score, the red commits, each review's verdict |
| `pull-request.md` | the pull request description, ready to publish |
| `gates/web/` | the output of each gate |
| `reviews/` | what each review pass read, and its `verdict.yaml` |

Open `pull-request.md`: it is the result of your first run. `git log --oneline` shows, on
`pay-by-card`, the research and design documents, the ratified ADR, the failing acceptance tests,
then the red and green commits of each TDD cycle.

## What you built <!-- #what-you-built -->

The `shop` repository, described in `skraft-config.json`, now carries a story delivered from
RESEARCH to PUBLISH and its pull request description. On the way, you learned that:

- `skraft init` describes your repository as components in `skraft-config.json`, and their paths
  are the write scope of DELIVER;
- `skraft doctor` tells you what your machine lacks before a run, and which model each agent runs
  on;
- `/skraft <slug> #<issue> <title>` starts the story; the engine drives each phase, asks you only
  for decisions, and records everything;
- `skraft status` reads the run from a terminal, and `skraft gate` runs its gates again;
- the run ends with a pull request description, published when you consent.

## Next steps <!-- #next-steps -->

- [First run under GitHub Copilot CLI](./first-run-copilot.md) — the same path, followed in the Copilot canvas.
- [Publish a run's pull request](../how-to/publish-pull-request.md)
- [Configure components](../how-to/configure-components.md)

Also useful: [Install skraft on a host](../how-to/install-on-a-host.mdx) (Windows, VS Code,
optional plugins), [Hosts](../reference/hosts.md) (what each host shows and asks) and
[Engine, drivers, depth 1](../explanation/architecture.md).
