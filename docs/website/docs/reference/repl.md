---
title: "The REPL of an attempt: skraft_repl"
description: "The JavaScript REPL where an agent runs its project commands: the cell API, the signed trace of each run, the limits, the refusals and what is not measured."
persona: software-engineer
---

# The REPL of an attempt: `skraft_repl`

`skraft_repl` is an [MCP tool](./mcp-server.md) that gives the agent of an open attempt a persistent JavaScript (node) REPL. The agent runs its project commands there (build, format, lint, test, architecture, coverage, end to end), and the engine writes down what each program did. The engine requires none of those runs yet: the trace is a record, which a later change will check.

Why the engine records the runs instead of reading what an agent says of them: [Architecture](../explanation/architecture.md).

:::caution[Not verified on V2]
Measured: a first call of the tool under `claude -p` on Claude Code 2.1.325 (macOS) is denied
until the session allows the tool by its name, and then reaches the engine, `Bash` being denied.
Not measured: "always allow" persisting, an interactive session, autopilot, VS Code, Copilot CLI
(which agent sessions offer the tool, headless, is measured; whether it asks before a call is
not), the host's MCP call timeout, and whether a host sends `notifications/cancelled`. Windows:
the shell choice and the tree kill are written, not run. See `docs/v2/host-verification.md`.
:::

## Who gets it, and when <!-- #who -->

| Rule | Detail |
| --- | --- |
| Agents | the acceptance designer and the software engineer, whose descriptors name the tool; never a review lens |
| Attempt | the call is bound to the open attempt of the active run: no open attempt, or an agent that commits no code, is refused with `repl-unavailable` |
| Kernel | one child process per attempt, started by the first call and ended when the attempt closes, when another attempt calls, after 15 minutes unused with no run alive, when the session closes or when the kernel dies |
| Concurrency | the call does not wait in the server's queue, so `skraft_status` and `skraft_precheck` answer while a cell runs; a second call while a cell runs is refused with `repl-busy` |
| Lease | `logs/runs/<step>-<visit>-<attempt>/.lock` names the server that holds the attempt's REPL; another server is refused with `repl-held-elsewhere` unless the holder is gone |

## What a cell can do <!-- #cell -->

The cell is JavaScript. Variables stay from one call to the next and a cell may `await` at its top level.

| Name | Does |
| --- | --- |
| `run(command, { cwd = '.', timeout = 600, gate, label })` | starts a program and returns a handle at once. `command` is an argv array (no shell) or a string, run by `sh -c`; under Windows by Git Bash when it is installed, else by `pwsh` or `powershell`. `cwd` is relative to the working copy and never leaves it. `timeout` is in seconds, 1 to 7200 |
| handle | `id`, `command`, `running`, `tail(n = 50)`, `output()`, `poll()` (the result, or `null` while it runs), `kill(signal = 'SIGTERM', grace = 5)`; `await handle` gives `{ exitCode, output, durationMs, head, log }` (`head`: the HEAD of the repository holding `cwd` when the program ended, the value of `headAfter` in the trace) |
| `gate(name, command, options)` | `run` with the gate named: `build`, `format`, `lint`, `test`, `architecture`, `coverage` or `e2e` |
| `absent(gate, component, reason)` | declares that the project's `AGENTS.md` names no such gate for the component |
| `console.log` | prints into the call's result |

A cell that runs past 90 seconds answers with what it printed so far while its runs go on. A call with empty code then waits for the cell and gets its end. A run that finishes while another cell goes on is told at the start of the next result (`[run-done r3 exit 0 …]`).

## What the agent reads back <!-- #result -->

The result holds, in order, at most 24 KiB: the runs that finished since the last call, what the cell printed, one line per run it started (id, how it ended, duration, command, log), then the trailing value inspected at depth 2 or the cell's error. What is cut lives whole in `cell-<n>.log` beside the runs, and the result names it. The log of a run holds its output, 64 MiB at most with the head and the tail kept.

## The trace <!-- #trace -->

The server, not the cell, starts every program and writes `runs.jsonl` in the attempt's folder `logs/runs/<step>-<visit>-<attempt>/`:

| Line | When | Holds |
| --- | --- | --- |
| `start` | a program starts | run id, cell, command, folder, gate, label |
| `run` | it ends | the argv actually started and the shell, exit code, signal, whether it timed out or was killed, its output size and whether it was cut, the SHA-256 of its log, Git's `HEAD` of the repository holding its folder before and after, and whether the tree was clean when it started |
| `absent` | a gate is declared absent | gate, component, reason |

A tree is clean when Git lists no uncommitted file but the tracking folder's. Each line ends with an HMAC of the run's journal key, kept outside the working copy: the trace is tamper-evident, not tamper-proof, because a command an agent runs can read the key too.

## Limits and refusals <!-- #limits -->

| Code | Means |
| --- | --- |
| `repl-unavailable` | no open attempt, or an agent that commits no code |
| `repl-busy` | a cell of the attempt is still running |
| `repl-held-elsewhere` | another server holds the attempt's REPL |
| `repl-restarted` | a cell would not stop and the kernel was ended: its variables are gone |
| `repl-crashed` | the kernel exited by itself: its variables are gone |
| `repl-failed` | the kernel could not start |

The texts are fixed by the engine. The result of a cell carries the cell's own output and errors, which is the one place the engine's fixed-message rule does not apply; an exception of the engine itself goes to the server's log. A cancellation of the request (`notifications/cancelled`) stops the awaits of the cell, ends the runs it started and answers `interrupted`; a cancellation that arrives before the call has launched its cell is kept: the cell never runs and the call answers `repl-interrupted`; a cell that still does not stop after three seconds ends the kernel. An interrupt cannot break a synchronous loop: it ends the kernel.

Every program runs with the developer's rights, as in `Bash`: the REPL is no sandbox. A server killed without cleaning up leaves its programs in `.copilot-tracking/skraft-repl/<pid>.json`; the next server to start a kernel ends those whose recorded start time still matches, never a process the system reused. That journal stays under `.copilot-tracking/skraft-repl/`, outside the tracking folder of any story: it belongs to the server, not to a run.
