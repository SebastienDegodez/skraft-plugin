---
layout: doc
lang: en
title: "Run the gates and read their evidence"
description: "Run the gates of the changed components or of every component, read the output, open the evidence file and know what to do with an environment or a deterministic failure."
persona: software-engineer
---

# Run the gates and read their evidence

**Goal**: run your components' gates, find out why one fails and who has to act.

A **gate** is a named command of `skraft-config.json` (`build`, `format`, `lint`, `test`, `architecture`, `coverage`, `mutation`) that the engine runs itself. Each run leaves an **evidence file** and a `gate.ran` line in the run's journal.

During a run, the engine runs the gates itself in DELIVER: the `gates` node, then the `mutation` node, both locked. `skraft gate` runs the same commands by hand, to check a component before or after a run.

## Prerequisites

- A `skraft-config.json` with at least one gate per component (see [Configure the components]({{ "/en/how-to/configure-components" | relative_url }})).
- An active pipeline in the working copy: `skraft init <slug>` (or `/skraft <slug>` in Claude Code). Without one, the command is refused with `no-active-pipeline`.
- `skraft` stands for `node "<plugin folder>/engine/drivers/cli/skraft.mjs"`, where `<plugin folder>` is the folder where the host installed the skraft plugin. Run it from the root of the working copy.

## 1. Run the gates of the changed components

```
skraft gate
```

The engine keeps only the components changed since their base: commits, index, modified files and untracked files. It ignores `.copilot-tracking/` and files that belong to a nested component. A component with no base is always kept.

For each component kept, the gates run in order. A component stops at its first failing gate; the other components go on.

When nothing changed:

```
skraft checkout: gates passed — no component changed since its base; no gate to run
```

## 2. Run the gates of every component

```
skraft gate --all
```

This is the closing check: every component, changed or not.

## 3. Read the output

One line per gate run, then a summary:

```
pass  web/build
pass  web/lint
fail (deterministic)  web/test: exited 1
pass  api/build
fail (environment)  api/test: Docker does not answer and api mocks with Microcks; start Docker, or set "mocking": { "strategy": "inprocess" } on the component
skraft checkout: gates failed — web/test: exited 1; api/test: Docker does not answer and api mocks with Microcks; start Docker, or set "mocking": { "strategy": "inprocess" } on the component
```

Exit code: 0 when `passed`, 1 otherwise. A refusal shows its code in parentheses:

```
skraft checkout: gates refused (no-components) — skraft-config.json lists no component; run skraft init to detect them
```

For a tool or a script, `--json` returns the whole result: `status`, `scope`, `components`, `failure`, `code`, `reason` and, for each gate, `component`, `gate`, `status`, `failure`, `reason`, `evidence`.

```
skraft gate --all --json
```

## 4. Open the evidence file

Each gate run writes:

```
.copilot-tracking/skraft-plans/<slug>/gates/<component>/<gate>-<n>.log
```

`<n>` grows with each new run of the same gate: the previous evidence stays. The `evidence` field of `--json` gives the full path.

Content:

```
$ npm test
cwd: ../payment-web
result: fail (deterministic): exited 1
--- stdout
…
--- stderr
…
```

The `result:` line gives the verdict and the reason. `stdout` and `stderr` are the command's own, untouched. When nothing was started (line refused, `{baseSha}` with no base, Docker missing for Microcks), the file stops after `result:`. When the program could not start (not found), the `--- stdout` and `--- stderr` sections are there and empty.

## 5. Tell environment from deterministic

| Class | What happened | Who acts | What to do |
|---|---|---|---|
| `environment` | Program not found (or exit code 127 / 9009), Docker missing for Microcks, shell syntax, component with no gate, program stopped | A human, on the machine or in the config | Install the tool, start Docker, fix the command, then run again |
| `deterministic` | The command ran and returned a non-zero code | The code | Read `stderr` in the evidence, fix the code or the test, run again |

An `environment` failure says nothing about your code: running again without changing anything gives the same failure. A `deterministic` failure is not fixed by changing machines.

When the gates run as a pipeline step, an `environment` failure does not stop the run: the engine asks `<node> cannot run on this machine: <reason>. Fix it, then RETRY; or ABORT the run.` Fix the machine, then answer `RETRY` (see [Resume or unblock a run]({{ "/en/how-to/resume-a-run" | relative_url }})).

`environment` reasons you will see:

| Reason | Action |
|---|---|
| `command not found: dotnet; install it or change the command in skraft-config.json` | Install the program, or write a command that works for you. |
| `npx was stopped by SIGKILL; run it again` | The program was stopped (memory, interruption). Run again. |
| `no gate command; give it at least one of build, format, lint, test, architecture, coverage, mutation in skraft-config.json` | Give the component at least one gate. |
| `command "dotnet stryker --since:{baseSha}" uses {baseSha} but the run has no base for this repository` | Put the component's root in a Git repository, or remove `{baseSha}`. |

## 6. Docker and Microcks

A Microcks component (the default) needs Docker for `test`, `architecture`, `coverage` and `mutation`. The engine asks `docker info` once per run of `skraft gate`. When Docker does not answer, the first of those gates (usually `test`) fails as `environment` **without being started**, and the component stops there: the next ones are not tried. `build`, `format` and `lint`, which come before, still run.

Two ways out:

1. Start Docker, then `skraft gate`.
2. Switch the component to `"mocking": { "strategy": "inprocess" }`. Read the risks in [Customise SKRAFT]({{ "/en/how-to/customisation" | relative_url }}) first.

## 7. Shell syntax refused: write a script

The engine runs commands without a shell. A command with `|`, `&`, `;`, `<` or `>` outside quotes is not started:

```
fail (environment)  web/test: command "npm ci && npx vitest run" uses shell syntax (&&); put the steps in a script and call the script
```

Put the steps in a script, then call it. For instance, in `package.json`:

```json
"scripts": { "test:ci": "npm ci && vitest run" }
```

and in `skraft-config.json`: `"test": "npm run test:ci"`. A Node script (`node scripts/ci-test.mjs`) works under Windows and macOS too.

An unclosed quote is refused the same way: `has an unclosed " quote`.

## 8. Windows: `.cmd` commands

Write `npm test`, `npx vitest run` or `gradlew.bat test`, not `npm.cmd`. The engine finds the program with PATHEXT, then starts a `.cmd` or `.bat` through cmd.exe, escaping its arguments. The same line works under macOS, Linux and Windows.

To check a program is found before running the gates: `skraft doctor`.

## See also

- [Command-line reference]({{ "/en/reference/cli" | relative_url }})
- [Journal reference]({{ "/en/reference/run-journal" | relative_url }}) — the `gate.ran` event.
- [Resume or unblock a run]({{ "/en/how-to/resume-a-run" | relative_url }})
