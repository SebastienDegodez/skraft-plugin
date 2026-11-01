---
title: "The skraft command line — setup and maintenance"
description: "Where skraft finds the plugin, then doctor, migrate, journal adopt, workflow eject|check|diff and the commands listing."
persona: software-engineer
---

# The skraft command line — setup and maintenance

The `skraft` commands that set up, check and maintain a repository's runs: how the command finds the plugin, `doctor`, `migrate`, `journal adopt`, `workflow` and `commands`. The commands that drive a run are in [The skraft command line](./cli.md), with the exit codes.

## The `skraft` command <!-- #skraft-command -->

`npm i -g @skraft/cli` installs `skraft` once per machine. The package has its own version and
holds no engine: at each call it looks for the plugin a host installed and imports its
`engine/drivers/cli/skraft.mjs` in the same process, arguments unchanged. Nothing is recorded,
so a plugin update by the host is followed at the next call.

| Order | Where | Used when |
| --- | --- | --- |
| 1 | `SKRAFT_PLUGIN_ROOT` | the variable is set; a folder without the engine stops there, with no fallback |
| 2 | `<COPILOT_HOME or ~/.copilot>/installed-plugins/<marketplace>/skraft/` | the folder holds the engine; the marketplace named `skraft` first, then the others by name |
| 3 | `installPath` of the `skraft@…` entries of `<CLAUDE_CONFIG_DIR or ~/.claude>/plugins/installed_plugins.json` | the folder holds the engine; an entry scoped to a repository (`local`, then `project`, by its `projectPath`) only inside it, then the `user` one; the latest `lastUpdated` first among equals |

With `--version`, the command also writes `plugin: <variable|copilot|claude-code> <folder>` on
stderr; stdout keeps the one version line.

**Session.** `skraft` alone, in a terminal, opens a session: the skraft banner (animated, on
stderr) once, then a `skraft ›` prompt where each line is a command (`doctor`, `status`,
`decide yes`…), with Tab completion and history. Each line runs in its own process, on the plugin
found at that moment; while it runs, Ctrl-C stops the command, not the session. `help` prints the usage; `exit`, `quit` or Ctrl-D leaves. A one-shot command
never shows the banner. `NO_COLOR` uncolours it, `SKRAFT_BANNER=static` skips the animation,
`SKRAFT_BANNER=0` turns it off; `SKRAFT_INTERACTIVE=0` keeps `skraft` alone a call to the engine.

**`skraft upgrade`.** Installs the latest `@skraft/cli` of its channel (`latest`, or `alpha` for an
alpha), then runs `copilot plugin update skraft` and `claude plugin update skraft@<marketplace>`
for each host that has the plugin (Claude Code loads it at its next session). A program missing
from the PATH is skipped; a failed step exits 1. Once a day, a session says when a newer
`@skraft/cli` exists (`SKRAFT_UPDATE_CHECK=0` turns the check off; `SKRAFT_REGISTRY` names
another registry). When no plugin is found, it writes a fixed message
naming the install commands and `SKRAFT_PLUGIN_ROOT` on stderr and exits 1.

## `skraft commands --json` <!-- #skraft-commands -->

**Effect.** Prints every usage line as JSON: `{ "schema": 1, "commands": [{ "command", "synopsis"?, "summary"? }] }`,
in the order of the usage. The dispatch, the usage and this list come from one table of the
engine. The `skraft` command reads it for its session help (`help`, `help <command>`), its Tab
completion (commands, sub-commands, options) and its "did you mean" on an unknown command.
Code 0; any other argument: usage, code 2.

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

## `skraft workflow eject [review]`, `check [--json]`, `diff [--json]`

**`skraft workflow eject`** copies the plugin's `workflows/pipeline.skraft.dot` into
`.skraft/pipeline.skraft.dot`, stamped with the plugin version (`skraft_version`); the run then
follows the copy. `skraft workflow eject review` copies `review.skraft.dot` alone into
`.skraft/review.skraft.dot`; every call to `review` runs it. Neither overwrites a copy.

| Case | Output | Code |
| --- | --- | --- |
| copied | `.skraft/pipeline.skraft.dot holds the skraft <version> pipeline; the run follows it` (review: `… holds the skraft <version> review; every call to review runs it`) on stdout | 0 |
| the copy exists | `<path> already exists; edit it, or remove it` on stderr | 1 |

Syntax, validity rules and locked or mandatory nodes: [The DOT workflow](./workflow-dot.mdx).

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

## See also <!-- #see-also -->

- [The skraft command line](./cli.md)
- [The DOT workflow](./workflow-dot.mdx)
- [Install skraft on a host](../how-to/install-on-a-host.mdx)
- [Migrate from v1](../how-to/migrate-from-v1.md)
- [Eject a workflow](../how-to/eject-workflow.mdx)
