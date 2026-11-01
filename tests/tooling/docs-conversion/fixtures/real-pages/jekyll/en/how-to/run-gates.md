---
layout: doc
lang: en
title: "Run the gates and read their evidence"
description: "Run the gates of the changed components or of every component, read the output, open the evidence file and handle an environment or deterministic failure."
persona: software-engineer
---

# Run the gates and read their evidence

**Goal**: run your components' gates by hand, before or after a run, and know what to do with
each failure.

## Prerequisites

- A `skraft-config.json` with at least one gate per component
  ([Configure the components]({{ "/en/how-to/configure-components" | relative_url }})).
- An active pipeline: `skraft init <slug>` or `/skraft <slug>` (otherwise refused with
  `no-active-pipeline`).
- A terminal at the root of the working copy; `skraft` is the command that [`skraft install`]({{ "/en/how-to/install-on-a-host" | relative_url }}#skraft-command) sets up; the long line `node "<plugin folder>/engine/drivers/cli/skraft.mjs"` works without it.

## 1. Run the gates of the changed components

```text
skraft gate
```

Only components changed since their base are kept (commits, index, modified or untracked files).
For each, the gates run in the order `build`, `format`, `lint`, `test`, `architecture`,
`coverage`, `mutation`; a component stops at its first failing gate, the others go on. When
nothing changed:

```text
skraft checkout: gates passed — no component changed since its base; no gate to run
```

## 2. Run the gates of every component

```text
skraft gate --all
```

## 3. Read the output

```text
pass  web/build
pass  web/lint
fail (deterministic)  web/test: exited 1
pass  api/build
fail (environment)  api/mutation: command not found: dotnet; install it or change the command in skraft-config.json
skraft checkout: gates failed — web/test: exited 1; api/mutation: command not found: dotnet; …
```

Exit code: 0 when `passed`, 1 otherwise. `--json` gives the same result for a script, with each
evidence path in `evidence`.

## 4. Open the evidence file

```text
.copilot-tracking/skraft-plans/<slug>/gates/<component>/<gate>-<n>.log
```

`<n>` grows with each run; earlier evidence stays. Read the `result:` line, then `--- stderr`:

```text
$ npm test
cwd: ../payment-web
result: fail (deterministic): exited 1
--- stdout
…
--- stderr
…
```

## 5. Handle the failure by its class

| Class | What happened | What to do |
|---|---|---|
| `deterministic` | the command ran and returned a non-zero code | fix the code or the test from `stderr`, then run again |
| `environment` | program not found, shell syntax, component without a gate, program stopped, mutation report missing | repair the machine or the command, then run again; running again unchanged gives the same failure |

During a run, an `environment` failure does not stop the run: it asks
`<node> cannot run on this machine: <reason>. Fix it, then RETRY; or ABORT the run.` Repair, then
answer `RETRY` ([Answer a run's question]({{ "/en/how-to/answer-a-question" | relative_url }})).

## Troubleshooting

| Reason | Action |
|---|---|
| `command not found: dotnet; install it or change the command in skraft-config.json` | Install the program, or write a command that works for you. |
| `command "npm ci && npx vitest run" uses shell syntax (&&); put the steps in a script and call the script` | Put the steps in a script (`"test:ci": "npm ci && vitest run"` in `package.json`) and write `"test": "npm run test:ci"`. |
| `no gate command; give it at least one of build, format, lint, test, architecture, coverage, mutation in skraft-config.json` | Add at least one gate to the component. |
| `npx was stopped by SIGKILL; run it again` | Run again (memory, interruption). |
| `… the mutation report web/reports/mutation/mutation.json is missing; have the command write it there, or name the file it writes with mutationReport …` | Have the report written there, or name it with `mutationReport` on the component. |
| A test that needs Microcks fails for want of a container | Start Docker or Podman, then `skraft gate`; or switch the component to `"mocking": { "strategy": "inprocess" }` ([what you give up]({{ "/en/explanation/customisation-trade-offs" | relative_url }})). |
| Windows: `npm.cmd` written in the command | Write `npm`, `npx` or `gradlew.bat`: the engine finds the program with PATHEXT and runs `.cmd` and `.bat` through cmd.exe. |

To check that a program is found without running the gates: `skraft doctor`.

## See also

- [`skraft gate`]({{ "/en/reference/cli" | relative_url }}) — options, JSON output, codes.
- [Gates]({{ "/en/reference/gates" | relative_url }}) — command gates and review gates.
- [Gate evidence]({{ "/en/reference/run-journal" | relative_url }}#gate-evidence) — format and
  the `gate.ran` event.
