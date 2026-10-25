/**
 * CommandRunner — starts one program with an argv, never through a shell, and waits for it.
 *
 * @typedef {{ argv: string[], cwd: string, env?: Readonly<Record<string, string>> }} CommandRequest
 *   cwd is relative to the working copy (`.`, `services/api`, `../payment-web`). env: variables
 *   added to the program's environment; a host that cannot set them (the Claude Code mod) leaves
 *   them out.
 * @typedef {{ started: boolean, exitCode: number | null, stdout: string, stderr: string, error?: string }} CommandResult
 *   started: false when the program could not be started (not found, not executable);
 *   exitCode null with started: the program was stopped (signal, timeout). In both cases, and
 *   only then, error says why.
 * @typedef {{ run: (request: CommandRequest) => Promise<CommandResult> }} CommandRunner
 */
export {}
