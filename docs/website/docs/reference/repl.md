---
title: "The REPL of an attempt: skraft_repl and skraft_repl_reset"
description: "The JavaScript REPL where an agent runs its project commands and the tool that ends its kernel: cell API, signed trace, limits, refusals, what is not measured."
persona: software-engineer
---

# The REPL of an attempt: `skraft_repl` and `skraft_repl_reset`

`skraft_repl` is an [MCP tool](./mcp-server.md) that gives the agent of an open attempt a persistent JavaScript (node) REPL. The agent runs its project commands there (build, format, lint, test, architecture, coverage, end to end), and the engine writes down what each program did. The engine reads those runs when a DELIVER attempt is submitted: see [Gates](./gates.md). A second tool, `skraft_repl_reset`, ends the attempt's kernel and its runs, even while a cell runs; the next `skraft_repl` starts a fresh kernel.

Why the engine records the runs instead of reading what an agent says of them: [Architecture](../explanation/architecture.md).

:::caution[Not verified on V2]
Measured: a first call of the tool under `claude -p` on Claude Code 2.1.325 (macOS) is denied
until the session allows the tool by its name, and then reaches the engine, `Bash` being denied.
Not measured: "always allow" persisting, an interactive session, autopilot, VS Code, Copilot CLI
(which agent sessions offer the tool, headless, is measured; whether it asks before a call is
not), the host's MCP call timeout, and whether a host sends `notifications/cancelled`. Windows:
the shell choice and the tree kill are written, not run. Not measured either: `skraft_repl_reset` on
a host that never sends a cancellation, its permission and its reach on any real host (the probes
cover it and are still to be run), and `.repl/lib` (loading, `require`) under Windows. See
`docs/v2/host-verification.md`.
:::

## Who gets it, and when <!-- #who -->

| Rule | Detail |
| --- | --- |
| Agents | the acceptance designer and the software engineer, whose descriptors name both tools; never a review lens. An agent that names `skraft_repl` names `skraft_repl_reset` too: the descriptor check refuses one without the other |
| Attempt | the call is bound to the open attempt of the active run: no open attempt, or an agent that commits no code, is refused with `repl-unavailable`, and so is `skraft_repl_reset` |
| Kernel | one child process per attempt, started by the first call and ended when the attempt closes, when another attempt calls, after 15 minutes unused with no cell nor run alive, when the session closes or when the kernel dies. It must say it is alive within ten seconds and be ready within thirty, its library loaded, else it is ended and the call answers `repl-failed`; it runs with Node flags of its own, never the server's, and a heap of 2 GiB at most: past it the kernel ends and the call answers `repl-crashed`. A kernel ends with every process its cells started by themselves: its process group under POSIX, its tree under Windows |
| Concurrency | the call does not wait in the server's queue, so `skraft_status` and `skraft_precheck` answer while a cell runs; two calls sent at once share one kernel, the second waiting for it to start; a second call while a cell runs is refused with `repl-busy`; a cancellation names its request, so it reaches only that call. `skraft_repl_reset` does not wait in the server's queue either, and is never refused as busy: it waits only for a kernel being started or ended |
| Lease | `logs/runs/<step>-<visit>-<attempt>/.lock` names the server that holds the attempt's REPL; the server renews it every 30 seconds. Another server is refused with `repl-held-elsewhere`, for `skraft_repl_reset` too, unless the holder is gone (the system says no process runs under its pid, or one that started at another time) or has not renewed the lease for five minutes; a holder whose start time cannot be read is never taken for gone |

## What a cell can do <!-- #cell -->

The cell is JavaScript. Variables stay from one call to the next and a cell may `await` at its top level. A top-level `const` or `let` lives as long as the kernel: declaring it a second time fails (Node 22: `Identifier '<name>' has already been declared`), and the result adds a fixed hint: declare a variable reused across cells with `var`, or under a new name, or call `skraft_repl_reset` for a fresh kernel.

| Name | Does |
| --- | --- |
| `run(command, { cwd = '.', timeout = 600, gate, label })` | starts a program and returns a handle at once. `command` is an argv array (no shell) or a string, run by `sh -c`; under Windows by Git Bash when it is installed, else by `pwsh` or `powershell`. `cwd` is relative to the working copy and never leaves it. `timeout` is in seconds, 1 to 7200. Any other option is refused, and the run does not start (it is traced as not started). Eight runs of an attempt live at once at most: a ninth does not start |
| handle | `id`, `command`, `running`, `tail(n = 50)`, `output()`, `poll()` (the result, or `null` while it runs), `kill(signal = 'SIGTERM', grace = 5)` (`SIGTERM`, `SIGINT` or `SIGKILL`, a grace of 0 to 30 whole seconds, never past the run's timeout; any other returns a fixed refusal and the program goes on); `await handle` gives `{ exitCode, output, durationMs, head, log }` (`head`: the HEAD of the repository holding `cwd` when the program ended, the value of `headAfter` in the trace) |
| `gate(name, command, options)` | `run` with the gate named: `build`, `format`, `lint`, `test`, `architecture`, `coverage` or `e2e` |
| `absent(gate, component, reason)` | declares that the component has no command for this gate: the delivery brief's `no command` line gives the exact call; `test` is never absent |
| `console.log` | prints into the call's result; so do `console.error`, `process.stdout.write` and `process.stderr.write` |

A call of `skraft_repl` takes `code` (empty to wait for the cell in flight) and `workspace`; any other argument, `reset` included, is refused without being echoed.

`skraft_repl_reset` takes only `workspace`. It ends the kernel of the open attempt and the runs it started, even while a cell runs (`SIGKILL`, then ten seconds at most for them to end), and answers `repl-reset`; the call in flight answers `repl-reset` too. The next `skraft_repl` starts a fresh kernel, answers `repl-fresh` first, and its variables are gone; run ids go on. With no kernel running, it ends nothing and answers `repl-no-kernel`. A kernel that will not stop, or that the agent no longer trusts: call `skraft_repl_reset`, then `skraft_repl`.

A cell lives 7260 seconds at most (the longest run and a minute): past it the cell is interrupted, its kernel restarted three seconds later if it still runs, and the next call answers `repl-restarted`.

A cell that runs past 90 seconds answers with what it printed so far while its runs go on. A call with empty code then waits for the cell and gets its end. A run that finishes while another cell goes on is told at the start of the next result (`[run-done r3 exit 0 …]`).

## The project's REPL library <!-- #lib -->

`.repl/` at the root of the working copy belongs to the project: the engine reads it and never writes it; the developer keeps it. Each `.repl/lib/<name>.mjs` is imported by the kernel when it starts, in the alphabetical order of the names, and every cell gets its named exports as `lib.<name>`. `<name>` must be a JavaScript identifier; any other file of `.repl/lib/` is not loaded, and the first result names it. A module runs in the kernel, so it may call `run` and `gate` as a cell does. A module that throws on load, or takes more than ten seconds, is left out and the kernel goes on. The first result of a kernel names what it loaded (`lib: a, b`) and each module it could not.

The packages a library needs are declared in `.repl/package.json`, with its lockfile, both committed; the developer installs them with `npm ci --prefix .repl`, under `.repl/node_modules/`, which is not committed. `require` in a cell looks in `.repl/` first, then in the working copy. When `.repl/package.json` names packages and `.repl/node_modules/` is absent, the first result says so and names that command.

How to write a library, install its packages and reload it: [Keep your REPL scripts in `.repl`](../how-to/keep-repl-scripts.md).

## Skill scripts in a cell <!-- #skill-scripts -->

A skill script is a program first: an agent starts it as `node "<absolute path>" …`, and in a cell through `run()` or `gate()`.

| Script | In a cell |
| --- | --- |
| a gate script (the coverage, architecture or no-mocks script of a `quality-gates-<stack>` skill) | runs through `gate(name, ['node', '<absolute path>', …], { cwd })`: its exit code is evidence only when the server started it, and the trace holds that run. Imported, it proves nothing: no run is traced |
| a script that calls neither the engine nor the MCP server, and whose run is no gate's evidence (the request body of `azure-devops-forge-writes`, for instance) | may be imported; the cell then calls its exported function (`commentRequest(markdown)`), with an explicit root when it reads files, never the process's folder |

Importing a skill script does nothing by itself: a script runs its command only when it is the program `node` started, and a contract test imports every one of them and checks that it prints nothing and exits 0. Starting a script costs a Node start, about 17 ms (median of 20 starts, macOS, Node 22.23; Windows not measured); the gate scripts run once per pass, so they stay programs.

## What the agent reads back <!-- #result -->

The result holds, in order, at most 24 KiB: the runs that finished since the last call, what the cell printed, one line per run it started (id, how it ended, duration, command, log), then the trailing value inspected at depth 2 or the cell's error. What is cut lives in `cell-<n>.log` beside the runs, and the result names it. What a cell prints is kept to 1 MiB, its first and last 512 KiB around a marker, in the result and in that file alike. The kernel keeps the output of its last 50 runs; the `output()` of an older handle names the run's log. The log of a run is written as the program runs, so it can be read while the run goes on; past 64 MiB of output it keeps the first and the last 32 MiB around a marker, cut on whole characters, and the `run` line says so (`cut`). Its SHA-256 is computed as it is written. Each line of `runs.jsonl` is appended; a line or a log that cannot be written heads every next result with `repl-trace-failed`, which names the run's `logs/unexpected.log`.

## The trace <!-- #trace -->

The server, not the cell, starts every program and writes `runs.jsonl` in the attempt's folder `logs/runs/<step>-<visit>-<attempt>/`. Run ids go on across the kernels of an attempt (a reset, a crash, another server): an id, and its log, is never reused.

The code of each cell is written to `cell-<n>.mjs` in the same folder once the kernel takes the cell, before it runs, whole, even when its result is cut; a call refused as `repl-busy` writes no file. `<n>` is the number of the cell in the attempt and goes on across its kernels, as run ids do: after a reset the next cell takes the next number, and no file is written over. The `cell` of each line of `runs.jsonl` is that same number, so a run names the file of the cell that started it. A cut result's `cell-<n>.log` carries the same number, so a cell's code and its output sit side by side. Like the rest of `logs/`, these files are never committed, and the engine never deletes them. A file that cannot be written heads every next result with `repl-trace-failed`, and the cell runs. To keep a script an agent wrote, copy its `cell-<n>.mjs` into the project's library: [Keep your REPL scripts in `.repl`](../how-to/keep-repl-scripts.md).

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
| kernel start | 10 s to say it is alive, 30 s in all to be ready, its library loaded | the kernel and its group end: `repl-failed` |
| `.repl/lib` | 10 s per module, 20 s for the whole library | a module left out, the kernel goes on; a module that never yields ends the start at its 30 s |
| a run's log | 64 MiB, written as it runs | its first and last 32 MiB kept around a marker, cut on whole characters; `cut` in the trace |
| a result | 24 KiB | the rest in `cell-<n>.log` |
| what a cell prints | 1 MiB: its first and last 512 KiB | a marker between them |
| outputs a kernel keeps | its last 50 runs | an older handle names its log |
| kernel heap | 2 GiB | the kernel ends: `repl-crashed` |
| a lease | renewed every 30 s | not renewed for five minutes: another server may take the attempt over |
| ending a kernel | waits 10 s for its runs | they were sent `SIGKILL`; the kernel's own group or tree ends with it |
| `skraft_repl_reset` | waits for no cell and no other tool | never `repl-busy`; it ends the kernel as above |

A kernel lives from the first call of an attempt until the attempt closes, another attempt calls, 15 minutes pass with no cell nor run alive, the session closes, `skraft_repl_reset` is called, or the kernel dies.

## Limits and refusals <!-- #limits -->

| Code | Means |
| --- | --- |
| `repl-unavailable` | no open attempt, or an agent that commits no code |
| `repl-busy` | a cell of the attempt is still running |
| `repl-held-elsewhere` | another server holds the attempt's REPL |
| `repl-restarted` | a cell would not stop and the kernel was ended: its variables are gone |
| `repl-crashed` | the kernel exited by itself: its variables are gone |
| `repl-trace-failed` | heads every result once a line of the trace or a run's log could not be written: the trace is incomplete |
| `repl-reset` | the answer of `skraft_repl_reset`, and the head of the call in flight it ended: the kernel and its runs were ended, its variables are gone |
| `repl-no-kernel` | the answer of `skraft_repl_reset` when no kernel of the attempt runs: nothing was ended |
| `repl-fresh` | heads the first result after a reset, the sweep or the session ended the attempt's kernel: a fresh one started, its variables are gone |
| `repl-failed` | the kernel could not start; the refusal names the run's `logs/unexpected.log`, which holds why |
| `repl-unexpected` | skraft itself failed during the call; the refusal names the run's `logs/unexpected.log`, which holds the exception |

The texts are fixed by the engine. The result of a cell carries the cell's own output and errors, which is the one place the engine's fixed-message rule does not apply; an exception of the engine itself goes to the run's `logs/unexpected.log`, which nothing reads back and the refusal names. One raised before the call is bound to an attempt goes to the server's log, and the call answers a fixed text. A cancellation of the request (`notifications/cancelled`) stops the awaits of the cell, ends the runs it started and answers `interrupted`; a cancellation that arrives before the call has launched its cell is kept: the cell never runs and the call answers `repl-interrupted`; a cell that still does not stop after three seconds ends the kernel. An interrupt cannot break a synchronous loop: it ends the kernel. Ending a kernel ends its runs with SIGKILL and waits ten seconds at most for them; a run asked for while the kernel ends never starts, and is traced as not started (`the attempt's REPL was ended`).

Not offered, on purpose: a per-call `timeout_ms` (a call answers at 90 s, a run takes its `timeout`), a `title` for a call, reloading a local `.mjs` file at each import, keeping the bindings a cancelled cell had not committed, `process` as a module to import, and named sessions or a history of cells. The REPL is one kernel per attempt, and its bounds are the engine's.

Every program runs with the developer's rights, as in `Bash`: the REPL is no sandbox. A server killed without cleaning up leaves its programs in `.copilot-tracking/skraft-repl/<pid>.json`; the next server to start a kernel ends those whose recorded start time still matches, never a process the system reused. The start time of each process is asked of the system (`ps`, PowerShell under Windows) once, while the server goes on answering its other calls. That journal stays under `.copilot-tracking/skraft-repl/`, outside the tracking folder of any story: it belongs to the server, not to a run.
