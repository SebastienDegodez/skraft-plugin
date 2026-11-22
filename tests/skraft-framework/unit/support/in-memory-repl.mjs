// Hand-written doubles for the REPL ports: a kernel whose cells are scripted by the test, a
// launcher whose programs the test ends, and the journal of left-over processes. No mock library.

/** A program the test ends: `finish` is its exit. */
class ScriptedProgram {
  /** @param {number} pid @param {(program: ScriptedProgram) => void} onKill */
  constructor(pid, onKill) {
    this.pid = pid
    this.killed = []
    this.onKill = onKill
    this.done = new Promise((resolve) => { this.end = resolve })
  }
  kill(signal = 'SIGTERM', graceMs = 0) {
    this.killed.push([signal, graceMs])
    this.onKill(this)
  }
  /** @param {{ exitCode?: number | null, text?: string, timedOut?: boolean, killed?: boolean, signal?: string | null, started?: boolean }} [result] */
  finish({ exitCode = 0, text = '', timedOut = false, killed = false, signal = null, started = true } = {}) {
    this.end({ started, exitCode, signal, timedOut, killed, text, cut: false, bytes: text.length, error: null })
  }
}

/**
 * Programs the test controls. A program ends by itself with `outputs[command]` when the command is
 * scripted there, and stays running otherwise.
 */
export class ScriptedLauncher {
  /** @param {{ outputs?: Record<string, { exitCode?: number, text?: string }>, refuses?: string | null }} [options] */
  constructor({ outputs = {}, refuses = null } = {}) {
    this.outputs = outputs
    this.refuses = refuses
    /** @type {Array<{ command: string | string[], cwd: string, timeoutMs: number, maxOutputBytes: number, program: ScriptedProgram }>} */
    this.started = []
  }
  async start({ command, cwd, timeoutMs, maxOutputBytes, onData }) {
    if (this.refuses !== null) return { ok: false, reason: this.refuses }
    const program = new ScriptedProgram(5000 + this.started.length, (one) => one.finish({ exitCode: null, killed: true, signal: 'SIGTERM' }))
    this.started.push({ command, cwd, timeoutMs, maxOutputBytes, program })
    const scripted = this.outputs[Array.isArray(command) ? command.join(' ') : command]
    if (scripted !== undefined) {
      onData(scripted.text ?? '')
      program.finish(scripted)
    }
    return { ok: true, argv: Array.isArray(command) ? command : ['sh', '-c', command], shell: Array.isArray(command) ? null : 'sh', cwd, program }
  }
}

/** One kernel: the test says what each cell does by its code. */
class ScriptedKernel {
  /** @param {import('../../../../plugins/skraft-framework/engine/application/ports/kernel-host.mjs').KernelEvents} events @param {number} pid */
  constructor(events, pid) {
    this.events = events
    this.pid = pid
    this.stopped = false
    this.interrupts = 0
    /** @type {Map<string, (cell: { run: Function, print: (text: string) => void, id: number }) => Promise<string | null>>} */
    this.script = new Map()
    this.cells = 0
    this.exits = new Map()
    this.flying = null
    this.chunks = []
  }
  /** @param {string} code @param {(cell: any) => Promise<string | null>} behaviour */
  on(code, behaviour) { this.script.set(code, behaviour); return this }
  async evaluate(code, budgetMs) {
    if (this.flying !== null) return { status: 'busy', printed: '', value: null, error: null }
    this.cells += 1
    const printed = []
    const run = (command, options = {}) => this.ask({ cell: this.cells, command, cwd: options.cwd ?? '.', timeout: options.timeout ?? 600, gate: options.gate ?? null, label: options.label ?? null, options: Object.keys(options) })
    const work = (this.script.get(code) ?? (async () => null))({ run, print: (text) => printed.push(text), id: this.cells })
    const restarted = new Promise((resolve) => { this.restartCell = () => resolve({ status: 'restarted', printed: printed.join(''), value: null, error: null }) })
    const ended = work.then((value) => ({ status: 'done', printed: printed.join(''), value, error: null }), (error) => ({ status: 'error', printed: printed.join(''), value: null, error: error.message }))
    return this.within(Promise.race([ended, restarted]), printed, budgetMs)
  }
  async wait(budgetMs) {
    if (this.flying === null) return this.left ?? { status: 'done', printed: '', value: null, error: null }
    return this.within(this.flying, [], budgetMs)
  }
  within(settled, printed, budgetMs) {
    this.left = null
    this.flying = settled.then((outcome) => { this.flying = null; return outcome })
    return Promise.race([this.flying, new Promise((resolve) => setTimeout(() => { settled.then((outcome) => { this.left = { ...outcome, printed: '' } }); resolve({ status: 'running', printed: printed.join(''), value: null, error: null }) }, budgetMs))])
  }
  ask(request) {
    const rid = (this.nextRid = (this.nextRid ?? 0) + 1)
    const exited = new Promise((resolve) => this.exits.set(rid, resolve))
    this.events.onRun({ rid, ...request })
    return exited
  }
  /** A kernel that restarts on interrupt behaves as the real one whose cell will not stop. */
  interrupt() {
    this.interrupts += 1
    if (!this.restartsOnInterrupt || this.flying === null) return
    this.restartCell()
    this.die('restarted')
  }
  chunk(rid, text) { this.chunks.push([rid, text]) }
  exited(rid, result) { this.exits.get(rid)?.(result) }
  stop() { this.stopped = true }
  /** The kernel dies on its own. @param {'restarted' | 'crashed'} why */
  die(why) { this.events.onGone(why) }
}

/** The kernels the REPL starts, one per attempt, each scripted by the test. */
export class ScriptedKernelHost {
  /** @param {{ fails?: boolean, restartsOnInterrupt?: boolean, lib?: { loaded: string[], failed: string[] } }} [options] restartsOnInterrupt: a cell interrupted never stops, and its kernel is restarted; lib: what each kernel says it loaded of the project's REPL library */
  constructor({ fails = false, restartsOnInterrupt = false, lib = { loaded: [], failed: [] } } = {}) {
    this.lib = lib
    this.fails = fails
    this.restartsOnInterrupt = restartsOnInterrupt
    /** @type {ScriptedKernel[]} */
    this.kernels = []
    /** Cell behaviours every kernel starts with, by code. @type {Map<string, Function>} */
    this.script = new Map()
  }
  async start(events, _cwd, { firstRid = 1 } = {}) {
    if (this.fails) throw new Error('no kernel')
    const kernel = new ScriptedKernel(events, 4000 + this.kernels.length)
    kernel.nextRid = firstRid - 1
    kernel.restartsOnInterrupt = this.restartsOnInterrupt
    kernel.lib = this.lib
    for (const [code, behaviour] of this.script) kernel.on(code, behaviour)
    this.kernels.push(kernel)
    return kernel
  }
}

/** The journal of left-over processes, in memory: what is kept, what was reaped. */
export class InMemoryOrphans {
  constructor({ holderGone = true } = {}) {
    this.holderGone = holderGone
    /** @type {Array<object>} */
    this.kept = []
    this.forgotten = []
    this.reaps = 0
  }
  async keep(entry) { this.kept.push(entry) }
  async forget(serverPid) { this.forgotten.push(serverPid) }
  async reap() { this.reaps += 1; return 0 }
  track(pid) { return { pid, created: `started-${pid}` } }
  gone() { return this.holderGone }
}

/** The digests of runs' logs, on the hasher the test gives: the text is kept and hashed at the end. */
export class HasherDigests {
  /** @param {{ sha256: (text: string) => Promise<string> }} hasher */
  constructor(hasher) { this.hasher = hasher }
  start() {
    const parts = []
    return { update: (text) => { parts.push(text) }, digest: () => this.hasher.sha256(parts.join('')) }
  }
}
