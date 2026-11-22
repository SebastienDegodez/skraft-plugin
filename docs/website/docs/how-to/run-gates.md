---
title: "Run the gates and read their evidence"
description: "How the engineer runs each gate through skraft_repl, declares one absent, and what the engine checks and refuses at the submission of an attempt."
persona: software-engineer
---

# Run the gates and read their evidence

The engine runs no gate. In DELIVER the software engineer runs every gate of each component the
story changed through the MCP tool `skraft_repl`, and the engine reads the signed trace of those
runs when the attempt is submitted. This page shows what that asks of the engineer and how to read
a refusal.

## Prerequisites

- A `skraft-config.json` with the commands of each component
  ([Configure the components](./configure-components.md)); `skraft doctor` lists them, it starts none.
- An active pipeline: `skraft init <slug>` or `/skraft <slug>` (otherwise refused with
  `no-active-pipeline`).

## 1. Run each gate through the REPL

For each component the story changed, the engineer runs the six gates, in cells of `skraft_repl`
([The REPL](../reference/repl.md)):

```js
await gate('build', 'dotnet build --nologo', { cwd: 'api' })
await gate('format', 'dotnet format --verify-no-changes', { cwd: 'api' })
await gate('lint', 'dotnet build -warnaserror', { cwd: 'api' })
await gate('architecture', 'dotnet test api/Architecture.Tests', { cwd: 'api' })
await gate('coverage', 'node scripts/coverage.mjs', { cwd: 'api' })
```

The `test` gate is the run of the commit line: the whole unfiltered test suite chained to `git add`
and `git commit`, label `green`. That run is the `test` run; the engineer does not run `test` a
second time. The command of each gate is the one `skraft-config.json` gives the component.

## 2. Declare a gate absent

A gate the project's documents name no command for is declared, with its reason:

```js
absent('architecture', 'api', 'the project has no dependency rule to check')
```

`test` is never absent. A gate declared absent needs no run.

## 3. What the engine checks

At the submission of the attempt, the engine reads
`logs/runs/<step>-<visit>-<attempt>/runs.jsonl`. For each component the story changed, it holds
every gate to the same rule: the last run of the gate under the component's folder exited 0,
started on a clean tree (the commit line's run excepted) and ended on the final commit; or the gate
was declared absent. Open runs, an unsigned or edited trace and a missing key refuse the attempt
too. When it holds, the journal records `evidence.checked` with the runs it stands on, and the
reports show them under "Quality evidence" ([Gates](../reference/gates.md#command-gates)).

## 4. Read an `evidence` refusal

A refused attempt fails with the code `evidence`, one fixed line per gate, with no output and no
command. The engineer runs the gate again through the REPL, on a clean tree, then commits; the log
of each run is under `logs/runs/<step>-<visit>-<attempt>/`.

| Cause behind a line | What the engineer does |
| --- | --- |
| the gate never ran in this component | run it with `gate(name, command, { cwd })` |
| its last run exited non-zero | fix the code or the test from the run's log, run again |
| it started on a dirty tree | commit or discard the change, run again |
| it ended on an earlier commit than the final one | run again after the last commit |
| a run is still open | wait for it, or run the gate again |
| the trace is unsigned or edited | start the attempt again; a trace is never repaired by hand |

## Troubleshooting

| Reason | Action |
| --- | --- |
| A program is not found | Install it, or change the command in `skraft-config.json`; `skraft doctor` lists each component's commands. |
| A test that needs Microcks fails for want of a container | Start Docker or Podman, then run the gate again; or switch the component to `"mocking": { "strategy": "inprocess" }` ([what you give up](../explanation/customisation-trade-offs.md)). |
| A gate has no command | Add it to the component, or declare it with `absent`. |

## Next steps <!-- #next-steps -->

- [Gates](../reference/gates.md) — the gates, the evidence rules, the review criteria.
- [The REPL](../reference/repl.md) — `gate`, `absent`, the trace.
- [Tracking folder and journal](../reference/run-journal.md#gate-evidence) — the `evidence.checked` event.
