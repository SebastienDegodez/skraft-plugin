---
title: "Run the gates and read their evidence"
description: "How the engineer runs each gate through skraft_repl, declares one absent, and how to read the quality-gates lens findings."
persona: software-engineer
---

# Run the gates and read their evidence

The engine runs no gate. In DELIVER the software engineer runs every gate of each component the
story changed through the MCP tool `skraft_repl`, and the DELIVER review's `quality-gates` lens
reads the signed trace of those runs. This page shows what that asks of the engineer and how to read
the lens findings.

## Prerequisites

- A `skraft-config.json` with the commands of each component
  ([Configure the components](./configure-components.md)); `skraft doctor` lists them, it starts none.
- An active pipeline: `skraft init <slug>` or `/skraft <slug>` (otherwise refused with
  `no-active-pipeline`).

## 1. Run each gate through the REPL

For each component the story changed, the engineer runs `build`, `format`, `lint` and
`architecture` in one cell of `skraft_repl` ([The REPL](../reference/repl.md)), before the commit
line, which ends the last of these cells; every gate passes before it, and no `style` commit catches
one up. `coverage`, then `e2e`, run after, on that commit and a clean tree:

```js
await gate('build', 'dotnet build --nologo', { cwd: 'api' })
await gate('format', 'dotnet format --verify-no-changes', { cwd: 'api' })
await gate('lint', 'dotnet build -warnaserror', { cwd: 'api' })
await gate('architecture', 'dotnet test api/Architecture.Tests', { cwd: 'api' })
await run(commitLine, { gate: 'test', label: 'green' })
```

```js
await gate('coverage', 'node scripts/coverage.mjs', { cwd: 'api' })
```

A cell that will not stop, or a kernel the engineer no longer trusts: `skraft_repl_reset` ends the
kernel and its runs, then the next `skraft_repl` starts a fresh one, whose variables are gone.

The `test` gate is the run of the commit line: the whole unfiltered test suite chained to `git add`
and `git commit`, label `green`. That run is the `test` run; the engineer does not run `test` a
second time. The command of each gate is the one `skraft-config.json` gives the component.

## 2. Declare a gate absent

A gate the component names no command for in `skraft-config.json` is declared, with its reason. The
DELIVER brief gives the exact call on the gate's line, for `build`, `format`, `lint`,
`architecture` and `coverage`:

```text
- api: coverage: no command → absent('coverage', 'api', 'no command in skraft-config.json')
```

The engineer makes that call in its cell instead of skipping the gate:

```js
absent('coverage', 'api', 'no command in skraft-config.json')
```

`test` is never absent, and `e2e` is a gate only when the component names its command. A gate
declared absent needs no run.

## 3. What the engine does with the trace

The engine refuses no attempt for the runs. It reads
`logs/runs/<step>-<visit>-<attempt>/runs.jsonl` and, when the trace reads through its signatures,
journals `evidence.checked` with the runs the attempt made. It hands the trace to the DELIVER review.
The reports show the runs under "Quality evidence" ([Gates](../reference/gates.md#command-gates)).

## 4. Read the `quality-gates` findings

The lens reports, per touched component and gate, a run it cannot accept. The engineer
runs the gates again through the REPL, in the cell that ends with the commit line; the log of each run is under
`logs/runs/<step>-<visit>-<attempt>/`.

| Finding | What the engineer does |
| --- | --- |
| a run is missing: no run line, a start with no run, a lost run | run the gate with `gate(name, command, { cwd })` |
| a run did not pass: killed, timed out, exit not 0 | fix the code or the test from the run's log, run again |
| the last run is not on the final commit, nor run before the commit line that made it | run the cell again |
| it started on a dirty tree (the runs before the commit line, and its own, excepted) | commit or discard the change, run again |

A gate declared `absent` with a reason is accepted, never `test`. On a pull request reviewed outside
a run, the lens has no trace and passes.

## Troubleshooting

| Reason | Action |
| --- | --- |
| A program is not found | Install it, or change the command in `skraft-config.json`; `skraft doctor` lists each component's commands. |
| A test that needs Microcks fails for want of a container | Start Docker or Podman, then run the gate again; or switch the component to `"mocking": { "strategy": "inprocess" }` ([what you give up](../explanation/customisation-trade-offs.md)). |
| A gate has no command | Add it to the component, or declare it with `absent`. |

## Next steps <!-- #next-steps -->

- [Gates](../reference/gates.md) — the gates, the quality-gates lens, the review criteria.
- [The REPL](../reference/repl.md) — `gate`, `absent`, the trace.
- [Tracking folder and journal](../reference/run-journal.md#gate-evidence) — the `evidence.checked` event.
