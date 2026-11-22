/**
 * KernelHost — the JavaScript kernel of one agent attempt: a process of its own that evaluates
 * the cells an agent writes. It never starts a program; when a cell calls `run()` it asks the
 * server (`onRun`), which starts the program, records it, and streams its output back.
 *
 * @typedef {'done' | 'error' | 'running' | 'busy' | 'interrupted' | 'restarted' | 'crashed' | 'stopped'} CellStatus
 *   running: the cell's budget ended while it still runs (`wait` takes up its end); busy: another
 *   cell is in flight; restarted: the kernel was ended because a cell would not stop; crashed:
 *   the kernel exited by itself; stopped: the server ended it.
 * @typedef {{ status: CellStatus, printed: string, value: string | null, error: string | null }} CellOutcome
 *   printed: what the cell and the runs of earlier cells printed since the last outcome; value:
 *   the cell's trailing value, inspected at depth 2; error: the cell's error, with its stack.
 * @typedef {{ rid: number, cell: number | null, command: string | string[], cwd: string, timeout: number, gate: string | null, label: string | null, options?: string[] }} RunRequest
 *   what a cell asked to start; every field is the cell's, so the server validates each. options: the names of the options the cell gave.
 * @typedef {{ gate: string, component: string, reason: string, cell: number | null }} AbsentNotice
 * @typedef {{
 *   onRun: (request: RunRequest) => void,
 *   onKill: (rid: number, signal: string, graceSeconds: number) => void,
 *   onAbsent: (notice: AbsentNotice) => void,
 *   onGone: (why: 'restarted' | 'crashed') => void,
 * }} KernelEvents
 * @typedef {{
 *   pid: number | null, lib: { loaded: string[], failed: string[], refused?: string[], notInstalled?: boolean },
 *   evaluate: (code: string, budgetMs: number) => Promise<CellOutcome>,
 *   wait: (budgetMs: number) => Promise<CellOutcome>,
 *   interrupt: () => void,
 *   chunk: (rid: number, text: string) => void,
 *   exited: (rid: number, result: Record<string, unknown>) => void,
 *   stop: () => void,
 * }} Kernel
 *   lib: the modules of the project's REPL library (.repl/lib) the kernel loaded, and those it could not, by name;
 *   refused: the files of .repl/lib whose name is no JavaScript identifier, never loaded;
 *   notInstalled: .repl/package.json names packages and .repl/node_modules is absent;
 *   evaluate: runs a cell and answers when it ends or at the budget; wait: the same, for the cell
 *   already in flight; interrupt: stops the awaits of the cell in flight, and ends the kernel when
 *   the cell still does not end; chunk, exited: what a run the server started writes and how it ended.
 * @typedef {{ start: (events: KernelEvents, cwd: string, options?: { firstRid?: number }) => Promise<Kernel> }} KernelHost
 *   firstRid: the id the kernel gives its first run; ids go on across the kernels of an attempt.
 *   start: rejects when the kernel cannot start, or has not said it is ready within ten seconds.
 */
export {}
