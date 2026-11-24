/**
 * ProgramLauncher — starts the programs an agent's REPL asks for, in the working copy, and ends
 * them with everything they started.
 *
 * @typedef {{
 *   started: boolean, exitCode: number | null, signal: string | null, timedOut: boolean, killed: boolean,
 *   text: string, cut: boolean, bytes: number, error: string | null,
 * }} ProgramResult
 *   text: the output kept, stdout and stderr in the order they arrived; error: a fixed text, set only when it did not start.
 * @typedef {{ pid: number | null, done: Promise<ProgramResult>, kill: (signal?: string, graceMs?: number) => void }} Program
 * @typedef {{ command: string | string[], cwd: string, timeoutMs: number, onData: (text: string) => void }} LaunchRequest
 *   onData: every output of the program, as it arrives; the launcher keeps none of it (its result's text is empty).
 *   command: an argv array starts with no shell; a string runs through the machine's shell (`sh -c`;
 *   Git Bash, else PowerShell, under Windows). cwd: relative to the working copy, never leaving it.
 * @typedef {{ ok: true, argv: string[], shell: string | null, cwd: string, program: Program } | { ok: false, reason: string }} Launched
 *   argv: what was actually started; shell: which shell ran a string, null for an argv array; cwd: the folder
 *   it started in, relative to the working copy, with / between its parts (. for the working copy).
 * @typedef {{ start: (request: LaunchRequest) => Promise<Launched> }} ProgramLauncher
 */
export {}
