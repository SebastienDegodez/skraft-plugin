---
title: "Hosts"
description: "Claude Code, Copilot CLI and VS Code: prerequisites, install, driver, commands, human questions, run tracking, and what each host can or cannot do."
persona: software-engineer
---

# Hosts

skraft runs under three hosts, Claude Code, Copilot CLI and VS Code, each driven by a driver that carries out what the same engine asks.

Why an engine and drivers, and the Copilot driver contract:
[Architecture](../explanation/architecture.md).

## Prerequisites <!-- #prerequisites -->

| Tool | Version | For |
| --- | --- | --- |
| Node | 22 or later | the engine, the `skraft` command line, the Copilot extension; `skraft doctor` checks it |
| Git | — | each component's base, commits, replays of red commits |
| `gh` | signed in to the repository's host | only to read the story's issue (`--issue`), open the pull request, comment on the issue, `skraft review --pr`; the `skraft` CLI and `skraft next` use it the same way (see [Forge](./skraft-config.md#forge)) |
| `az` | signed in to the organization, with its `azure-devops` extension | on Azure DevOps only, to read the story's work item (`--issue`), keep the run's comment on it, open the pull request, and review a pull request (`skraft review --pr`: read it, keep the review's thread); the `skraft` CLI and `skraft next` use it the same way (see [Forge](./skraft-config.md#azure-devops-az)) |
| Copilot CLI | — | Copilot CLI; under VS Code, the SDK driver (`skraft-run.mjs`) starts it headless |

## Install <!-- #install -->

| Host | Install |
| --- | --- |
| Claude Code | `/plugin marketplace add SebastienDegodez/skraft-plugin`, then `/plugin install skraft` |
| Copilot CLI | install `skraft` from the repository's marketplace, or install a clone with `copilot plugin install ./plugins/skraft-framework` |
| VS Code | `skraft` under `@agentPlugins` in the Extensions view, or a clone registered in `chat.pluginLocations` |

The `skraft-backlog` plugin (DISCOVER, DISCUSS) installs separately, from the same marketplace;
it shares no runtime code with `skraft`. So does the `skraft-brownfield` plugin.

## Drivers <!-- #drivers -->

A driver carries out what the engine asks; it decides neither the order, nor the verdict, nor
the progress. It alone starts agents (depth 1).

| Driver | Host | Starts the agents | Asks the questions | Shows the run |
| --- | --- | --- | --- | --- |
| `drivers/claude-mod/` | Claude Code | `$.agent.spawn`, a batch in parallel | `$.ui.ask`, the pane's buttons | Skraft pane, `/skraft` |
| `drivers/copilot-workflow/` | Copilot CLI | `ctx.agent`, bounded by `maxConcurrentSubagents` | question put once in the chat (`session.ui.select` or `input`); `ctx.pause` without an answer, then the `skraft_decide` tool or `skraft decide` | `skraft-pipeline` canvas, `/workflows` log |
| `drivers/copilot-sdk/` | VS Code, Copilot SDK present | starts the Copilot CLI headless and follows the `skraft-pipeline` workflow in it | in the terminal | terminal |
| `drivers/cli/` | VS Code without the SDK, and any terminal | `skraft next` writes the briefs, the orchestrator agent starts the sub-agents, `skraft record` resumes; lenses one after the other | `skraft decide` | `skraft status`, `WORKFLOW.md` |

Use cases each driver calls:

| Driver | Use cases |
| --- | --- |
| Claude Code mod, Copilot workflow | `Init`, `RunPipeline`, `Observe`, `Decide`, `ReviewPullRequest` |
| Copilot SDK | none directly: it runs the `skraft-pipeline` workflow in the Copilot CLI |
| command line | `Init`, `Observe`, `Decide`, `RunGate`, `Doctor`, `ConfigureComponents`, `WorkflowCommands`, `Publish`, `AdoptJournal`, `Migrate`, `ReviewPullRequest`, and `RunPipeline` through `next` / `record` |

## Start, answer, follow <!-- #at-a-glance -->

| Host | Start or resume a run | Answer a question | Follow the run |
| --- | --- | --- | --- |
| Claude Code | `/skraft <slug> [#issue] [title]`, or the `skraft-orchestrator` agent | the dialog, the pane's buttons, or `/skraft decide <answer>` | the Skraft pane, `/skraft` |
| Copilot CLI | `/skraft <slug> [#issue] [title…]` ([the command](#skraft-command)), or the `skraft:skraft-orchestrator` agent; both run the `skraft-pipeline` workflow | Copilot's dialog in the chat; else the `skraft_decide` tool or `skraft decide` in a terminal | the `skraft-pipeline` canvas, the `/workflows` log, `skraft status` |
| VS Code | `/skraft` in the chat says what to type but starts no run from there; `node "<plugin folder>/engine/drivers/copilot-sdk/skraft-run.mjs" <slug>`; without the Copilot SDK, the `skraft-orchestrator` agent, which conducts `skraft next` / `skraft record` | `skraft decide` in a terminal | `skraft status`, `WORKFLOW.md` |

Without a slug, the run resumes the working copy's active pipeline. One session drives a
pipeline at a time: a second one is refused (`pipeline-locked`) while the first holds the run's
lease.

The `skraft-orchestrator` agent only launches: under Claude Code its one tool is
`mcp__skraft__run_pipeline`; under Copilot CLI it runs the `skraft-pipeline` workflow; under
VS Code it conducts the `skraft next` / `skraft record` loop and writes only the reply files it
lists.

## Claude Code <!-- #claude-code -->

The mod (`hooks/skraft-mod.tsx`, the one module `hooks/hooks.json` declares) calls the engine
without Node or `import()`: it runs Git, the gates and the replays through `$.process.run`.
Every `/skraft` opens the **Skraft** pane (`skraft-pipeline`).

| In the conversation | Effect | Answer |
| --- | --- | --- |
| `/skraft <slug> [#issue] [title…] [--base <ref>] [--from-artifacts]` | Init of the slug, then a background run | `skraft <slug> started — progress in the Skraft pane.` |
| `/skraft`, `/skraft status`, `/skraft help` | view of the active pipeline | `skraft <slug> — <status>`, one line per phase (`✓` closed, `▶` open, `·` pending), reason, agent, `cost: ~$<amount> (approximate: it includes anything else exchanged in this session while an agent ran)` |
| `/skraft review <number> [--publish]` | reviews pull request `<number>` in the background, as `skraft review --pr` does, its lenses spawned together; the consent to publish asked in a dialog (header `Review comment`) | `skraft review #<number> started — progress in the Skraft pane.`; at the end the notification `skraft review #<number>: <status> (<code>) — <reason>`; no number: `skraft: /skraft review <pull request number> [--publish]` |
| `/skraft decide [<key>] <answer> [reason…]` | records the answer (same rules and refusals as `skraft decide`), then resumes the active pipeline | `<slug>: <key> answered <answer>; run the pipeline again to go on`, then the start line; refused: `skraft: not recorded — <reason>` |

In `/skraft <slug> …`, `#<number>` right after the slug gives the issue; the remaining words
form the title; `--base <ref>` and `--from-artifacts` may go anywhere after the slug. Other answers:

| Case | Answer |
| --- | --- |
| Init refused | `skraft <slug>: not started — <reason>` |
| a run is already going | `skraft is already running <slug>; see the Skraft pane.` |
| end of the run (notification) | `skraft <slug>: <status> (<code>) — <reason>` |

In `/skraft decide`, a first word shaped like a key (`adr-1`) names the question; without
it, the answer goes to the question the run waits on. The words after the answer are the
reason. For a `blocked` or `mutation-plan` question, every word after the key is the instruction
(`/skraft decide design-1 use the bank gateway`), and an option (`STOP`, `APPLY`) counts only typed alone.

When the engine asks a question, the mod opens a `$.ui.ask` dialog with the question, its
options and a header (`ADR`, `Reporting`, `Environment`):

| In the dialog | Effect |
| --- | --- |
| an option that is not a refusal | recorded as the answer; the run goes on |
| a refusal (`REJECTED`) | a second dialog: `Why REJECTED? Type the reason under Other; it goes back to the agent.`; the text typed under Other is the reason; `Not now` or `Answer later` give no answer |
| text typed under Other in the first dialog | an option typed in any case is that option; other text is a refusal with that text as its reason when the question has one (`adr-ratification`), the instruction for a `blocked` question (whose only option is `STOP`), and is refused as an answer otherwise (the run waits) |
| dialog dismissed | no answer: the run waits |

The **Skraft** pane shows the phases, each followed by its steps of the workflow graph
(`  ✓ design — solution-architect: done, pass 2, $1.00`: `✓` done, `▶` in progress, `·` to
come; what the step runs, its outcome, its pass from the second on, its cost), the current
agent, the last pass of each review (`review design_review: needs-rework — consistency fail
(1), fitness pass`), the last result of each gate by component (`gates api: test pass,
mutation fail (3 survivors)`), the cost and the latest lines of the progress log, as many as
the pane's height allows. `/skraft` prints the same view without the steps. While the run
waits, the pane and `/skraft` show the question and `answer: /skraft decide adr-1
RATIFIED|REJECTED (with your reason after REJECTED)`, or `answer: /skraft decide design-1
<instruction>|STOP` for a `blocked` question, whose only button is `STOP` (`APPLY|<instruction>|STOP` for `mutation-plan`, buttons `APPLY` and `STOP`).

The pane also shows one button per option of the question the run waits on. A press is the
person's answer, recorded as `/skraft decide` records it (same refusals), journaled
`by: "host"`, then the run resumes; the outcome goes to the transcript. A refusal (`REJECTED`)
first asks its reason in the dialog described above; without a reason nothing is recorded.
A press comes from the person on the pane (a click, its hotkey or Enter: `ui.press`, Claude
Code 2.1.304 mod API); no tool of the model raises one.
While a run of the session drives the pipeline, its own dialog asks and the pane shows no
button; a press then is refused (`skraft is running; answer in its dialog`). A press that fails
for another reason says `skraft: the answer could not be recorded; answer with /skraft decide`.

```console title="Skraft pane"
skraft checkout — running
▶ DESIGN
  ✓ design — solution-architect: done, pass 2, ~$1.00
  ▶ design_review — consistency, fitness: pass 2, ~$0.38
  ✓ adr — adr-ratification: answered
· DISTILL
  · distill
```

:::note[Screenshot pending a real run]
A capture of the **Skraft** pane in a Claude Code session replaces this block once a real run
produces it. Until then, the block shows the pane's text for a `checkout` run in DESIGN, as the
mod's view tests check it.
:::

**Tool `mcp__skraft__run_pipeline`** (called by the model): starts or resumes the pipeline
and returns at once; the run goes on in the background.

| Field | Type | Rule |
| --- | --- | --- |
| `slug` | string | kebab-case; absent or empty → resumes the active pipeline; the tool never picks a slug |
| `issue` | integer | taken only when positive |
| `title` | string | story title |
| `base` | string | git ref; only for a new slug |
| `fromArtifacts` | boolean | start in DESIGN from the DISCUSS stories, as `--from-artifacts` |

### Model and cost <!-- #claude-code-models -->

The first Claude Code model the configuration gives the agent's family goes
to `$.agent.spawn` as `model`; without one, the agent file's model decides. The effort is not
passed (`$.agent.spawn` takes no `effort`): the agent file's own applies; `skraft doctor` still
shows the effort assigned. The mod journals the session's cost before and after each agent, in
USD, approximate.

## Copilot CLI <!-- #copilot-cli -->

The `com.github.copilot/extensions/skraft-pipeline/` extension registers the `skraft-pipeline`
and `skraft-review` workflows, the `skraft_decide` tool and the `skraft-pipeline` canvas. The
working directory is the session's, read again when a run starts and on each tool call.

### `/skraft` command <!-- #skraft-command -->

The `skraft` plugin ships `com.github.copilot/commands/skraft.md`, which gives Copilot the syntax of
`/skraft` in Claude Code. Claude Code keeps the mod's `/skraft`: the plugin has no `commands/` folder
for it. The command prose is not verified by Vally.

**Name.** Measured by the host probe on Copilot CLI 1.0.105, in the SDK's command registry (the
interactive menu was not read): a plugin command named like its plugin is exposed without a prefix,
any other as `<plugin>:<command>`. The manifest of `skraft` is named `skraft`, so the command is
`/skraft`; `skraft-refine` of `skraft-backlog` is `/skraft-backlog:skraft-refine`. With both plugins
installed, each is listed once and none masks the other. The text typed after the command reaches
the prompt, appended at its end.

The first word picks the route. A route runs through Copilot only when the session offers the
`skraft-pipeline` and `skraft-review` workflows; otherwise the command starts no run, no review and
no agent, and says what to type.

| Typed | With the workflows | Without them |
| --- | --- | --- |
| `/skraft`, `/skraft status`, `/skraft help` | opens the `skraft-pipeline` canvas on its Run tab; starts and resumes nothing | tells you to type `skraft status` |
| `/skraft <slug> [#issue] [title…] [--base <ref>] [--from-artifacts]` | runs `skraft-pipeline` with `{ slug, issue, title, base, fromArtifacts }`, and relays its status, code and reason | starts nothing: gives the `skraft-run.mjs` line to type, or tells you to select the `Skraft - Orchestrator` agent |
| `/skraft decide [<key>] <answer> [reason…]` | Copilot's dialog asks the question again; the typed answer is never recorded | tells you to type `skraft decide [<key>] <answer> [--reason "<reason>"]` |
| `/skraft review <number> [--publish]` | runs `skraft-review` with `pr` and `publish` | tells you to type `skraft review --pr <number> [--publish]` |
| `/skraft backlog [criteria…]` | hands over to the backlog agents (below) | same |

Examples, the same as in Claude Code:

```console title="Claude Code"
> /skraft paiement #42 Paiement par carte
> /skraft paiement --base develop
> /skraft paiement --from-artifacts
```

Two intended differences from Claude Code. `decide` records nothing from the typed words: under
Copilot a human decision is recorded only after the host's dialog returns it. `backlog` is a
reserved word, unless a pipeline named `backlog` already exists (`.copilot-tracking/skraft-plans/backlog/`): then
`/skraft backlog …` takes the Run route, resumes or starts that pipeline, and says that for the backlog route you
select `Skraft - Backlog Discoverer` as the chat's agent directly.

`/skraft backlog [criteria…]` needs the optional `skraft-backlog` plugin; without it the command says so and
gives `copilot plugin install skraft-backlog@skraft`, and every other route still works. With it, the command starts no
agent: you select `Skraft - Backlog Discoverer` as the chat's agent and give it the criteria, then `Skraft - Backlog Planner` to
refine the issue you choose, then `/skraft <slug> --from-artifacts` develops the story. Each step waits for you;
nothing moves to development by itself.

There is no `story` or `resume` subcommand, and no `--issue` or `--title` option in the chat. A typed `#42` alone is passed as a slug and the engine
refuses it.

### `skraft-pipeline` workflow <!-- #skraft-pipeline -->

The `skraft-pipeline` dynamic workflow starts agents through `ctx.agent`.

| Arg | Type | Rule |
| --- | --- | --- |
| `slug` | string | present → Init then run; absent → resume the active pipeline |
| `issue` | integer | issue number |
| `title` | string | story title |
| `base` | string | git ref; only for a new slug |
| `fromArtifacts` | boolean | start in DESIGN from the DISCUSS stories, as `--from-artifacts` |
| `agentIds` | object | `{ "<agent file id>": "<session agent id>" }` |

Any other key is refused (`invalid-args`), and so is an `agentIds` entry that does not name a session agent for that same agent file (`invalid-agent-ids`); nothing starts and the refused value is never echoed.

The workflow returns `{ status, slug, phase, code, reason }` (`status` = `done`, `blocked`,
`waiting` or `refused`) and logs `<slug>: <status> (<code>): <reason>`. A resume does not
restart an agent whose outputs are already filled.

When the engine asks a question, the workflow puts it to the person once, in Copilot's own
dialog in the chat: a choice among its options (`session.ui.select`), or a text field for a
question that takes an instruction, a `blocked` step's or the `mutation-plan`, where the person
writes an option or the instruction (`session.ui.input`). A refusal (`REJECTED`) asks its
reason next, in a text field. The value the dialog gives is the answer, journaled
`by: "host-confirmed"`; nothing asks to confirm it again, and the run goes on. When Copilot cannot
put the question (no dialog, `autopilot` mode, a mode it does not tell, too many questions in a
short time) or the person dismisses it, the workflow logs why and how to answer, then pauses
durably with `ctx.pause(<key>)`:

```
Waiting for you — <question>
adr-1 was not answered: <why>. Resume this run to be asked again, ask Copilot in the chat to put the question to you, or type skraft decide adr-1 RATIFIED|REJECTED in a terminal and resume this run.
```

### `skraft-pipeline` canvas <!-- #canvas -->

| Rule | Detail |
| --- | --- |
| Input | `tab` only, the tab the page shows first (`run`, `configuration` or `workflow`); a slug or any other key is refused; it shows the active pipeline (`.active-slug`) of the session's directory, read on each open, action and refresh |
| Content | four tabs. **Run**: each phase and its steps, the last pass of each review, each component's last gate results, the edges taken, the question waiting; no cost. **Configuration**: the forge, the components as written, the consents, the models and what each agent of the workflow receives per host, the quality bar read-only. **Workflow**: each workflow the run can follow, step by step, with the run's current step highlighted. **Journal**: read-only, from `events.jsonl`; each step recorded (pass, attempt, outcome, the edge taken) and each human decision (answer, reason, `by`), the last 200, with the state of the hash chain (intact, broken, unverifiable); a broken chain shows no entry |
| Action | `get_pipeline` and `get_configuration`, read-only; the page has no answer form nor route. The one write is an edit of the configuration from the Configuration tab: components and consents go to `skraft-config.json`, `assign` and `models` to `skraft-config.local.json`; the engine checks every edit as a run loads it and writes nothing it would refuse |
| Server | one server on 127.0.0.1 per open instance, token in the URL, CSP `default-src 'none'`; 4 instances at most; the only route that writes is `POST /configuration` (token in `X-Skraft-Token`, JSON of at most 64 KiB) |

The question waiting is followed by `Answer it
in the Copilot chat, where Copilot puts it to you; or type skraft decide <key> <answers> in a
terminal.`; it takes no answer.

While a question waits, a **We need you** button shows in the header. It leads to the question on the Run tab, and so does the `n` key outside a field. It answers nothing: the answer goes through Copilot's dialog or `skraft decide`.

![skraft-pipeline canvas: status WAITING, a "We need you" button in the header and a "Pull request" box with the question and how to answer it, RESEARCH open on publish_consent, the other phases to come](/img/screenshots/shared/pipeline-canvas-question.png)

The page speaks the browser's language, French or English. The sentences the driver fixes (no working directory, an unreadable pipeline or configuration, a configuration that could not be saved, where to answer the question) and the page's own words follow it; what the engine writes (steps and their outcomes, reviews, the question, the engine's refusals) shows as the engine wrote it, and the model reads the English text of `get_pipeline` and `get_configuration`. Each phase says its state in a word (closed, under way, to come) and each step in a word only a screen reader reads; a polite live region announces a new run status and a question that comes to wait. The consents are one tab stop per choice group: the arrow keys, Home and End move the choice. Under forced colours the chosen choice, the selected tab and the phase and step under way keep a fill, a border or an outline, and `prefers-contrast: more` darkens the soft text and the rules. After five attempts to reach its server again (about 45 s) the page says to close the canvas and open it again from Copilot: a server started again has a new address and token, which a reload cannot reach. All of this is checked in a browser with emulated colours and contrast; it was not read with a screen reader nor with Windows High Contrast.

Before the first phase of a working copy, the workflow opens the canvas on its Configuration tab and puts the `configuration` question in the chat: *Start this run with the configuration of this working copy?* `START` goes on and is kept in `skraft-config.local.json` (`configurationConfirmed`), so later runs start without asking; `STOP` starts nothing. Pass `configure: true` to the workflow to be asked again. The CLI and the Claude Code mod never ask it.

### `skraft_decide` tool <!-- #skraft-decide -->

No argument; any key is refused. It puts the question the active
pipeline waits on to the person once, in Copilot's dialog, as the run does, and records what
they give through the same use case as `skraft decide` (same rules and refusals: an instruction
over 1000 characters is refused), journaled `by: "host-confirmed"`. Neither the question nor the
answer comes from the model. Without a dialog, in `autopilot` mode, or when the person does not
answer, nothing is recorded and the person answers with `skraft decide` in a terminal. It
answers `Recorded: <slug>: <key> answered <answer>; run the pipeline again to go on. Resume the
paused skraft-pipeline run (/workflows).`, or `Refused: <reason>; nothing was recorded.`
Resuming the run acts on the answer; agents already done are not run again.

### `skraft-review` workflow <!-- #skraft-review -->

Arguments { `pr`, `publish`, `agentIds` }. It reviews one pull request as
`skraft review --pr` does, its lenses through `ctx.agent`. `pr` is a positive integer; any other
key or value is refused (`invalid-args`) without being echoed. With `publish: true`, the consent
is logged, then confirmed by the person in the host's dialog (`session.ui.confirm`: keep one
review comment on pull request #N) and journaled `by: host-confirmed`; in autopilot or without a
dialog nothing is recorded or posted, and the log points to `skraft review --pr <number> --publish`
in a terminal.
It returns the review's outcome and logs `skraft review #<number>: <status> (<code>): <reason>`.

### Model and cost <!-- #copilot-models -->

A dispatch carries the Copilot models the configuration gives the agent's
family (the preferred first) in the `model` option, and its effort in `reasoningEffort`. Copilot
refuses the effort: the same call goes again without it. Copilot refuses the model: the next one
in the list, then the session's model. With no model configured, the agent runs on the session's
model. No cost is journaled: Copilot counts credits.

## VS Code <!-- #vs-code -->

`skraft doctor` says which of the two drivers applies (its `vscode` check).

### Copilot SDK driver <!-- #copilot-sdk -->

```console
$ node "<plugin folder>/engine/drivers/copilot-sdk/skraft-run.mjs" [<slug>] [--issue <number>] [--title <text>] [--base <ref>] [--from-artifacts] [--allow-all-tools]
```

| Rule | Detail |
| --- | --- |
| SDK | the newest `~/.copilot/pkg/<platform>/<version>/` that holds `copilot-sdk/index.js` and the CLI entry; `COPILOT_CLI_PATH` set to that entry unless it is set |
| Run | opens a headless session in the working copy with the plugin, runs the `skraft-pipeline` workflow and follows it to a final status; the engine and the Copilot workflow driver do the rest inside the CLI |
| Permissions | each permission an agent asks for is put at the terminal (`y` approves it once); `--allow-all-tools` approves all; with no terminal, rejected |
| Question | a paused run waits: `skraft decide` in a terminal, then `skraft-run.mjs` again |
| Exit code | 0 run done or waiting; 1 otherwise; 2 malformed line |
| Failures | each SDK call has a timeout (`rpc-timeout`), following the run a deadline (`run-too-long`); Ctrl-C stops the follow; no SDK text is passed on |

:::note[Screenshot pending a real run]
A capture of VS Code with `skraft-run.mjs` following a run in its terminal replaces this note
once a real run produces it. Until then, the command above is what you type in that terminal.
:::

### `next` / `record` agent loop <!-- #agent-loop -->

Without the Copilot SDK, the `skraft-orchestrator` agent conducts the command line's loop:

1. `skraft next` runs the active pipeline until it needs agents or a human; for each agent it
   writes a brief and an empty reply file under `<tracking folder>/results/loop/` and lists them
   in `pending.json`.
2. The orchestrator starts each agent named, on the model given, and saves its final reply in
   its reply file.
3. `skraft record` hands the replies to the run and goes on as `next` does.
4. A question stops the loop: a human answers with `skraft decide` in their terminal, then the
   orchestrator runs `skraft next` again.

Lenses run one after the other. The journal is the Copilot workflow's, without the models and
costs the loop cannot know. Synopsis, outputs and codes:
[`skraft next` and `skraft record`](./cli.md).

## What each host can do <!-- #capabilities -->

| Capability | Claude Code | Copilot CLI | VS Code + SDK | VS Code, `next` / `record` loop |
| --- | --- | --- | --- | --- |
| A review's lenses in parallel | yes (batch) | yes, bounded by `maxConcurrentSubagents` | yes (Copilot workflow) | no, one after the other |
| Model passed to the agent | yes, the family's first Claude Code model | yes, the list of Copilot models, with fallback | yes (Copilot workflow) | named in `next`'s output; the orchestrator picks it |
| Effort passed | no (the agent file's) | yes (`reasoningEffort`), dropped if Copilot refuses it | yes (Copilot workflow) | no |
| Cost journaled | yes, approximate USD | no | no | no |
| Question put in the host | yes: dialog and pane buttons | yes: dialog in the chat; refused in `autopilot` or without a dialog | no: `skraft decide` | no: `skraft decide` |
| `by` journaled for an answer | `host` (dialog, button), `decide` (`/skraft decide`) | `host-confirmed` | `cli-tty` | `cli-tty` |
| Run view | Skraft pane | `skraft-pipeline` canvas (read-only) | terminal | `skraft status`, `WORKFLOW.md` |
| Review a pull request | `/skraft review <number>` | `/skraft review <number>`, or the `skraft-review` workflow | `skraft review --pr` (loop) | `skraft review --pr` (loop) |
| `/skraft` command available | yes (the mod) | yes, measured as `/skraft` in the SDK registry (CLI 1.0.105; menu not read) | wired, not measured under VS Code | wired, not measured under VS Code |
| Engineering run available | yes | yes | wired, tested on a simulated host, not yet run for real (#222) | wired, tested on a simulated host, not yet run for real (#222) |

## See also <!-- #see-also -->

- [The skraft command line](./cli.md)
- [Tracking folder and journal](./run-journal.md)
- [Choose the agents' models](../how-to/choose-models.md) — models and effort per host
- [Architecture](../explanation/architecture.md)

Terms to know: **host**, **host driver**, **engine**, **slug** — see the
[glossary](./glossary.md).
