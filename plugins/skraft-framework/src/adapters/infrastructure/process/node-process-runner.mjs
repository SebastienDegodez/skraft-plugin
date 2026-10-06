import { spawn } from 'node:child_process'

// A process runner for Node hosts: runProcess(argv, { timeoutMs, stdin }) =>
// { exitCode, stdout, stderr }. argv[0] 'node' means this Node. Never rejects: a
// command that cannot start is exit 127, a timeout 124. Used by the cli-* adapters.
export const createNodeProcessRunner = ({ cwd, signal } = {}) => (argv, { timeoutMs = 600_000, stdin } = {}) =>
  new Promise((resolve) => {
    const [command, ...args] = argv[0] === 'node' ? [process.execPath, ...argv.slice(1)] : argv
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    const done = (result) => { if (!settled) { settled = true; resolve(result) } }
    const child = spawn(command, args, { cwd, signal, stdio: ['pipe', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => { clearTimeout(timer); done({ exitCode: 127, stdout, stderr: `${stderr}${error.message}` }) })
    child.on('close', (code) => { clearTimeout(timer); done({ exitCode: timedOut ? 124 : (code ?? 1), stdout, stderr }) })
    child.stdin.on('error', () => {})
    child.stdin.end(stdin ?? '')
  })
