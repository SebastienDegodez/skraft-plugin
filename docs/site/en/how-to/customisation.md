---
layout: doc
lang: en
title: "Customise SKRAFT"
description: "What you can adapt today in V2 (components, commands, base, mocking, models and effort per agent, questions to a human), what comes in the next lots, and the risk of each control you reduce."
persona: tech-lead
---

# Customise SKRAFT

**Goal**: adapt SKRAFT to your repository without removing, by accident, a proof your team relies on.

In V2, the **engine** decides the order of phases, the expected outputs, the retries, the verdicts and the gates. You do not tune those decisions; you describe your repository in `skraft-config.json`, and the engine sticks to it.

## What you can adapt today

Everything goes through `skraft-config.json`, at the root of the working copy that starts the run.

| What | Where | Effect | Guide |
|---|---|---|---|
| Components | `components[]`: `name`, `root`, `stack` | What the engine builds and tests, a neighbour repository included (`../payment-web`) | [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}) |
| Commands | a component's `commands` | A command you write is **always** the one that runs; the engine never replaces it with a default | [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}) |
| Gates | the commands named `build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation` | What `skraft gate` runs, in that order | [Run the gates]({{ "/en/how-to/run-gates" | relative_url }}) |
| Base | global or per-component `baseBranch`, `--base <ref>` at init | The commit compared with: changed components, `{baseSha}` in commands | [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}) |
| Mocking | `mocking.strategy`: `"microcks"` or `"inprocess"` | `microcks` (default) needs Docker for the test gates; `inprocess` does not | [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}) |
| Models and effort | `models`, `assign`, also in `~/.skraft/config.json` and `skraft-config.local.json` | The model and the reasoning effort of each agent, per host | [below](#models-and-effort) |

What cannot be tuned:

- **Quality thresholds** are not configurable.
- The order of phases, the number of attempts of an agent and the blocking codes live in the engine.
- A component's `paths` and `contractTesting` keys are accepted, but the engine reads them only from lots 3 and 6.

Other top-level keys of `skraft-config.json` are kept as they are by `skraft init`.

## Choose the model and the effort of each agent {#models-and-effort}

`models` and `assign` choose what each agent runs on, on Claude Code and on Copilot. Four files apply, each one a JSON Merge Patch on the ones before it (an object is merged key by key, a list or a value replaces the earlier one, `null` removes it):

1. the plugin's defaults: `economy` → `haiku`, `standard` → `sonnet`, `frontier` → `opus` on Claude Code; lenses on `reviewer`, `solution-researcher` on `researcher`, `solution-architect` on `planner`, every other agent on `implementer`;
2. `~/.skraft/config.json`, yours, for every repository;
3. `skraft-config.json`, the team's, committed;
4. `skraft-config.local.json`, yours, never committed: `skraft init` adds it to `.gitignore`.

Files 2 and 4 follow `plugins/skraft-framework/schemas/skraft-config.local.schema.json` and hold neither `components` nor `workflow`; file 3 follows `skraft-config.schema.json`.

- **A family** is a tier (`economy` < `standard` < `frontier`, the only rank), a role whose tier is built in (`reviewer` → economy, `researcher` and `implementer` → standard, `planner` → frontier; `"tier"` changes it) or a free family that declares its `"tier"` (`gpt-codex`). A family is never a versioned model: `gpt-5.5` is a model.
- **`models`** gives each family, per host (`claude-code`, `copilot`), a `model` — or a list tried in order, with the same effort — and an `effort` (`low`, `medium`, `high`, `xhigh`, `max`). What a family leaves out comes from its tier, then the host decides.
- **`assign`** chooses the family: a string names it, `inherit` leaves the choice to the host, an object adds an `effort` per host (never a model), `null` removes a rule a lower file set.

Resolution, family and effort apart:

| What | First that applies |
|---|---|
| Family | `assign.agents.<agent>` → the family an ejected workflow names (`model=`, `<lens>@<family>`, `refuter=`) → `assign.types.<phase, lens, refuter, worker>` → `assign.default` → the host (Claude Code: the agent file's `model:`; Copilot: `/agents`, then the session) |
| Model on a host | the family's for that host → its tier's → the host |
| Effort on a host | `assign.agents.<agent>` for that host → `assign.types.<type>` for that host → the family's → its tier's → the host |
| Refuter | a rule or `refuter=` naming its family, else one tier above the strongest lens it checks, `frontier` at most |

A developer's local file, for instance:

```json
{
  "$schema": "./plugins/skraft-framework/schemas/skraft-config.local.schema.json",
  "models": {
    "economy":  { "claude-code": { "model": "haiku",  "effort": "low" },    "copilot": { "model": "gpt-5.5", "effort": "low" } },
    "standard": { "claude-code": { "model": "sonnet", "effort": "medium" }, "copilot": { "model": "gpt-5.5", "effort": "high" } },
    "frontier": { "claude-code": { "model": "opus",   "effort": "high" },   "copilot": { "model": "gpt-6.0", "effort": "xhigh" } },
    "implementer": { "copilot": { "model": ["gpt-6.0", "gpt-5.5"] } },
    "gpt-codex":   { "tier": "standard", "copilot": { "model": "gpt-5.5-codex", "effort": "medium" } },
    "deep-review": { "tier": "frontier", "claude-code": { "model": "opus", "effort": "max" }, "copilot": { "model": "gpt-6.0", "effort": "xhigh" } }
  },
  "assign": {
    "types": { "lens": "economy" },
    "agents": {
      "software-engineer": "gpt-codex",
      "cold-reader-lens": "deep-review",
      "architecture-boundaries-lens": { "claude-code": { "effort": "high" }, "copilot": { "effort": "high" } },
      "solution-architect": { "family": "planner", "claude-code": { "effort": "max" } },
      "fitness-lens": null
    }
  }
}
```

With the team's `{ "assign": { "agents": { "fitness-lens": "implementer" } } }`, the `null` gives `fitness-lens` back to the type rule: every lens runs on `economy`, `cold-reader-lens` on `deep-review` (opus · max, gpt-6.0 · xhigh), `software-engineer` on `gpt-codex` (sonnet · medium from its tier, gpt-5.5-codex · medium), `acceptance-designer` tries gpt-6.0 then gpt-5.5 on Copilot.

- Without any of these files, Claude Code gets the aliases of the defaults and Copilot gets no model: it runs each agent on the session's model.
- `skraft doctor` shows, per host, each agent the workflow dispatches with its family, tier, model, effort and the source of each, and warns of a family with no model for a host, of `max` on a Copilot model whose name has no `claude`, of `CLAUDE_CODE_EFFORT_LEVEL` and of a `~/.copilot/settings.json` agent setting skraft masks; an agent rule naming an agent nobody provides fails, with the closest name.
- `skraft workflow check` warns of a `model=`, `@<family>` or `refuter=` of your workflow that an agent rule masks, the plugin's defaults included.
- A run journals what each agent ran on; a resumed run replays it, whatever the files say since.
- The Claude Code mod passes the model but not the effort: `$.agent.spawn` takes none (Claude Code 2.1.305); the agent file's own effort applies.

## Ask a human in the workflow

The workflow is a DOT graph (`workflows/skraft.dot` in the plugin; `skraft workflow eject` copies it into your repository). A node of shape `hexagon` is an **ask node**: it puts a question to a human, and the run waits until the answer comes. The default workflow asks for the ratification of the ADRs DESIGN proposed, once the design review approved them (the review loops after DESIGN shortened):

```text
start -> publish_consent -> visuals_consent -> research -> design -> design_review
publish_consent [shape=hexagon, question="publish-consent"]
visuals_consent [shape=hexagon, question="reporting-consent"]
design_review -> design  [label="NEEDS_REWORK", max_visits=3]
design_review -> adr     [label="APPROVED"]
adr      [shape=hexagon, question="adr-ratification"]
adr -> distill   [label="RATIFIED"]
adr -> design    [label="REJECTED", max_visits=3]
distill -> distill_review -> deliver -> gates -> mutation -> deliver_review -> visuals -> pr_writer -> publish -> exit
visuals  [shape=parallelogram, publish="playwright-visuals", when="frontend"]
mutation -> kill_mutants [label="FAIL", max_visits=5]
kill_mutants [agent="software-engineer", each="survivor-file"]
kill_mutants -> mutation_review   // lenses="test-integrity"
mutation_review -> gates [label="APPROVED"]
```

The `gates` and `mutation` nodes are `locked=true`: a repository workflow drops one only with `unlock="<reason>"`. Unlocking `mutation` is the only way to run without mutation testing; it is not recommended.

The engine judges mutation from the report the tool writes, not from its exit code. It scores the files changed since the component's base (every file of the report when there is no base or Git cannot list the changes): the core (a file under a folder of the component whose last word is `domain` or `application`, as in `Checkout.Domain`, `checkout-domain`, `src/cart/application`) must reach 100 %, the boundary (everything else) 80 %. A score is detected mutants (killed, timed out, and PIT's memory errors) over detected and surviving ones (survived, no coverage); the bar is not configurable and decides, whatever the tool's exit code. When a scope misses its bar, the engine sends that scope's surviving mutants to `kill_mutants`, one dispatch per file. `mutation_review` checks the new tests with `test-integrity`, then the gates run again. The loop stops when mutation passes; when two rounds leave no fewer mutants alive than the best round before them (`mutation-stalled`); or at its `max_visits`. The last two stops name the mutants that remain.

The report is read where each stack's default command writes it: `StrykerOutput/reports/mutation-report.json` (.NET), `reports/mutation/mutation.json` (JavaScript, TypeScript, React), `target/pit-reports/mutations.xml` (Java, Maven) or `build/reports/pitest/mutations.xml` (Gradle). It must be in the mutation-testing-elements JSON format or be PIT's XML. A command that writes elsewhere names its file with `mutationReport` on the component, relative to its root. With Gradle, set PIT's `outputFormats` to include `XML` in the build; a multi-module Maven project writes one report per module, so name the one to read with `mutationReport`. Python has no default report: give `mutationReport`, for example the `mutation-report.json` that the `quality-gates-python` mutation script writes in its evidence folder. A mutation run without a readable report waits for a human, whatever its exit code. Each default uses its tool's incremental mode, so a round of the loop does not mutate the whole project again: StrykerJS `--incremental`, PIT `-DwithHistory`, Stryker.NET `--since:{baseSha}`; whatever the tool mutates, the bar is judged on the files changed since the base.

| Question | Answers | Refusal |
|---|---|---|
| `adr-ratification` | `RATIFIED`, `REJECTED` | `REJECTED`, with a reason |
| `reporting-consent` | `ACCEPTED`, `DECLINED` | — |
| `publish-consent` | `ACCEPTED`, `DECLINED` | — |

`reporting-consent` asks once per repository, before the first agent, whether skraft may publish the screenshots of its runs, which can show private data; the answer goes into `skraft-config.json` (`publish.visuals`). While no component is a front end (stack `react`, or a component with `commands.e2e`), it is not asked and nothing is written.

`publish-consent` asks once per repository, before the first agent, whether skraft may push the branch and open or update its pull request when the run ends, and keep one comment on the story's issue up to date with the run's progress, time and cost; the answer goes into `skraft-config.json` (`publish.pullRequest`), with the version of the question it answers (`publish.questionVersions.pullRequest`). When the text of a consent question changes, its version moves: an acceptance kept for an earlier version is asked again, a refusal stands. A run started with `--from-artifacts` begins in DESIGN and does not ask it: set `publish.pullRequest` to `true` and `publish.questionVersions.pullRequest` to `2` by hand.

Edge rules out of an ask node:

- each edge is labelled with an answer;
- one unlabelled edge takes every answer that has no edge of its own, except a refusal;
- a refusal needs its own labelled edge, normally back to the node whose work it refuses, with `max_visits` to bound the loop;
- an ask node inherits its phase like any other node.

The engine refuses a workflow with an unknown question, an ask node without `question`, two unlabelled edges out of an ask node, two edges for the same answer, a label that is not an answer, a refusal without its own edge, or a loop none of whose edges carries `max_visits`. Examples: `node adr: REJECTED needs an edge of its own, back to the node whose work it refuses`, `node adr: no edge for RATIFIED; label one RATIFIED, or leave one unlabeled`, `loop adr -> design -> design_review -> adr has no max_visits`.

## Open the pull request at the end of the run {#pull-request}

The default workflow ends with a PUBLISH phase: the `pr-writer` agent (family `economy` by default; change it with `assign.agents`) writes the summary line, What changes, Why and Out of scope in a template the engine gives it, then the `publish` node (`shape=parallelogram, publish="pull-request"`) renders the description and opens the pull request.

```json
{
  "publish": {
    "pullRequest": true,
    "draft": false
  }
}
```

- `pullRequest`: the answer to `publish-consent`; `false` keeps every run local. `skraft publish`, typed by you, is the consent for that one publication even when `pullRequest` is `false`: the setting stays as it is, and the journal records the request (`publish.requested`).
- `draft`: a pull request skraft opens is a draft unless `draft` is `false`.
- The base is the branch the run diffs against (`baseBranch`, `--base`, else `main`); the head is the branch HEAD is on. skraft pushes it to the same branch of the remote, never forced, and never pushes the base or the default branch.
- The forge is the one the remote's URL names (`origin`, else the first remote), GitHub Enterprise included; skraft runs `gh` with `--repo <host>/<owner>/<repo>`, so `gh auth login --hostname <host>` once is enough. In a fork, `origin` is usually your fork: skraft pushes the branch there and opens the pull request in the repository `origin` names, never in the one you forked; a base written with a remote before it (`upstream/main`) names that remote's branch (`main`). Nothing is pushed while gh cannot say which branch is the repository's default.
- git and ssh never prompt: a push that needs a password or a passphrase fails at once, and the run says so.
- A closed or merged pull request of the branch is left alone: skraft opens no other one. A body someone edited since skraft wrote it is never overwritten.
- What an agent writes is made inert before it is published: closing keywords followed by an issue reference and @mentions go in code spans, HTML tags are dropped; only the engine's own `Closes`/`Refs` line refers to the issue.
- An open pull request of the branch is updated, only when its body changed; skraft never opens a second one.
- Without consent, a remote, `gh` or its sign-in, on a detached HEAD or on the base branch, the run completes locally and says why. The description stays in `.copilot-tracking/skraft-plans/<slug>/pull-request.md`; once the cause is fixed, `skraft publish` opens or updates the pull request.
- The description starts with `Refs #<issue>`; `Closes #<issue>` only when the pull request targets the default branch. Decisions, tests, red evidence, gates, review, the run summary and the AI disclosure are rendered from the journal; a section with nothing recorded says so.
- After each step, the tracking folder also holds `run-report.md` (time, cost and retries per step; `skraft report` prints it) and `WORKFLOW.md` (each step done, in progress or to come).

## Follow a run on its issue {#issue-progress}

A run started from an issue (`/skraft checkout #42 …`, `skraft init checkout --issue 42`, the workflow's `issue` argument) keeps one comment on that issue, once you accepted the current `publish-consent` question:

- posted when the first transition happens, then rewritten at each one: a phase closes, a review sends the work back, the run ends, done or blocked. Only the first post notifies the issue's subscribers;
- each version shows, once the run ended, its status and the code that stopped it, each phase checked, in progress or where the run stopped, the next phase, each review's verdict and passes, the last result of each gate with its surviving mutants and its log, the pull request opened or updated, the totals, and every step in a folded table.

The engine renders the comment from the journal, the same under Claude Code, Copilot and the VS Code loop; why a run stopped, which can name paths of your machine or quote an agent, stays in the tracking folder (`run-report.md`). Its last body stays in `.copilot-tracking/skraft-plans/<slug>/issue-progress.md`, and its first line, a hidden marker naming the slug, lets any machine find it again: a run that lost the comment's URL (machine stopped right after posting) rewrites it instead of posting a second one, and a comment a human deleted is posted again. Only your own comments are rewritten, so `gh`'s token must be able to read the signed-in user (`gh api user`); otherwise no comment is found or posted, and each transition is journaled skipped with that reason. The forge is the one the remote names, through `gh`, as for the pull request. A transition the forge cannot take (no remote, no `gh`, not signed in, refused) is journaled `issue.comment-skipped` with the reason and said in the run's log; the next transition keeps the whole run again, and the run goes on. A run without an issue keeps nothing; without the consent, or with an acceptance of an earlier question, each transition is journaled skipped, and a consent given later tells none of them. A phase a run found closed (`--from-artifacts`) is not a transition.

## Show the screenshots of a front end in the pull request {#visuals}

After the delivery review approves, the `visuals` node (`shape=parallelogram, publish="playwright-visuals"`) runs `commands.e2e` of each front end from its root; `when="frontend"` skips the node when no component is one. A React component without `commands.e2e` is told to declare one. Visuals are evidence, not a gate: whatever happens, the run goes on to the pull request.

The engine reads `skraft-visuals/manifest.json` under the component's root once the command ends (it empties an earlier one first):

```json
{
  "screenshots": [
    { "title": "Checkout, card paid", "theme": "light", "path": "skraft-visuals/checkout-light.png" },
    { "title": "Checkout, card paid", "theme": "dark", "path": "skraft-visuals/checkout-dark.png" }
  ]
}
```

- `theme`: `light` or `dark`, the Playwright project that took the screenshot; `path`: a `.png` relative to the component's root, never outside it; `title`: the alt text, kept as plain text (letters, digits, spaces and plain punctuation, at most 120 characters).
- A missing or invalid manifest, or a file it names that is missing, records no screenshot and says why; a failing e2e command is reported as a failed e2e run, with its log in the tracking folder (`visuals/<component>/e2e-<n>.log`).
- With `publish.visuals` set to `true`, the screenshots are copied byte for byte to `.copilot-tracking/skraft-plans/<slug>/evidence/<slug>/<component>/<theme>-<n>.png` and committed alone on the working branch (`docs(evidence): screenshots of <components>`, `Refs: #<issue>`). Declined, nothing is copied and the pull request says `not published (consent)`. Still unanswered when the node runs (a front end added since the question was skipped, or a workflow without the consent node), the node asks `reporting-consent` itself before the e2e run.
- The pull request shows at most six screenshots of each theme of a component and says how many others are in its evidence folder; a body past 60,000 characters has its longest sections cut with a mark, `pull-request.md` keeping it whole.
- Before copying, the engine refuses a screenshot that is a symbolic link, resolves outside its component or does not start with the PNG signature; it copies none of them then, and the pull request names the refused files.
- The Screenshots section of the pull request shows the light screenshots, the dark ones folded in a `<details>` block, each by its address at that commit, `https://<host>/<owner>/<repo>/raw/<sha>/<path>` (github.com and GitHub Enterprise alike; a private repository shows them to a signed-in viewer); when the remote names no repository, the paths, and the section says so. Once the pull request is squash-merged and its branch deleted, that commit may be garbage-collected and the images stop showing.

What to add to the front end's Playwright configuration: two projects, and a reporter that writes the manifest from the screenshots the tests attach.

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  projects: [
    { name: 'light', use: { colorScheme: 'light' } },
    { name: 'dark', use: { colorScheme: 'dark' } },
  ],
  reporter: [['list'], ['./skraft-visuals-reporter.ts']],
})
```

```ts
// skraft-visuals-reporter.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

export default class SkraftVisuals implements Reporter {
  private screenshots: Array<{ title: string, theme: string, path: string }> = []

  onTestEnd(test: TestCase, result: TestResult) {
    const theme = test.parent.project()?.name ?? ''
    for (const { name, path, contentType } of result.attachments) {
      if (contentType === 'image/png' && path) this.screenshots.push({ title: name, theme, path: relative(process.cwd(), path).split('\\').join('/') })
    }
  }

  onEnd() {
    mkdirSync('skraft-visuals', { recursive: true })
    writeFileSync('skraft-visuals/manifest.json', JSON.stringify({ screenshots: this.screenshots }))
  }
}
```

In a test, take the screenshot under `skraft-visuals/` and attach it with its title:

```ts
const path = `skraft-visuals/checkout-${testInfo.project.name}.png`
await page.screenshot({ path, fullPage: true })
await testInfo.attach('Checkout, card paid', { path, contentType: 'image/png' })
```

Add `skraft-visuals/` to the front end's `.gitignore`: only the engine's copies are committed.

## What comes next

> **Coming next.** Agents and lenses of your own repository: lots 3 and 4. Full roadmap: [Home]({{ "/en/" | relative_url }}); why these decisions stay in the engine: [Architecture]({{ "/en/explanation/architecture" | relative_url }}).

## Risks — reducing the controls

Each setting above can also **remove a proof**. The engine runs what you write: it cannot tell whether your command really tests anything. Before you reduce a control, write the reason down where the team will read it (the PR description, an ADR).

| What you do | What disappears | The sign to watch |
|---|---|---|
| Remove a gate from a component (delete `architecture` or `coverage`) | The matching proof: no more dependency check, no more coverage | The gate no longer shows in the output of `skraft gate` nor in `gates/<component>/` |
| Unlock the `mutation` node | Mutation testing, and the loop that kills surviving mutants | `skraft workflow diff` shows the unlock; the run journals the node as skipped with its reason. Deleting a component's `mutation` command instead stops the run at `mutation` as an `environment` failure |
| Replace a command with one that tests nothing (`"test": "node -e 0"`, a script that always exits 0, a filter that excludes almost every test) | The whole gate: it passes every time, whatever the code | `pass` evidence whose `stdout` shows no test run |
| Switch a component to `inprocess` with no contract test | The guarantee that your mocks still look like the real service; tests pass against an imaginary dependency | Green tests, then a failure at integration |
| Leave a component with no gate | Nothing proves that component; the engine reports it as an `environment` failure | `no gate command; …` in the output of `skraft gate` |
| Set `--base` or `baseBranch` to a ref that is too recent | Changed files fall outside the compared range: touched components are no longer kept by `skraft gate` | `no component changed since its base; no gate to run` while you did change code |
| Remove the `adr` ask node | Human ratification of the architecture decisions: ADRs stay `Proposed` | `skraft workflow diff` shows the node gone. Removing only its `REJECTED` edge's `max_visits` removes nothing: the engine refuses the workflow (`loop adr -> design -> design_review -> adr has no max_visits`) |
| Edit `events.jsonl` by hand to unblock a run | The journal as evidence: the chain breaks and the run is blocked with `journal-tampered` | See [Resume or unblock a run]({{ "/en/how-to/resume-a-run" | relative_url }}) |

To check that a gate still proves something, open its evidence (`.copilot-tracking/skraft-plans/<slug>/gates/<component>/<gate>-<n>.log`) and read what the command really did.

What mutation testing measures, and why removing it is costly: [Glossary]({{ "/en/reference/glossary" | relative_url }}) (Jia & Harman, 2011).

## See also

- [skraft-config.json reference]({{ "/en/reference/skraft-config" | relative_url }})
- [Zero hooks, controls in the engine]({{ "/en/explanation/hooks" | relative_url }})
- [Architecture: engine and drivers]({{ "/en/explanation/architecture" | relative_url }})

## Sources

- Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.
