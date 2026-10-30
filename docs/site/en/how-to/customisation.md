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

Settings go through `skraft-config.json`, at the root of the working copy that starts the run; the steps of a run go through the workflow, which `skraft workflow eject` copies into `.skraft/`.

| What | Where | Effect | Guide |
|---|---|---|---|
| Components | `components[]`: `name`, `root`, `stack` | What the engine builds and tests, a neighbour repository included (`../payment-web`) | [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}) |
| Commands | a component's `commands` | A command you write is **always** the one that runs; the engine never replaces it with a default | [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}) |
| Gates | the commands named `build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation` | What the DELIVER gate nodes and `skraft gate` run, in that order | [Run the gates]({{ "/en/how-to/run-gates" | relative_url }}) |
| Base | global or per-component `baseBranch`, `--base <ref>` at init | The commit compared with: changed components, `{baseSha}` in commands | [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}) |
| Mocking | `mocking.strategy`: `"microcks"` or `"inprocess"` | `inprocess` by default for TypeScript, JavaScript and React, `microcks` otherwise; `microcks` needs Docker or Podman for the tests that use it | [Configure the components]({{ "/en/how-to/configure-components" | relative_url }}) |
| Write scope and contract tests | a component's `paths` (`src`, `tests`) and `contractTesting` | Where the software engineer may write in DELIVER; whether it reads the contract testing skills | [skraft-config.json]({{ "/en/reference/skraft-config" | relative_url }}) |
| Workflow | `.skraft/pipeline.skraft.dot`, `.skraft/review.skraft.dot` | Agents, lenses, gates and questions of your own | [below](#own-agent) |
| Models and effort | `models`, `assign`, also in `~/.skraft/config.json` and `skraft-config.local.json` | The model and the reasoning effort of each agent, per host | [below](#models-and-effort) |

What cannot be tuned:

- **Quality thresholds** are not configurable.
- The order of phases, the number of attempts of an agent and the blocking codes live in the engine.
- The engine's own checks (journal, write scope, expected outputs) are not workflow nodes: no copy removes them. DELIVER gates are locked and reviews mandatory.

Other top-level keys of `skraft-config.json` are kept as they are by `skraft init`.

## Choose the model and the effort of each agent {#models-and-effort}

`models` and `assign` choose what each agent runs on, on Claude Code and on Copilot. Four files apply, each one a JSON Merge Patch on the ones before it (an object is merged key by key, a list or a value replaces the earlier one, `null` removes it):

1. the plugin's defaults: `economy` → `haiku`, `standard` → `sonnet`, `frontier` → `opus` on Claude Code; lenses on `reviewer`, `solution-researcher` on `researcher`, `solution-architect` on `planner`, every other agent on `implementer`;
2. `~/.skraft/config.json`, yours, for every repository;
3. `skraft-config.json`, the team's, committed;
4. `skraft-config.local.json`, yours, never committed: `skraft init` adds it to `.gitignore`.

Files 2 and 4 follow `plugins/skraft-framework/schemas/skraft-config.local.schema.json` and hold no `components`; file 3 follows `skraft-config.schema.json`. No file names a workflow: the run follows `.skraft/pipeline.skraft.dot` when you ejected it.

- **A family** is a tier (`economy` < `standard` < `frontier`, the only rank), a role whose tier is built in (`reviewer` → economy, `researcher` and `implementer` → standard, `planner` → frontier; `"tier"` changes it) or a free family that declares its `"tier"` (`gpt-codex`). A family is never a versioned model: `gpt-5.5` is a model.
- **`models`** gives each family, per host (`claude-code`, `copilot`), a `model` — or a list tried in order, with the same effort — and an `effort` (`low`, `medium`, `high`, `xhigh`, `max`). What a family leaves out comes from its tier, then the host decides.
- **`assign`** chooses the family: a string names it, `inherit` leaves the choice to the host, an object adds an `effort` per host (never a model), `null` removes a rule a lower file set.

Resolution, family and effort apart:

| What | First that applies |
|---|---|
| Family | `assign.agents.<agent>` → the family a workflow in force names (`model=`, `<lens>@<family>`, `refuter=`) → `assign.types.<phase, lens, refuter, worker>` → `assign.default` → the host (Claude Code: the agent file's `model:`; Copilot: `/agents`, then the session) |
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

The workflow is a DOT graph (`workflows/pipeline.skraft.dot` in the plugin; `skraft workflow eject` copies it into `.skraft/pipeline.skraft.dot`). A node of shape `hexagon` is an **ask node**: it puts a question to a human, and the run waits until the answer comes. The default workflow asks for the ratification of the ADRs DESIGN proposed, once the design review approved them (the review loops after DESIGN shortened):

```text
start -> publish_consent -> visuals_consent -> research -> design -> design_review_lenses -> … -> design_review
publish_consent [shape=hexagon, question="publish-consent"]
visuals_consent [shape=hexagon, question="reporting-consent"]
design_review -> design  [label="NEEDS_REWORK", max_visits=3]
design_review -> adr     [label="APPROVED"]
adr      [shape=hexagon, question="adr-ratification"]
adr -> distill   [label="RATIFIED"]
adr -> design    [label="REJECTED", max_visits=3]
distill -> distill_review_lenses -> … -> distill_review -> deliver -> gates -> deliver_review -> mutation -> visuals -> pr_writer -> publish -> exit
visuals  [shape=parallelogram, publish="playwright-visuals", when="frontend"]
deliver_review -> deliver [label="NEEDS_REWORK", max_visits=3]
mutation -> kill_proposal [label="FAIL", max_visits=5]
kill_proposal [agent="software-engineer", each="survivor-file", proposal=true]
kill_proposal -> mutation_plan
mutation_plan [shape=hexagon, question="mutation-plan"]
mutation_plan -> kill_mutants [label="APPLY"]
kill_mutants [agent="software-engineer", each="survivor-file"]
kill_mutants -> mutation_review_lenses -> mutation_review_test_integrity -> mutation_review
mutation_review -> mutation_gates [label="APPROVED"]
mutation_gates [shape=parallelogram, gate="build,format,lint,test,architecture,coverage", goal_gate=true]
mutation_gates -> kill_mutants [label="FAIL", max_visits=3]
mutation_gates -> mutation [label="PASS"]
```

The `gates` and `mutation` nodes are `locked=true`: a repository workflow drops one only with `unlock="<reason>"`. Unlocking `mutation` is the only way to run without mutation testing; it is not recommended. A gate node that runs every gate of a locked one, with `goal_gate` if it has it, stands in for it on a path: `mutation_gates` runs the gates of `gates` again after `kill_mutants`.

Mutation runs last, once, on the code the DELIVER review approved: a review that asks for rework sends the run back to `deliver`, `gates` and `deliver_review`, never through mutation.

The engine judges mutation from the report the tool writes, not from its exit code. It scores the files changed since the component's base (every file of the report when there is no base or Git cannot list the changes): the core (a file under a folder of the component whose last word is `domain` or `application`, as in `Checkout.Domain`, `checkout-domain`, `src/cart/application`) must reach 100 %, the boundary (everything else) 80 %. A score is detected mutants (killed, timed out, and PIT's memory errors) over detected and surviving ones (survived, no coverage); the bar is not configurable and decides, whatever the tool's exit code. When a scope misses its bar, the engine sends that scope's surviving mutants to `kill_proposal`, one dispatch per file: the software engineer writes, in a file the engine creates under `proposals/`, one outcome per mutant (`test:` the test that kills it, `delete:` the code no behaviour asks for, `equivalent:` why no test can tell it apart), and changes no code. Then the `mutation-plan` question asks you once, naming those files: `APPLY` applies them, your own words tell how to treat the mutants instead, `STOP` ends the run `blocked`. `kill_mutants` applies your choice, `mutation_review` checks it with `test-integrity`, `mutation_gates` runs the gates again, then mutation runs again. No answer lets survivors through: the bar stays. The loop stops when mutation passes; when two rounds leave no fewer mutants alive than the best round before them (`mutation-stalled`); or at its `max_visits`. The last two stops name the mutants that remain.

The report is read where each stack's default command writes it, under the component root: `StrykerOutput/reports/mutation-report.json` (.NET), `reports/mutation/mutation.json` (JavaScript, TypeScript, React), `mutation-report.json` (Python), `target/pit-reports/mutations.xml` (Java, Maven) or `build/reports/pitest/mutations.xml` (Gradle). It must be in the mutation-testing-elements JSON format or be PIT's XML. The mutation scripts of the `quality-gates-*` skills publish their report at that path, and only from a sound run: one that passed, or that only its score fails. With them, leave `mutationReport` unset. A command that writes elsewhere names its file with `mutationReport` on the component, relative to its root; it names the report the command publishes for the engine, never the copy a script keeps in its evidence folder, which is written whatever the run. With Gradle, set PIT's `outputFormats` to include `XML` in the build; a multi-module Maven project writes one report per module, so name the one to read with `mutationReport`. A mutation run without a readable report waits for a human, whatever its exit code, and so does a failed run whose report counts no mutant. Each default uses its tool's incremental mode, so a round of the loop does not mutate the whole project again: StrykerJS `--incremental`, PIT `-DwithHistory`, Stryker.NET `--since:{baseSha}`; whatever the tool mutates, the bar is judged on the files changed since the base.

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

The engine refuses a workflow with an unknown question, an ask node without `question`, two unlabelled edges out of an ask node, two edges for the same answer, a label that is not an answer, a refusal without its own edge, or a loop none of whose edges carries `max_visits`. Examples: `node adr: REJECTED needs an edge of its own, back to the node whose work it refuses`, `node adr: no edge for RATIFIED; label one RATIFIED, or leave one unlabeled`, `loop adr -> design -> design_review_lenses -> design_review_consistency -> design_review -> adr has no max_visits`.

## Change a review {#reviews}

A review is a fan-out (`shape=component`), one lens node per branch (`shape=note`, `lens="<name>"`, run as the agent `<name>-lens`) and a fan-in (`shape=tripleoctagon`) that refutes the findings, computes the verdict and carries the `APPROVED` and `NEEDS_REWORK` edges. To add a lens of your own repository to the design review, add one node and one chain of two edges:

```text
design_review_threat_model [shape=note, lens="threat-model"]
design_review_lenses -> design_review_threat_model -> design_review
```

The lens runs with the others; `.claude/agents/threat-model-lens.md` or `.github/agents/threat-model-lens.md` must exist. `model="<family>"` on a lens node names its family; `when="mock"` or `when="contract"` runs it only when the changes touch mocks or contracts ([triggers]({{ "/en/reference/cli" | relative_url }})). `skraft workflow diff` lists each lens node added, removed or changed.

The DELIVER review lives in its own file, `workflows/review.skraft.dot`, which `deliver_review [shape=house, workflow="review"]` calls. To add a lens to it, copy it with `skraft workflow eject review` (it lands in `.skraft/review.skraft.dot`) and add the node and its two edges between `lenses` and `verdict`:

```text
threat_model [shape=note, lens="threat-model"]
lenses -> threat_model -> verdict
```

The lens then runs in DELIVER whether the plugin's pipeline or your copy calls `review`. `review.skraft.dot` takes its inputs (`base`, `head`, `story`, `documents`, `components`) from the call: remove `input_documents` and its lenses review the changes without the run's documents ([call node]({{ "/en/reference/cli" | relative_url }})).

The review fan-ins of DESIGN, DISTILL and mutation, the call `deliver_review`, and in `review.skraft.dot` its fan-in and the lenses `test-integrity` and `architecture-boundaries`, are `mandatory=true`: no repository workflow drops, bypasses or weakens them, not even with a reason. Changing a mandatory lens's `model=` is allowed; adding a `when` to it, moving it to another review or sending the review's `NEEDS_REWORK` to another phase is refused; so is an agent of the review's phase added after it, put it before the review or in a phase of its own ([rules]({{ "/en/reference/cli" | relative_url }})).

`skraft workflow check` refuses a branch that skips the fan-in, a fan-in without a fan-out, a lens twice in one review and a verdict edge on the fan-out. A workflow ejected before this form still writes `lenses="a,b,c"` on a `component` node: the check refuses it and writes out, for each such node, the nodes and edges that replace it, ids included, so that the copy matches the plugin's workflow again (`skraft workflow diff` then lists only your own changes).

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
- On Azure DevOps (`forge`, or a remote on `dev.azure.com`, `ssh.dev.azure.com` or `*.visualstudio.com`), skraft runs `az repos` with the organization, project and repository the remote's URL names. Install the Azure CLI, then `az extension add --name azure-devops`, and sign in once: `az login`, or `az devops login --organization <organization URL>` with a personal access token. The body goes through a file (`--description @<file>`), the pull request is linked to the story's work item (`--work-items`), and its body opens with `AB#<work item>`. Under Windows, skraft starts the Python of the Azure CLI installer (`<CLI2>\python.exe -IBm azure.cli`, next to `wbin\az.cmd`) instead of `az.cmd`, so that no shell reads the title; another `az.cmd` starts through `cmd.exe`.
- git and ssh never prompt: a push that needs a password or a passphrase fails at once, and the run says so.
- A closed or merged pull request of the branch is left alone: skraft opens no other one. A body someone edited since skraft wrote it is never overwritten.
- What an agent writes is made inert before it is published: closing keywords followed by an issue reference and @mentions go in code spans, HTML tags are dropped; only the engine's own `Closes`/`Refs` line refers to the issue.
- An open pull request of the branch is updated, only when its body changed; skraft never opens a second one.
- Without consent, a remote, `gh` or its sign-in, on a detached HEAD or on the base branch, the run completes locally and says why. The description stays in `.copilot-tracking/skraft-plans/<slug>/pull-request.md`; once the cause is fixed, `skraft publish` opens or updates the pull request.
- The description starts with `Refs #<issue>`; `Closes #<issue>` only when the pull request targets the default branch. Decisions, tests, red evidence, gates, review, the run summary and the AI disclosure are rendered from the journal; a section with nothing recorded says so. What changes, Why, Decisions applied and Out of scope show under their headings; Tests, RED evidence, Quality gates, Review, Screenshots, Run summary and AI disclosure are folded in a `<details>` block that opens on a click, its summary counting what it holds (`Quality gates: 3 passed`, `Review: 2 findings`). Quality gates stays open when a gate failed, Review when a finding waits on a human (`Review: 4 findings, 1 for a human`). `pull-request.md` is rendered the same way.
- After each step, the tracking folder also holds `run-report.md` (time, cost and retries per step; `skraft report` prints it) and `WORKFLOW.md` (each step done, in progress or to come).
- After each step, the tracking folder also holds `qa-report.md`, for the team that qualifies the story, built by the engine from the journal alone:
  - a link to the test plan DISTILL writes (`details/<date>/test-plan-<slug>.md`);
  - per component, the last result of each gate with its time and a link to its log; under it, the mutation score of each scope (core and boundary, with its bar and how many mutants it counts) and every mutant left alive, also in a scope that meets its bar (`mutation report not read` when the last mutation run left no report to read);
  - the red commits of the TDD cycles (DISTILL's acceptance test included) with the exit code of the replay that proved them red when the engine replayed them: the test command's, or the e2e command's when every test command passed at the commit;
  - the last pass of each review: its verdict, how many findings the lenses gave, what each lens said.

  No coverage percentage is shown: the `coverage` gate passes only when its command meets the quality bar, and its log is the evidence. A commit subject, a mutant line and the status reason, which an agent or a tool wrote, each sit in a code span.

## Follow a run on its issue {#issue-progress}

A run started from an issue (`/skraft checkout #42 …`, `skraft init checkout --issue 42`, the workflow's `issue` argument) first reads it: when it starts, the engine reads the issue through `gh` on the repository `gh` would pick (its default, else the `upstream` remote, else `origin`) and keeps it in `<slug>/plans/<date>/issue-<number>.md`, which every agent and every review lens reads first. When the issue cannot be read (no remote naming a host and a repository, `gh` missing or not signed in to that forge, a forge other than GitHub, `gh` failing), the run starts all the same: its agents get the issue's number and title only, `run.started` journals why in `issueUnread`, and `skraft init` says so. A number the forge answers for with no issue (`issue-not-found`) or with a pull request (`issue-is-pull-request`) starts nothing. A resumed run never reads the issue again.

Such a run also keeps one comment on that issue, once you accepted the current `publish-consent` question:

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
- The pull request shows at most six screenshots of each theme of a component and says how many others are in its evidence folder; a body past 60,000 characters has its longest sections cut with a mark, an open Quality gates or Review only once nothing else can give, never inside a tag or a `<details>` block it leaves open, `pull-request.md` keeping it whole.
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

## Add an agent of your own repository {#own-agent}

After `skraft workflow eject`, add a box node that names an agent of your repository, then put it on the path. For example, a security review before DISTILL replaces the edge `adr -> distill [label="RATIFIED"]`:

```text
security [shape=box, agent="acme-security-reviewer", phase="DISTILL", outputs="security-review.md"]
adr -> security [label="RATIFIED"]
security -> distill
```

`.claude/agents/acme-security-reviewer.md` (Claude Code) or `.github/agents/acme-security-reviewer.agent.md` (Copilot) must exist. A repository agent writes what its node declares: `outputs=` for its documents in the tracking folder, `writes=` for paths of the working copy; anything else fails the write-scope check. Its phase is DISTILL: an agent of DESIGN added after the design review would skip that review, and `skraft workflow check` refuses it (`security reaches the exit without passing mandatory node design_review`). With the node above, `skraft workflow check` prints `.skraft/pipeline.skraft.dot is valid: phases RESEARCH, DESIGN, DISTILL, DELIVER, PUBLISH`. It refuses an agent it cannot find, and `skraft doctor` shows the model family the agent runs on. Why these decisions stay in the engine: [Architecture]({{ "/en/explanation/architecture" | relative_url }}).

## Risks — reducing the controls

Each setting above can also **remove a proof**. The engine runs what you write: it cannot tell whether your command really tests anything. Before you reduce a control, write the reason down where the team will read it (the PR description, an ADR).

| What you do | What disappears | The sign to watch |
|---|---|---|
| Remove a gate from a component (delete `architecture` or `coverage`) | The matching proof: no more dependency check, no more coverage | The gate no longer shows in the output of `skraft gate` nor in `gates/<component>/` |
| Remove a review, the call to `review`, or its `test-integrity` or `architecture-boundaries` lens | Nothing: they are `mandatory=true`, the engine refuses the workflow, an ejected `review.skraft.dot` included | `mandatory node <id> …; this node is mandatory and cannot be removed` from `skraft workflow check` |
| Unlock the `mutation` node | Mutation testing, and the loop that kills surviving mutants | `skraft workflow diff` shows the unlock; the run journals the node as skipped with its reason. Deleting a component's `mutation` command instead stops the run at `mutation` as an `environment` failure |
| Replace a command with one that tests nothing (`"test": "node -e 0"`, a script that always exits 0, a filter that excludes almost every test) | The whole gate: it passes every time, whatever the code | `pass` evidence whose `stdout` shows no test run |
| Switch a component to `inprocess` with no contract test | The guarantee that your mocks still look like the real service; tests pass against an imaginary dependency | Green tests, then a failure at integration |
| Leave a component with no gate | Nothing proves that component; the engine reports it as an `environment` failure | `no gate command; …` in the output of `skraft gate` |
| Set `--base` or `baseBranch` to a ref that is too recent | Changed files fall outside the compared range: touched components are no longer kept by `skraft gate` | `no component changed since its base; no gate to run` while you did change code |
| Remove the `adr` ask node | Human ratification of the architecture decisions: ADRs stay `Proposed` | `skraft workflow diff` shows the node gone. Removing only its `REJECTED` edge's `max_visits` removes nothing: the engine refuses the workflow (`loop adr -> design -> design_review_lenses -> design_review_consistency -> design_review -> adr has no max_visits`) |
| Edit `events.jsonl` by hand to unblock a run | The journal as evidence: the chain breaks and the run is blocked with `journal-tampered` | See [Resume or unblock a run]({{ "/en/how-to/resume-a-run" | relative_url }}) |

To check that a gate still proves something, open its evidence (`.copilot-tracking/skraft-plans/<slug>/gates/<component>/<gate>-<n>.log`) and read what the command really did.

What mutation testing measures, and why removing it is costly: [Glossary]({{ "/en/reference/glossary" | relative_url }}) (Jia & Harman, 2011).

## See also

- [skraft-config.json reference]({{ "/en/reference/skraft-config" | relative_url }})
- [Zero hooks, controls in the engine]({{ "/en/explanation/hooks" | relative_url }})
- [Architecture: engine and drivers]({{ "/en/explanation/architecture" | relative_url }})

## Sources

- Jia, Y. & Harman, M., *An Analysis and Survey of the Development of Mutation Testing*, 2011.
