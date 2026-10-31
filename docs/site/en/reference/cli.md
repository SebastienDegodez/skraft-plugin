---
layout: doc
lang: en
title: "The skraft command line"
description: "Every skraft command: synopsis, options, effect, text and JSON output, exit codes."
persona: software-engineer
---

# The skraft command line

> `skraft` is the command-line entry point to the engine: each command calls one use case and prints what it returns, deciding nothing itself.

What the hosts offer in place of these commands (`/skraft`, the `skraft-pipeline` workflow, `skraft_decide`, the SDK driver): [Hosts]({{ "/en/reference/hosts" | relative_url }}). The syntax of the workflows `skraft workflow` copies and validates: [The DOT workflow]({{ "/en/reference/workflow-dot" | relative_url }}).

## Calling skraft

The entry point is a Node script shipped in the plugin. Replace `<plugin folder>` with the
folder where your host installed the skraft plugin:

```
node "<plugin folder>/engine/drivers/cli/skraft.mjs" <command>
```

The same form works under sh and PowerShell. Run it **from the root of the working copy**:
`skraft-config.json` and `.copilot-tracking/` are read and written there. The rest of this
page writes `skraft <command>`: the command the npm package `@skraft/cli` installs
([the `skraft` command](#skraft-command)), or the full line above. Prerequisites: Node 22 or later, Git.

## Synopsis

```
usage: skraft --version
       skraft init [--add <folder>]...                                   detect the components into skraft-config.json
       skraft init <slug> [--issue <number>] [--title <text>] [--base <ref>] [--from-artifacts]   start or resume a pipeline
       skraft status [--json]
       skraft report [--json]                                            time, cost and retries of each step of the active pipeline
       skraft decide [<key>] <answer> [--reason <text>]                answer the question the active pipeline waits on
       skraft publish                                                    push the branch and open or update the pull request of the completed run
       skraft journal adopt [--pr <number>]                              sign a journal this machine cannot verify with a key of this machine (--pr: a pull request's review journal)
       skraft migrate [--dry-run] [--json]                               turn the v1 runs in progress and skraft-config.json into V2 ones
       skraft next [--json]                                              run the active pipeline until it needs agents or a human
       skraft record [--json]                                            hand the saved agent replies to the run, then go on
       skraft gate [--all] [--json]                                      run the gates of the changed components (all with --all)
       skraft doctor [--run] [--base <ref>] [--json]                     check every command can run (--run: run each once)
       skraft review --pr <number> [--publish] [--record] [--json]       review one pull request with the review workflow (--publish: keep its verdict in a comment)
       skraft workflow eject [review]                                    copy the plugin pipeline into .skraft/ (review: the review alone)
       skraft workflow check [--json]                                    validate the workflow a run follows
       skraft workflow diff [--json]                                     compare the repository workflow with the plugin one
       skraft commands --json                                            every command, its synopsis and summary, as JSON (help and completion of the skraft command)
```

Option rules shared by every command:

- an option with a value is written `--name value`; a value that starts with `--` is not a
  value;
- an unknown option, or one repeated without being repeatable, makes the line malformed;
  only `--add` repeats;
- a malformed line prints the usage above on stderr and exits with code **2**.

## Exit codes

| Command | 0 | 1 | 2 |
| --- | --- | --- | --- |
| `--version` | always | — | — |
| `init` (no slug) | components written or already listed | invalid config, `--add` refused | malformed line |
| `init <slug>` | the slug is the active pipeline | refusal (`invalid-slug`, `invalid-base`, `config-invalid`, `base-unresolved`, `source-control-unavailable`, `journal-tampered`, `journal-unverifiable`, `journal-key-unavailable`, `workflow-invalid`, `no-artifacts`, `already-started`, `issue-not-found`, `issue-is-pull-request`, `issue-not-a-story`, `issue-in-other-project`) | malformed line, `--issue` not a positive integer |
| `status`, `report` | any status but `tampered` | status `tampered` | argument other than `--json` |
| `decide` | answer recorded | refusal or not confirmed (below) | no answer, more than two words, option other than `--reason` |
| `publish` | pull request opened, updated or up to date | refusal (below) | any argument |
| `journal adopt` | journal adopted | refusal or not confirmed (below) | other than `adopt [--pr <number>]` |
| `migrate` | nothing needs a person | a run refused, a key unmapped, no component listed, no run migratable | any argument but `--dry-run`, `--json` |
| `next`, `record` | `dispatch`, `waiting` or `done` | `blocked` or `refused` | argument other than `--json` |
| `gate` | gates `passed` (including no component changed) | `failed`, `refused`, `blocked` | malformed line |
| `doctor` | no `FAIL` check (warnings allowed) | at least one `FAIL` check | malformed line |
| `workflow eject`, `check`, `diff` | copied, valid, compared | copy exists, invalid, nothing ejected | unknown action or option |
| `review` | `APPROVED`, or agents handed over (`dispatch`) | `NEEDS_REWORK`, `BLOCKED`, `stopped`, `refused` | no `--pr`, a number that is not a positive integer, malformed line |
| unknown command | — | — | always |

The `refused` and `blocked` codes are detailed in
[Tracking folder and journal]({{ "/en/reference/run-journal" | relative_url }}).

## `skraft --version`

Prints the version read from the plugin's `plugin.json`. Output: one line. Code 0.

## The `skraft` command {#skraft-command}

`npm i -g @skraft/cli` installs `skraft` once per machine. The package has its own version and
holds no engine: at each call it looks for the plugin a host installed and imports its
`engine/drivers/cli/skraft.mjs` in the same process, arguments unchanged. Nothing is recorded,
so a plugin update by the host is followed at the next call.

| Order | Where | Used when |
| --- | --- | --- |
| 1 | `SKRAFT_PLUGIN_ROOT` | the variable is set; a folder without the engine stops there, with no fallback |
| 2 | `<COPILOT_HOME or ~/.copilot>/installed-plugins/<marketplace>/skraft/` | the folder holds the engine; the marketplace named `skraft` first, then the others by name |
| 3 | `installPath` of the `skraft@…` entries of `<CLAUDE_CONFIG_DIR or ~/.claude>/plugins/installed_plugins.json` | the folder holds the engine; the latest `lastUpdated` first |

With `--version`, the command also writes `plugin: <variable|copilot|claude-code> <folder>` on
stderr; stdout keeps the one version line.

**Session.** `skraft` alone, in a terminal, opens a session: the skraft banner (animated, on
stderr) once, then a `skraft ›` prompt where each line is a command (`doctor`, `status`,
`decide yes`…), with Tab completion and history. Each line runs in its own process, on the plugin
found at that moment. `help` prints the usage; `exit`, `quit` or Ctrl-D leaves. A one-shot command
never shows the banner. `NO_COLOR` uncolours it, `SKRAFT_BANNER=static` skips the animation,
`SKRAFT_BANNER=0` turns it off; `SKRAFT_INTERACTIVE=0` keeps `skraft` alone a call to the engine.

**`skraft upgrade`.** Installs the latest `@skraft/cli` of its channel (`latest`, or `alpha` for an
alpha), then runs `copilot plugin update skraft` and `claude plugin update skraft@<marketplace>`
for each host that has the plugin (Claude Code loads it at its next session). A program missing
from the PATH is skipped; a failed step exits 1. Once a day, a session says when a newer
`@skraft/cli` exists (`SKRAFT_UPDATE_CHECK=0` turns the check off; `SKRAFT_REGISTRY` names
another registry). When no plugin is found, it writes a fixed message
naming the install commands and `SKRAFT_PLUGIN_ROOT` on stderr and exits 1.

## `skraft commands --json` {#skraft-commands}

**Effect.** Prints every usage line as JSON: `{ "schema": 1, "commands": [{ "command", "synopsis"?, "summary"? }] }`,
in the order of the usage. The dispatch, the usage and this list come from one table of the
engine. The `skraft` command reads it for its session help (`help`, `help <command>`), its Tab
completion (commands, sub-commands, options) and its "did you mean" on an unknown command.
Code 0; any other argument: usage, code 2.

## `skraft init [--add <folder>]...`

**Effect.** Detects one component per project found in the working copy and in each
`--add` folder, and adds them to `skraft-config.json` (created when missing). Components
already listed and every other key of the file stay as written. Detection rules and stack
defaults: [skraft-config.json]({{ "/en/reference/skraft-config" | relative_url }}).

| Option | Value | Rule |
| --- | --- | --- |
| `--add <folder>` | folder relative to the working copy (`../payment-web`) | repeatable; refused when absolute or not a folder |

**Output (stdout, code 0)** — one of these lines:

| Case | Line |
| --- | --- |
| components added | `skraft-config.json: <name> (<stack>, <root>), …` |
| nothing new, the file already has a `components` key (even empty) | `skraft-config.json already lists every project found (N components)` |
| no project found, file missing or without a `components` key (the file is written with `"components": []`) | `no project found; skraft-config.json lists no component` |

**Errors (stderr, code 1).**

| Case | Message |
| --- | --- |
| invalid config | `skraft-config.json is invalid: <error>; <error>…` |
| absolute `--add` | `--add <folder> is not relative to the working copy` |
| `--add` not a folder | `--add <folder> is not a folder` |

## `skraft init <slug> [--issue <number>] [--title <text>] [--base <ref>] [--from-artifacts]`

**Effect.** Makes `<slug>` the active pipeline of the working copy (writes
`.copilot-tracking/skraft-plans/.active-slug`) and opens its journal. On the **first** init
of a slug, the engine reads `skraft-config.json`, computes the base of each repository and
writes the `run.started` event. An init on a slug that already has a journal resumes it: the
config is not read again, and the story and `--base` are ignored (the journaled base stays).

| Argument / option | Value | Rule |
| --- | --- | --- |
| `<slug>` | kebab-case (`checkout-by-card`) | otherwise refused `invalid-slug` |
| `--issue <number>` | positive integer with no leading zero | otherwise malformed line (code 2). On a new run without `--from-artifacts`, the engine reads the issue through `gh` on the repository `gh` would pick (its default, else `upstream`, else `origin`) and keeps it in `<slug>/plans/<date>/issue-<number>.md`, which every agent and every review lens reads first. An issue that cannot be read (no remote, gh missing or not signed in, another forge, gh failed) does not stop the run: it starts on the number and title alone, `run.started` journals why in `issueUnread`, and the success line says so. On Azure DevOps the number is a work item's: it is read through `az boards work-item show` (the host's Azure DevOps MCP server first, under Copilot and Claude Code), its HTML description and acceptance criteria converted to Markdown, a work item of another project than the Git remote's or whose type is no story's refused `issue-in-other-project` or `issue-not-a-story`. Refused `issue-not-found` or `issue-is-pull-request`, with nothing journaled, when the forge answers with no issue or with a pull request. A resumed run does not read it again |
| `--title <text>` | a single argument; quote it if it has blanks | — |
| `--base <ref>` | git ref: no blank, does not start with `-` | read only at the slug's first init: otherwise refused `invalid-base`; wins over any `baseBranch`. On a slug that already has a journal it is ignored, even when invalid |
| `--from-artifacts` | flag | starts a new run in DESIGN from the DISCUSS stories already in `<slug>/plans/<date>/stories-<milestone>.md`; refused `no-artifacts` without them, `already-started` on a slug that has a journal |

**Output.** Success: `<slug> is the active pipeline` on stdout, code 0. Refusal: the engine's
message on stderr, code 1, for example:

| Code | Message |
| --- | --- |
| `invalid-slug` | `slug must be kebab-case, got "<slug>"` |
| `invalid-base` | `--base must be a git ref: text with no blank that does not start with -` (the value is never echoed) |
| `config-invalid` | `skraft-config.json is invalid: <errors>` |
| `base-unresolved` | `the working copy (<repository>) has no merge base with <ref>` or `component <name> (<repository>) has no merge base with <ref>`, one per repository without a base, joined by `; `, then `; set baseBranch in skraft-config.json or pass --base <ref>` |
| `source-control-unavailable` | `<error>; the components of skraft-config.json need Git for their base` |
| `journal-tampered` | `journal tampered: events.jsonl line N …; restore the file or start a new slug` |

`init <slug>` starts no agent: the mod, the workflow, the Copilot SDK driver or `skraft next`
runs the pipeline ([Hosts]({{ "/en/reference/hosts" | relative_url }})).

## `skraft status [--json]`

**Effect.** Reads the active pipeline and its journal, writes nothing.

**Text output** — in this order, each line only when it applies:

```
skraft <slug>: <status>
RESEARCH  pending|open|closed
agent: <agent> (<step>, attempt <n>)
answer: skraft decide <key> <A>|<B> (--reason <text> with <refusal>)
cost: ~$<amount>
<reason>
```

With no active pipeline, the first line is `skraft: idle`. The `agent:` line becomes
`gates: <gates> (<step>)` on a gate node and `question: <kind> (<step>)` on an ask node;
`, pass <n>` follows the step from the second visit on. The `answer:` line shows only while
the run waits on a question; for a `blocked` question it reads
`answer: skraft decide <key> "<instruction>"|STOP`, for the `mutation-plan` question `APPLY|"<instruction>"|STOP`. A run waiting on ADR ratification, for example:

```
skraft checkout-by-card: waiting
…
question: adr-ratification (adr)
answer: skraft decide adr-1 RATIFIED|REJECTED (--reason <text> with REJECTED)
Ratify the Proposed ADRs docs/adr/adr-001-card-provider.md? RATIFIED marks them Accepted; REJECTED sends DESIGN back with your reason.
```

**`--json` output** — the pipeline view object:

| Field | Type | Content |
| --- | --- | --- |
| `slug` | string or null | active pipeline, `null` when none |
| `status` | string | `idle`, `not-initialised`, `running`, `waiting`, `done`, `blocked`, `tampered` |
| `reason` | string | reason for the status (the question text while `waiting`), empty when none |
| `phases` | `[{ phase, state }]` | one entry per phase; `state` = `pending`, `open` or `closed` |
| `current` | `{ step, phase, agent, gates, question, visit, attempt }` or null | the node in progress, `null` otherwise; `question` is the question kind on an ask node, `null` elsewhere |
| `question` | `{ key, kind, text, options, refusals, header }` or null | the question the run waits on, `null` when nothing waits; `header` = the short label a dialog or the pane shows beside it (`ADR`, `Reporting`, `Pull request`, `Mutation plan`, `Environment`, `Blocked`) |
| `attempts` | number | number of attempts started |
| `costUsd` | number or null | sum of journaled costs, `null` when none |
| `graph` | `{ nodes, edges }` | the graph of the workflow the run follows (default or `.skraft/`); with no readable workflow, the steps the journal names and no edge |
| `graph.nodes` | `[{ id, kind, phase, what, state, outcome, visits, attempts, retries, durationMs, costUsd }]` | one entry per step (neither `start` nor `exit`) in workflow order; `what` = the agent, gates, lenses, question or publication; `state` = `pending`, `open` or `done`; `outcome` = what the last attempt recorded, `null` while an attempt is open; `costUsd` = the step's cost, `null` when none |
| `graph.edges` | `[{ from, to, label, taken }]` | the edges between those steps; `taken` = how many times the run took it |
| `reviews` | `[{ step, visit, verdict, lenses: [{ lens, verdict, findings }] }]` | the last pass of each review step; `verdict` = `approved`, `needs-rework` or `blocked`, `null` until the pass is recorded; `findings` = how many findings the lens gave |
| `gates` | `[{ component, gate, command, status, durationMs, evidence, survivors }]` | the last result of each gate of each component (the tests among them); `survivors` only for `mutation` |

What each status means:
[Tracking folder and journal]({{ "/en/reference/run-journal" | relative_url }}). Code 1 only
for `tampered`.

## `skraft decide [<key>] <answer> [--reason <text>]`

**Effect.** Records a human's answer to the question the active pipeline waits on (one
`question.answered` event, `by: "cli-tty"`), once the person confirms it at the terminal:
`skraft decide: record <answer> for <key>? [y/N]`. Only `y` records. It runs nothing: the next run of the pipeline
acts on the answer, without starting again an agent that already finished.

| Argument / option | Value | Rule |
| --- | --- | --- |
| `<key>` | question key (`adr-1`, `gates-2`) | optional; without it, the question the run waits on |
| `<answer>` | one of the question's options (`RATIFIED`, `REJECTED`, `RETRY`, `ABORT`…); for a `blocked` question, the instruction in quotes, or `STOP` | an option in any case; an instruction is kept on one line, the `--reason` text after it, at most 1000 characters (refused beyond, never cut) |
| `--reason <text>` | the reason, sent back to the agent | required with a refusal (`REJECTED`); kept on one line, at most 500 characters |

The questions, their options and their refusals:

| Kind | Key | Options | Refusal |
| --- | --- | --- | --- |
| `adr-ratification` | `<node>-<n>` (`adr-1`) | `RATIFIED`, `REJECTED` | `REJECTED` |
| `publish-consent` | `<node>-<n>` | `ACCEPTED`, `DECLINED` | — |
| `reporting-consent` | `<node>-<n>` | `ACCEPTED`, `DECLINED` | — |
| `environment` | `<node>-<n>`, the node that cannot run (`gates-1`) | `RETRY`, `ABORT` | — |
| `mutation-plan` | `<node>-<n>` (`mutation_plan-1`) | `APPLY`, an instruction, or `STOP` (ends the run `blocked`, code `stopped`) | — |
| `blocked` | `<node>-<n>`, the node an instruction runs again (`design-1`) | an instruction, or `STOP` | — |

A block no longer ends the run by itself. When an agent answers `blocked`, a loop reaches its
`max_visits`, or a lens of a review answers `inconclusive`, the engine asks the `blocked`
question about the node to run again: the agent itself, the node the capped edge leads back to
(the engineer after the gates, the architect after a review or a rejected ADR), or the review.
Its text holds only what the engine checked, and the file that keeps the agent's own words:

```
design is blocked: solution-architect says it cannot go on; its reason is in <tracking folder>/results/design-1-1.json. An instruction runs design again on a new pass with it; STOP ends the run.
design is blocked: design_review -> design was taken as often as its max_visits allows. An instruction runs design again on a new pass with it; STOP ends the run.
design_review is blocked: a lens answered inconclusive; the verdict is in <tracking folder>/reviews/design_review-1/verdict.yaml. An instruction runs design_review again on a new pass with it; STOP ends the run.
```

`skraft decide design-1 "Use the bank gateway of Acme"`: the next run of the pipeline, the same
run on the same slug, runs that node again on a new pass, the instruction given to its agent as
a human's feedback (to each lens the review asks, for a review); no edge into the node counts
as taken any more, so its loop has its whole budget again. Blocked again, it asks again
(`design-2`). `STOP` (in any case) ends the run `blocked`, with the code and reason of the
block, and nothing else. A breaker, an attempt ceiling, a missing edge or a stalled mutation
loop still end the run without a question.

A key names the node that asks the question, then the question's rank among those that node
asked in the run, whatever their kind: `adr-1`, then `adr-2` after a rejection or when Git
cannot commit the ratification.

**Output.** Recorded: `<slug>: <key> answered <answer>; run the pipeline again to go on` on
stdout, code 0. Refusal: the message on stderr, code 1.

| Code | Message |
| --- | --- |
| `no-active-pipeline`, `slug-mismatch` | see [Tracking folder and journal]({{ "/en/reference/run-journal" | relative_url }}) |
| `no-question` | `no question adr-2; waiting: adr-1`, or `no question to answer; no question is waiting` |
| `already-answered` | `adr-1 was already answered RATIFIED` |
| `invalid-answer` | `the answer must be one of RATIFIED, REJECTED`; `REJECTED needs the reason, which goes back to the agent`; for a `blocked` question `the answer must be an instruction, or STOP` (`… or APPLY or STOP` for `mutation-plan`) and `an instruction is at most 1000 characters` (the value is never echoed) |
| `no-terminal` | `skraft decide records a person's answer: run it yourself in an interactive terminal; nothing was recorded` |
| `not-confirmed` | `not confirmed; nothing was recorded` |

## `skraft gate [--all] [--json]`

**Effect.** Runs the gates of the active pipeline: the commands named `build`, `format`,
`lint`, `test`, `architecture`, `coverage`, `mutation` of each component, in that order,
from the component's root. Each gate writes evidence and one `gate.ran` event. A component
stops at its first failing gate; the other components go on.

| Option | Effect |
| --- | --- |
| (none) | scope `touched`: only the components changed since their base |
| `--all` | scope `all`: every component |
| `--json` | JSON output instead of text |

**Text output** — one line per gate run, then a summary line:

```
pass  web/lint
fail (environment)  web/test: <reason>
skraft <slug>: gates <status> — <reason>
```

On a refusal or a block, the summary carries the code: `skraft <slug>: gates refused
(<code>) — <reason>`.

**`--json` output**:

| Field | Type | Content |
| --- | --- | --- |
| `status` | string | `passed`, `failed`, `refused`, `blocked` |
| `slug` | string or null | active pipeline |
| `scope` | string | `touched` or `all` |
| `components` | string[] | components selected |
| `gates` | `GateResult[]` | see below |
| `failure` | string or null | `environment` when at least one environment failure, otherwise `deterministic` on failure, `null` with no failure |
| `code` | string or null | refusal or block code |
| `reason` | string | summary |
| `phase` | null | present only on a refusal or block coming from the active pipeline |

Each `GateResult`: `component`, `gate` (`none` for a component with no gate command),
`status` (`pass`, `fail`), `failure` (`environment`, `deterministic`, `null`), `reason`,
`evidence` (absolute path of the evidence file; for the `none` gate, the `gates/<component>`
folder, where no file is written).

| Result | Summary `reason` |
| --- | --- |
| everything passes | `N gates passed on <components>` |
| no component changed | `no component changed since its base; no gate to run` |
| at least one failure | `<component>/<gate>: <reason>; …` |

Possible codes: `no-active-pipeline`, `not-initialised`, `config-invalid`, `no-components`
(refused); `journal-tampered`, `journal-changed` (blocked). Failure reasons, failure classes
and evidence format:
[skraft-config.json]({{ "/en/reference/skraft-config" | relative_url }}) and
[Tracking folder and journal]({{ "/en/reference/run-journal" | relative_url }}).

## `skraft report [--json]`

**Effect.** Reads the active pipeline's journal and prints the time, cost and retries of each
step; writes nothing. The engine writes the same table to `run-report.md` after each step.

**Text output**:

```
skraft <slug>: <status>
| Step | Phase | Visits | Attempts | Retries | Time | Cost | Outcome |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| research | RESEARCH | 1 | 1 | 0 | 4 min 12 s | ~$0.85 | done |
| Total | | | 1 | 0 | 4 min 12 s | ~$0.85 | |

Costs are approximate (~): each is what the Claude Code session cost while the agent ran, so it includes anything else exchanged in that session meanwhile.
| Question | Step | Answer | By |
| --- | --- | --- | --- |
| design-1 | design | Use the bank gateway | cli-tty |
<reason>
```

The answers table lists every answer a human gave in the run, in order: the question's key,
the node it was about, the answer (a refusal's reason after it), and how the journal knows a
person gave it (`host`, `decide`, `host-confirmed`, `cli-tty`); it shows only once a question
was answered. `run-report.md` holds it under `## Human answers`.

Steps come in the order they first started. A step started again (a retry, or a new visit a
gate, a review or a human sent back) counts one retry. `Cost` is approximate, `~$<amount>`,
followed by the note above: only the Claude Code mod journals a cost, the session's cost before
and after each agent. `Cost` is `-` when nothing was
journaled; `Outcome` is `in progress` while an attempt is open. With no active pipeline, no
journal or a tampered one, only the first line and the reason are printed (`idle`,
`not-initialised`, `tampered`).

**`--json` output**: `{ slug, status, reason, steps: [{ step, phase, visits, attempts, retries,
durationMs, costUsd, outcome }], totals: { attempts, retries, durationMs, costUsd }, answers:
[{ key, kind, step, answer, reason, by }], startedAt, elapsedMs }`. Code 1 only for `tampered`.

## `skraft publish`

**Effect.** Opens or updates the pull request of the active pipeline's **completed** run, as
its `publish` node would have, once what stopped it there is fixed (no remote, `gh` missing,
no consent…). Typed by the developer, it consents for this publication whatever
`publish.pullRequest` says in `skraft-config.json`; the setting is not changed and the journal
records `publish.requested`. No argument.

**Output.** Success (stdout, code 0), one of:

```
pull request #<n> opened as a draft: <url>
pull request #<n> updated: <url>
pull request #<n> is up to date: <url>
```

(`opened: <url>` without `as a draft` when `publish.draft` is `false`.) Refusal (stderr,
code 1):

| Code | Message |
| --- | --- |
| `no-active-pipeline`, `journal-tampered`, `journal-unverifiable` | see [Tracking folder and journal]({{ "/en/reference/run-journal" | relative_url }}) |
| `not-done` | `<slug> has not completed; skraft publish opens the pull request of a completed run` |
| `config-invalid`, `workflow-invalid` | the invalid file and its errors |
| `not-published` | `pull request not opened: <reason>; pull-request.md holds its description, and skraft publish opens it once that is fixed` |
| `journal-changed` | another writer appended to the journal meanwhile |

The `<reason>` of `not-published` names what is missing: `gh, the GitHub CLI, is not
installed`, on Azure DevOps `az, the Azure CLI, is not installed`, `the azure-devops extension
of the Azure CLI is not installed; run az extension add --name azure-devops` or `az is not
signed in to the Azure DevOps organization <organization URL>, …`, `HEAD is detached, on no branch to push`, `HEAD is on <branch>, the branch the
pull request would merge into`, a base that names no branch, and so on.

## `skraft journal adopt [--pr <number>]`

**Effect.** Signs the active pipeline's journal on from here with a new key of this machine,
when this machine cannot verify it (`journal-unverifiable`): the run was started on another
machine, or before journals were signed. It writes one `journal.adopted` line; the lines
before it stay as they are, unverified. It asks first, at the terminal:

```
skraft journal adopt: sign the journal of <slug> on from here with a key of this machine, leaving unverified <lines>? [y/N]
```

`<lines>` names the line ranges and their event types. Only `y` adopts.

**Output.** Success (stdout, code 0): `<slug>: journal adopted with a new key of this machine;
its <n> earlier lines stay unverified`. Refusal (stderr, code 1):

| Case | Message |
| --- | --- |
| no interactive terminal | `skraft journal adopt takes a person's yes: run it yourself in an interactive terminal; nothing was adopted` |
| answer other than `y` | `not confirmed; nothing was adopted` |
| nothing to adopt | `<slug>: this machine verifies every line of the journal; there is nothing to adopt` |
| the journal is tampered | the `journal-tampered` message: a broken chain or a forged signature is never adopted |
| the journal changed after the question | `<slug>: the journal changed since you were shown what adopting it leaves unverified; run skraft journal adopt again` |
| no active pipeline | `no-active-pipeline` |

With `--pr <number>`, it adopts the review journal of that pull request, `.copilot-tracking/skraft-reviews/pr-<number>/events.jsonl`, the same way; the messages then name `pr-<number>` where they name `<slug>`, and a journal that changed meanwhile says `run skraft journal adopt --pr <number> again`. Anything else after `adopt`, or a number that is not a positive integer, is a malformed line (code 2).

## `skraft migrate [--dry-run] [--json]`

**Effect.** Brings a working copy left by v1 to V2, in place, in two parts:

- **`skraft-config.json`**: the v1 keys (`trackingLayout`…) are dropped, the V2 keys kept, and
  the components `skraft init` finds are listed; a key that maps to nothing is reported and the
  file is not rewritten. The write is atomic.
- **Each v1 run still in progress** (`.copilot-tracking/skraft-plans/<slug>/state.json`, no
  `events.jsonl`) gets a signed journal: a `run.started` marked `migratedFrom: "v1"` on the
  workflow in force, the artefacts of its completed phases, one `phase.closed` per completed
  phase; its current phase restarts at its first node. `state.json` is never touched. A run v1
  finished (`DONE`) is skipped; a migration that stopped half-way is completed; running the
  command again changes nothing (`already-migrated`).

Resume a migrated run with `skraft init <slug>`, then the host as usual. `--dry-run` writes
nothing and prints what it would write.

**Text output** — the configuration line, then one line per run, then the summary:

```
skraft-config.json: dropped trackingLayout; skraft init would then list the components it finds; their bases are not shown
would write skraft-config.json:
  { … }
would-migrate  checkout-flow: DISTILL restarts at distill, RESEARCH and DESIGN closed; 1 artefact path of the completed phases dropped (outside-run 1); resume it with skraft init checkout-flow
  would append: {"type":"run.started","slug":"checkout-flow",…}
  would append: {"type":"phase.closed","phase":"RESEARCH"}
  would append: {"type":"phase.closed","phase":"DESIGN"}
skipped  shipped: the v1 run is DONE; nothing to migrate
skraft migrate: 1 to migrate (dry run: nothing written), 1 skipped, 0 refused
```

Without `--dry-run`, each run line starts with `migrated` and the summary reads `skraft migrate:
N migrated, N skipped, N refused`. A `state.json` outside the v1 schema is refused with its
reason (`refused  <slug>: state.json holds a field the v1 state schema does not declare;
nothing was migrated`).

**Exit code**: 0 when nothing needs a person; 1 when a run is refused (`some-refused`), a
configuration key maps to nothing (`config-unmapped`), the components could not be listed
(`config-components-refused`), or no run can be migrated (`journal-key-unavailable`,
`config-invalid`, `workflow-invalid`, `base-unresolved`, `source-control-unavailable`); 2 for
any argument but `--dry-run` and `--json`. When no run can be migrated, the last line is the
refusal's reason instead of the summary.

**`--json` output**: `{ ok, code, reason, dryRun, config: { status, reason, … }, pipelines: [{
slug, status, code, reason, events?, dropped? }] }`, `status` = `migrated`, `would-migrate`,
`skipped` or `refused`.

## `skraft next [--json]` and `skraft record [--json]`

**Effect.** The agent loop, the VS Code driver when the Copilot SDK is missing: the
`skraft-orchestrator` agent conducts it ([Hosts]({{ "/en/reference/hosts" | relative_url }}#agent-loop)). `next` runs the active pipeline until it needs agents
or a human. For each agent it needs, it writes a brief and an empty reply file under
`.copilot-tracking/skraft-plans/<slug>/results/loop/` (`dispatch-<n>.brief.md`,
`dispatch-<n>.reply.md`), lists them in `pending.json`, leaves the run's lease for the time the
agents take, and stops. `record` reads the reply files, hands them to the run, takes the lease
back and goes on as `next` does. Lenses run one after the other. The journal is the one the
Copilot workflow writes, without the models and costs the loop cannot know.

Each brief ends with a one-time token the reply must end with: a reply without it is no
answer. A `next` while agents are handed over and not recorded is refused.

**Text output** — the first line, then the agents, then the command to run:

```
skraft <slug>: dispatch in RESEARCH — start this agent, save each final reply as it is to its reply file, then record
agent 1: solution-researcher on <model>
  prompt: Your brief is the file <absolute path>. Read it whole and do what it asks. Your last message is the reply it asks for.
  reply: <absolute path of the reply file>
then: node "<absolute path of skraft.mjs>" record
```

`on the session's model` replaces `on <model>` when the configuration gives no Copilot model.
An agent is named by its bare id (`solution-researcher`, `consistency-lens`). `in <phase>` names
the phase the run stands in; a refusal of the loop itself carries none, and a waiting line
carries the question kind as its code (`waiting (adr-ratification) in DESIGN`).

| First line | When | `then:` | Code |
| --- | --- | --- | --- |
| `skraft <slug>: dispatch in <phase> — …` | agents handed over | `… record` | 0 |
| `skraft <slug>: waiting (<question kind>) in <phase> — <question> Options: <A>, <B>. Stop here and ask the human to answer it with skraft decide in their own terminal; then run next.` (for a `blocked` question, `Options: an instruction in quotes, or STOP.`; for `mutation-plan`, `Options: APPLY, an instruction in quotes, or STOP.`) | a question waits | `… next` | 0 |
| `skraft <slug>: done in PUBLISH — PUBLISH closed` | the run ended | none | 0 |
| `skraft <slug>: blocked (<code>) in <phase> — <reason>` | the run stopped | none | 1 |
| `skraft <slug>: refused (not-recorded) — N handed over agents are not recorded yet: start each one, save its reply, then record` | `next` with agents pending; the agents are listed again | `… record` | 1 |
| `skraft <slug>: refused (nothing-to-record) — no agent was handed over; run next` | `record` with nothing pending | none | 1 |
| `skraft <slug>: refused (loop-file-unreadable) — <file> is not what skraft wrote; remove <pending.json>, then run next to hand the agents over again` | a loop file was edited | none | 1 |

Any other refusal of the run (`no-active-pipeline`, `pipeline-locked`…) prints `refused
(<code>)` with its reason, code 1. The run's progress (`phase <PHASE>`…) goes to stderr.

**`--json` output**: `{ status, slug, phase, code, reason, dispatches: [{ agent, model, prompt,
brief, reply }], then }`, `status` = `dispatch`, `waiting`, `done`, `blocked` or `refused`,
`then` = `null` when the loop ends.

## `skraft workflow eject [review]`, `check [--json]`, `diff [--json]`

**`skraft workflow eject`** copies the plugin's `workflows/pipeline.skraft.dot` into
`.skraft/pipeline.skraft.dot`, stamped with the plugin version (`skraft_version`); the run then
follows the copy. `skraft workflow eject review` copies `review.skraft.dot` alone into
`.skraft/review.skraft.dot`; every call to `review` runs it. Neither overwrites a copy.

| Case | Output | Code |
| --- | --- | --- |
| copied | `.skraft/pipeline.skraft.dot holds the skraft <version> pipeline; the run follows it` (review: `… holds the skraft <version> review; every call to review runs it`) on stdout | 0 |
| the copy exists | `<path> already exists; edit it, or remove it` on stderr | 1 |

Syntax, validity rules and locked or mandatory nodes: [The DOT workflow]({{ "/en/reference/workflow-dot" | relative_url }}).

**`skraft workflow check`** validates the workflow a run would follow (the repository copy when
there is one, else the plugin's) and the workflows it calls, against `skraft-config.json`: one
start and an exit, every node reachable, `max_visits` on every loop, known shapes and
attributes, agents that exist, locked nodes kept or `unlock="<reason>"`, mandatory nodes kept.

| Case | Output | Code |
| --- | --- | --- |
| valid | `warning: <warning>` lines (a model family the configuration masks), then `<file> is valid: phases RESEARCH, DESIGN, …`, followed by `; <node> is unlocked and skipped: <reason>` for each unlocked node | 0 |
| invalid | `skraft-config.json is invalid: …` or the workflow's errors, on stderr | 1 |

**`skraft workflow diff`** compares the repository copies with the plugin's workflows without
writing anything: one line per change, then the summary.

| Case | Output | Code |
| --- | --- | --- |
| compared | the changes, then the summary. When the copy carries the plugin's version: `<file>: N changes from the skraft <version> workflow`. Otherwise the first change is `skraft_version <from> → <version>` (`none` when the copy carries no version) and the summary reads `<file> carries skraft_version <from>, this plugin is <version>; N changes from the skraft <version> workflow`. With a called workflow ejected too, one summary per file, joined by `; ` | 0 |
| nothing ejected | `the working copy has neither .skraft/pipeline.skraft.dot nor .skraft/review.skraft.dot; the plugin's run as shipped (skraft workflow eject [review] copies them)` on stderr | 1 |
| invalid copy | `<file> is invalid: <errors>` on stderr | 1 |

With `--json`, `check` prints `{ ok, name, errors, unlocked: [{ node, reason }], warnings,
reason }` and `diff` prints `{ ok, name, changes, reason }`. `eject` takes no option.

## `skraft doctor [--run] [--base <ref>] [--json]`

**Effect.** Checks that every command of every component can run on this machine. Writes
nothing to the journal. The first line names the plugin version that answers
(`ok    plugin: skraft <version>`; `plugin` in the JSON); it is not counted as a check.

| Option | Effect |
| --- | --- |
| `--run` | runs each command once from its component's root, with the computed base, and writes what it printed to `.copilot-tracking/skraft-doctor/<component>/<command>.log` (replaced at each run) |
| `--base <ref>` | base ref for `--run`; without `--run` it is not read |
| `--json` | JSON output |

Checks, in order:

| Subject | Passes when | Detail on failure |
| --- | --- | --- |
| `node` | Node 22 or later | `Node <version>; skraft needs Node 22 or later` |
| `config` | file present, valid, at least one component | `skraft-config.json is invalid: …`; `no skraft-config.json; run skraft init to detect the components`; `skraft-config.json lists no component; run skraft init to detect them` |
| `forge` | the forge a run uses can be reached from here (on `github`: a remote, `gh` installed and signed in to its host; on `azure-devops`: a remote naming an organization, project and repository, `az` with its `azure-devops` extension installed and signed in to that organization); otherwise a warning, never a failure | warning: `<forge>, named in the configuration: <reason>` or `<forge>, deduced from the Git remote: <reason>`; reasons: `the working copy has no Git remote whose URL names a host and a repository`, `gh, the GitHub CLI, is not installed`, `gh is not signed in to <host>; run gh auth login --hostname <host>`, `the working copy has no Git remote whose URL names an Azure DevOps organization, project and repository`, `az, the Azure CLI, is not installed`, `skraft runs az under Windows only from the Azure CLI installer (MSI or winget), …`, `the azure-devops extension of the Azure CLI is not installed; run az extension add --name azure-devops`, `az is not signed in to the Azure DevOps organization <organization URL>, …` |
| `base` (with `--run`) | the base can be computed | the `invalid-base`, `base-unresolved` or `source-control-unavailable` message |
| `<component>` | the root is a folder | `root <root> is not a folder` (its commands are not checked) |
| `<component>` | at least one gate command | `no gate command; give it at least one of build, format, lint, test, architecture, coverage, mutation in skraft-config.json` |
| `<component>/<command>` | the line splits and its program is found (PATH, and PATHEXT under Windows) | `"<line>" <reason>`; `command not found: <program> (from <root>); install it or change commands.<name> in skraft-config.json` (for `python`, `(from <root>; looked for .venv/bin/python, .venv/Scripts/python.exe, python, python3)`) |
| `<component>/<command>` with `--run` | the command exits with 0 | `<command run> exited <code>; its output is in .copilot-tracking/skraft-doctor/<component>/<command>.log` (base substituted, interpreter chosen) |
| `<component>` (after its commands) | every mocking and contract testing skill the component asks for exists in the plugin or the working copy (`.claude/skills/`, `.github/skills/`); otherwise a warning | warning: `skills found nowhere, in the plugin or the working copy: <skills>; mocking-strategy-roster and contract-testing say which recipe its tests use instead, or that they stop` |
| `vscode` | always `ok` | names the VS Code driver: `Copilot SDK <version> (<path>): under VS Code, run the pipeline through it with engine/drivers/copilot-sdk/skraft-run.mjs`, or `no Copilot SDK under <folder>: under VS Code, the Skraft - Orchestrator agent conducts skraft next and skraft record; …` |
| `models` | every agent `assign.agents` names exists in the plugin or the working copy | `assign.agents.<id>: no agent <id> in the plugin, .claude/agents/ or .github/agents/; did you mean <closest>?` |
| `models/<host>` (`claude-code`, `copilot`) | every family the workflow's agents run on has a model on that host; otherwise a warning with the dispatches that fall back to the host | warnings: `no model on <host> for <family> (<n> dispatches)…`; `CLAUDE_CODE_EFFORT_LEVEL is set…`; `max effort on <agent> (<model>)…` for a Copilot model whose name has no `claude`; `~/.copilot/settings.json sets subagents.agents for <agent>…` when skraft passes its own model or effort |

A component's commands are checked gates first (in gate order), then `e2e`. The doctor stops after `config` when the config is invalid, missing or empty.
Without `--run`, `{baseSha}` is replaced with `HEAD` for splitting only.

**Text output**:

```
ok    node: Node v22.…
ok    forge: github, deduced from the Git remote
FAIL  web/test: command not found: npx (from ../payment-web); install it or change commands.test in skraft-config.json
models on claude-code:
  step      agent                type   family      tier      model   effort  source (family/model/effort)
  research  solution-researcher  phase  researcher  standard  sonnet  -       agent/tier/host
  …
models on copilot:
  …
skraft doctor: 1 checks failed
```

Once the configuration and the workflow read, one table per host lists each agent the workflow dispatches (a review node's lenses, then its refuter as it checks the node's strongest lens): family, tier, model (a list tried in order), effort, and where each comes from; `-` where the host decides.

The last line is `skraft doctor: every check passed`, `skraft doctor: no check failed, N with a warning` or `skraft doctor: N checks failed`.

**`--json` output**: `{ "ok": boolean, "checks": [{ "subject", "status": "ok"|"warn"|"fail", "detail" }], "assignments": { "<host>": [{ "step", "agent", "type", "family", "tier", "model", "effort", "source": { "family", "model", "effort" } }] } | null }`.

## `skraft review --pr <number> [--publish] [--record] [--json]`

Reviews someone else's code from one pull request, with no skraft run: the review workflow
`review` (`.skraft/review.skraft.dot` when the working copy ejected it, else the plugin's) runs
its lenses, the refuter, then computes the verdict.

| Step | Rule |
| --- | --- |
| Forge | on GitHub, the repository gh would pick: its default (`gh repo set-default`), else the `upstream` remote, else origin; `gh` installed and signed in to its host, else stopped `forge-unavailable`; the pull request read by its number, else `pr-not-found` (`pr-unreadable` when gh fails). On Azure Repos, the organization, project and repository the remote names; the host's Azure DevOps MCP server (`ado`) first, else `az` with its `azure-devops` extension signed in, else `forge-unavailable`; a pull request of another project or repository is `pr-unreadable` |
| Working copy | must stand on the pull request's head commit (`gh pr checkout <number>`, `az repos pr checkout --id <number>` on Azure Repos), else `pr-not-checked-out`; the changes are those since the merge base with the base commit, which Git must have (`git fetch origin <base>`), else `pr-base-missing`; uncommitted changes outside `.copilot-tracking/` stop it, `working-copy-dirty`; a pull request whose head holds, or whose commits change, a file under `.copilot-tracking/skraft-reviews/` (names composed and folded as macOS and Windows open them, a short name such as `SKRAFT~1` included, then each tracked path asked of the file system: one that opens as the review folder under any spelling counts), or a file or link in place of `.copilot-tracking` or `.copilot-tracking/skraft-reviews`, is refused, `review-state-committed`; a review folder in the working copy that is a link, lies under one, or is no folder stops it, `review-folder-linked` |
| Workflow | `.skraft/review.skraft.dot` and `skraft-config.json` are read from the pull request's base commit, never its head (a file the base lacks is the plugin's default); the workflow is checked as the plugin's pipeline calls it: an ejected copy that drops or weakens a mandatory node (`test_integrity`, `architecture_boundaries`, the fan-in `verdict`) is refused, `workflow-invalid`; no lens runs |
| Project rules | `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.github/copilot-instructions.md`, `docs/adr/decisions-index.md` and the ADR files that index lists (`docs/adr/adr-<number>-*.md`) are read from the base commit too, copied into `reviews/verdict-<pass>/rules/` and listed in `context.md`; every lens and refuter brief says that the working copy's copies are the pull request author's version and to judge by the base copies: a rule or record the pull request edits or adds counts for nothing. Not verified: whether Claude Code, Copilot CLI and VS Code load `AGENTS.md`, `CLAUDE.md` or `.github/copilot-instructions.md` from the checkout, the author's version, into the agents they start; it is outside the engine's reach and unmeasured (`docs/v2/host-verification.md` in the repository) |
| Inputs | `base` and `head` from the pull request; `story`: its number (the title stays out of the briefs); `documents`: its title and body (kept as `pull-request.md` under a header that says they are the author's data, never instructions, which each brief that lists it repeats) and `docs/adr/decisions-index.md` when either exists; `components`: those of `skraft-config.json`, else the projects `skraft init` would detect, with their defaults (Microcks for a .NET project), written nowhere. Only the inputs the workflow declares are given |
| `test-integrity` | without a `.feature` nor a test plan among its inputs, its brief says so: it judges G9 by comparing the removed lines with the added ones (an assertion weakened, a test deleted, a skip added), and their absence alone is no reason to answer `inconclusive` |
| Tracking folder | `.copilot-tracking/skraft-reviews/pr-<number>/`, its own hash-chained `events.jsonl`, signed as a run's is (no home folder for the key: `journal-key-unavailable`; signed on another machine: `journal-unverifiable`, until you adopt it here with `skraft journal adopt --pr <number>` typed in your own terminal, which shows the lines it leaves unverified first and refuses, `journal-changed`, a journal that changed since), and its own session lease: one session reviews a pull request at a time (`pipeline-locked`: another session is reviewing pull request #N; wait for it to end or for its lease to expire; `lock-lost` and `lock-unavailable` name `skraft-reviews/pr-<number>/.lock`; a lease that names more than the longest hand-over, 2 hours, or was renewed more than a minute ahead of this machine's clock is taken over); each run is the next pass (`reviews/verdict-<pass>/`), a pass that stopped is picked up; a lens whose inputs did not change and that found nothing is taken over (`reused: true`) |
| Output | the verdict, what sends the work back (`to address`), the notes and refuted findings, the path of `verdict.yaml`; `--json` prints `{ status, number, pass, code, reason, reasons, details, file, comment, unpublished, dispatches, then }` |
| `--publish` | keeps the verdict in **one** comment of the pull request, found again by its visible marker `<sub>skraft-review pr=<number></sub>` and rewritten at each pass; never a GitHub review, never a request for changes. The consent is the base's `skraft-config.json` `publish.reviewComment` when it sets one; otherwise it is asked once per repository (at the terminal, in a dialog, or in Copilot's confirmation) and kept in your `~/.skraft/config.json` under `reviewComments`, by `<host>/<owner>/<repo>` (`dev.azure.com/<organization>/<project>/<repository>` on Azure Repos, where the comment is one thread created *Closed* whose first comment is rewritten, whoever wrote it); the review never writes `skraft-config.json` nor `skraft-config.local.json`. A comment URL the journal keeps is rewritten only once the forge says it is yours, on that pull request; declined or unanswered, nothing is posted and `unpublished` says why. `comment.md` beside the review always holds the text |

On the command line the lenses run through the agent loop: the command hands them over
(`dispatch`, each with its brief and reply file), the conducting agent starts them and saves
their replies, then `skraft review --pr <number> --record` hands the replies back and the review
goes on (the refuter is handed over the same way).

## Pitfalls & anti-patterns

- **Running skraft outside the root**: the config and the tracking folder are read from the
  current folder. Elsewhere, `status` answers `idle` and `gate` refuses.
- **Reading `status` exit code 1 as a run error**: only `tampered` exits with 1. A `blocked`
  run exits with 0; read the status.
- **Passing `--base` for an existing slug**: the base is fixed at the first init. Start a new
  slug to change it.
- **Scripting against the text output**: use `--json`, whose fields are listed here.
- **Rejecting without a reason**: `REJECTED` alone is refused; the reason is what the agent
  reworks from.
- **Answering by editing `events.jsonl`**: the chain breaks. Answer with `skraft decide`.

## Going further {#see-also}

- [Hosts]({{ "/en/reference/hosts" | relative_url }})
- [The DOT workflow]({{ "/en/reference/workflow-dot" | relative_url }})
- [Phases]({{ "/en/reference/phases" | relative_url }})
- [Getting started]({{ "/en/tutorials/getting-started" | relative_url }})
- [Run the gates and read their evidence]({{ "/en/how-to/run-gates" | relative_url }})
- [Resume or unblock a run]({{ "/en/how-to/resume-a-run" | relative_url }})
- [skraft-config.json]({{ "/en/reference/skraft-config" | relative_url }})
- [Tracking folder and journal]({{ "/en/reference/run-journal" | relative_url }})
- [Engine, drivers, depth 1]({{ "/en/explanation/architecture" | relative_url }})

Terms to know: **engine**, **host driver**, **slug**, **gate** — see the
[glossary]({{ "/en/reference/glossary" | relative_url }}).
