/**
 * CommandRunner — starts one program with an argv, never through a shell, and waits for it.
 *
 * @typedef {{ argv: string[], cwd: string }} CommandRequest
 *   cwd is relative to the working copy (`.`, `services/api`, `../payment-web`).
 * @typedef {{ started: boolean, exitCode: number | null, stdout: string, stderr: string, error?: string }} CommandResult
 *   started: false when the program could not be started (not found, not executable); error says why.
 *   exitCode null with started: the program was stopped (signal, timeout); error says how.
 * @typedef {{ run: (request: CommandRequest) => Promise<CommandResult> }} CommandRunner
 */
export {}
