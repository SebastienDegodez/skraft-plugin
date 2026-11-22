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
the shell choice and the tree kill are written, not run. Not measured either: `reset: true` on a
host that never sends a cancellation, and `.repl/lib` (loading, `require`) under Windows. See
`docs/v2/host-verification.md`.
:::

## Who gets it, and when <!-- #who -->

| Rule | Detail |
| --- | --- |
| Agents | the acceptance designer and the software engineer, whose descriptors name the tool; never a review lens |
| Attempt | the call is bound to the open attempt of the active run: no open attempt, or an agent that commits no code, is refused with `repl-unavailable` |
| Kernel | one child process per attempt, started by the first call and ended when the attempt closes, when another attempt calls, after 15 minutes unused with no cell nor run alive, when the session closes or when the kernel dies. It must say it is ready within ten seconds, else the call answers `repl-failed`; it runs with Node flags of its own, never the server's, and a heap of 2 GiB at most: past it the kernel ends and the call answers `repl-crashed`. A kernel ends with every process its cells started by themselves: its process group under POSIX, its tree under Windows |
| Concurrency | the call does not wait in the server's queue, so `skraft_status` and `skraft_precheck` answer while a cell runs; two calls sent at once share one kernel, the second waiting for it to start; a second call while a cell runs is refused with `repl-busy`; a cancellation names its request, so it reaches only that call |
| Lease | `logs/runs/<step>-<visit>-<attempt>/.lock` names the server that holds the attempt's REPL; the server renews it every 30 seconds. Another server is refused with `repl-held-elsewhere` unless the holder is gone (the system says no process runs under its pid, or one that started at another time) or has not renewed the lease for five minutes; a holder whose start time cannot be read is never taken for gone |

## What a cell can do <!-- #cell -->

The cell is JavaScript. Variables stay from one call to the next and a cell may `await` at its top level. A top-level `const` or `let` lives as long as the kernel: declaring it a second time fails (Node 22: `Identifier '<name>' has already been declared`), and the result adds a fixed hint: assign it again, use another name, or call with `reset: true`.

| Name | Does |
| --- | --- |
| `run(command, { cwd = '.', timeout = 600, gate, label })` | starts a program and returns a handle at once. `command` is an argv array (no shell) or a string, run by `sh -c`; under Windows by Git Bash when it is installed, else by `pwsh` or `powershell`. `cwd` is relative to the working copy and never leaves it. `timeout` is in seconds, 1 to 7200. Any other option is refused, and the run does not start (it is traced as not started). Eight runs of an attempt live at once at most: a ninth does not start |
| handle | `id`, `command`, `running`, `tail(n = 50)`, `output()`, `poll()` (the result, or `null` while it runs), `kill(signal = 'SIGTERM', grace = 5)` (`SIGTERM`, `SIGINT` or `SIGKILL`, a grace of 0 to 30 whole seconds, never past the run's timeout; any other returns a fixed refusal and the program goes on); `await handle` gives `{ exitCode, output, durationMs, head, log }` (`head`: the HEAD of the repository holding `cwd` when the program ended, the value of `headAfter` in the trace) |
| `gate(name, command, options)` | `run` with the gate named: `build`, `format`, `lint`, `test`, `architecture`, `coverage` or `e2e` |
| `absent(gate, component, reason)` | declares that the project's `AGENTS.md` names no such gate for the component |
| `console.log` | prints into the call's result; so do `console.error`, `process.stdout.write` and `process.stderr.write` |

A call takes `code` (empty to wait for the cell in flight), `reset` and `workspace`; any other argument is refused. `reset: true` ends the kernel and its runs, even while a cell runs, starts a fresh kernel and runs `code` there; its result starts with `repl-reset`.

A cell lives 7260 seconds at most (the longest run and a minute): past it the cell is interrupted, its kernel restarted three seconds later if it still runs, and the next call answers `repl-restarted`.

A cell that runs past 90 seconds answers with what it printed so far while its runs go on. A call with empty code then waits for the cell and gets its end. A run that finishes while another cell goes on is told at the start of the next result (`[run-done r3 exit 0 …]`).

## The project's REPL library <!-- #lib -->

`.repl/` at the root of the working copy belongs to the project: the engine reads it and never writes it; the developer keeps it. Each `.repl/lib/<name>.mjs` is imported by the kernel when it starts, in the alphabetical order of the names, and every cell gets its named exports as `lib.<name>`. A module runs in the kernel, so it may call `run` and `gate` as a cell does. A module that throws on load, or takes more than ten seconds, is left out and the kernel goes on. The first result of a kernel names what it loaded (`lib: a, b`) and each module it could not.

The packages a library needs are declared in `.repl/package.json`, with its lockfile, both committed; the developer installs them with `npm ci --prefix .repl`, under `.repl/node_modules/`, which is not committed. `require` in a cell looks in `.repl/` first, then in the working copy. When `.repl/package.json` names packages and `.repl/node_modules/` is absent, the first result says so and names that command.

## What the agent reads back <!-- #result -->

The result holds, in order, at most 24 KiB: the runs that finished since the last call, what the cell printed, one line per run it started (id, how it ended, duration, command, log), then the trailing value inspected at depth 2 or the cell's error. What is cut lives in `cell-<n>.log` beside the runs, and the result names it. What a cell prints is kept to 1 MiB, its first and last 512 KiB around a marker, in the result and in that file alike. The kernel keeps the output of its last 50 runs; the `output()` of an older handle names the run's log. The log of a run is written as the program runs, so it can be read while the run goes on; it holds the first 64 MiB of the output, and the `run` line says when the rest was cut (`cut`). Its SHA-256 is computed as it is written. Each line of `runs.jsonl` is appended; a line or a log that cannot be written heads every next result with `repl-trace-failed`, which names the run's `logs/unexpected.log`.

## The trace <!-- #trace -->

The server, not the cell, starts every program and writes `runs.jsonl` in the attempt's folder `logs/runs/<step>-<visit>-<attempt>/`:

| Line | When | Holds |
| --- | --- | --- |
| `start` | a program starts | run id, cell, command, folder (relative to the working copy, `/` between its parts, `.` for the working copy itself), gate, label |
| `run` | it ends | the argv actually started and the shell, exit code, signal, whether it timed out or was killed, its output size and whether it was cut, the SHA-256 of its log, Git's `HEAD` of the repository holding its folder before and after, and whether the tree was clean when it started |
| `absent` | a gate is declared absent | gate, component, reason |
| `lost` | a kernel starts for an attempt whose trace holds a `start` with no `run` (a server killed while the run went on) | run id, when it was closed; the first result after it says `rN lost with the server that started it` |

A tree is clean when Git lists no uncommitted file but the tracking folder's. Each line ends with an HMAC of the run's journal key, kept outside the working copy: the trace is tamper-evident, not tamper-proof, because a command an agent runs can read the key too.

## Bounds and lifecycle <!-- #bounds -->

Every bound is fixed by the engine; none is configurable.

| Bound | Value | Past it |
| --- | --- | --- |
| a run | 1 to 7200 s, its `timeout` | timed out: its process group (its tree under Windows) ends, whatever grace a `kill` gave |
| a `kill` | `SIGTERM`, `SIGINT` or `SIGKILL`, a grace of 0 to 30 whole seconds | refused, the program goes on |
| live runs of an attempt | 8 | the next `run()` does not start |
| a call | answers after 90 s | the cell goes on; an empty call waits for it |
| a cell | 7260 s | interrupted, its kernel restarted three seconds later: `repl-restarted` |
| kernel start | 10 s to say it is alive | `repl-failed` |
| one module of `.repl/lib` | 10 s to load | left out, the kernel goes on |
| a run's log | its first 64 MiB, written as it runs | the rest is not written; `cut` in the trace |
| a result | 24 KiB | the rest in `cell-<n>.log` |
| what a cell prints | 1 MiB: its first and last 512 KiB | a marker between them |
| outputs a kernel keeps | its last 50 runs | an older handle names its log |
| kernel heap | 2 GiB | the kernel ends: `repl-crashed` |
| a lease | renewed every 30 s | not renewed for five minutes: another server may take the attempt over |
| ending a kernel | waits 10 s for its runs | they were sent `SIGKILL`; the kernel's own group or tree ends with it |

A kernel lives from the first call of an attempt until the attempt closes, another attempt calls, 15 minutes pass with no cell nor run alive, the session closes, `reset: true` is called, or the kernel dies.

## Limits and refusals <!-- #limits -->

| Code | Means |
| --- | --- |
| `repl-unavailable` | no open attempt, or an agent that commits no code |
| `repl-busy` | a cell of the attempt is still running |
| `repl-held-elsewhere` | another server holds the attempt's REPL |
| `repl-restarted` | a cell would not stop and the kernel was ended: its variables are gone |
| `repl-crashed` | the kernel exited by itself: its variables are gone |
| `repl-trace-failed` | heads every result once a line of the trace or a run's log could not be written: the trace is incomplete |
| `repl-reset` | heads the result of a call with `reset: true`: the kernel was ended and a fresh one started, its variables are gone |
| `repl-failed` | the kernel could not start; the refusal names the run's `logs/unexpected.log`, which holds why |
| `repl-unexpected` | skraft itself failed during the call; the refusal names the run's `logs/unexpected.log`, which holds the exception |

The texts are fixed by the engine. The result of a cell carries the cell's own output and errors, which is the one place the engine's fixed-message rule does not apply; an exception of the engine itself goes to the run's `logs/unexpected.log`, which nothing reads back and the refusal names. One raised before the call is bound to an attempt goes to the server's log, and the call answers a fixed text. A cancellation of the request (`notifications/cancelled`) stops the awaits of the cell, ends the runs it started and answers `interrupted`; a cancellation that arrives before the call has launched its cell is kept: the cell never runs and the call answers `repl-interrupted`; a cell that still does not stop after three seconds ends the kernel. An interrupt cannot break a synchronous loop: it ends the kernel. Ending a kernel ends its runs with SIGKILL and waits ten seconds at most for them; a run asked for while the kernel ends never starts, and is traced as not started (`the attempt's REPL was ended`).

Every program runs with the developer's rights, as in `Bash`: the REPL is no sandbox. A server killed without cleaning up leaves its programs in `.copilot-tracking/skraft-repl/<pid>.json`; the next server to start a kernel ends those whose recorded start time still matches, never a process the system reused. The start time of each process is asked of the system (`ps`, PowerShell under Windows) once, while the server goes on answering its other calls. That journal stays under `.copilot-tracking/skraft-repl/`, outside the tracking folder of any story: it belongs to the server, not to a run.
