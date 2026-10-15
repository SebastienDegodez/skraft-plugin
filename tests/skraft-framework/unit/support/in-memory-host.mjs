// Hand-written doubles for the engine ports. No mock library: each double is a small
// working implementation over plain JavaScript values.

/** Tracking folder in memory: the journal store, the active pipeline and the phase files. */
export class InMemoryTracking {
  constructor({ root = '/work/.copilot-tracking/skraft-plans' } = {}) {
    this.root = root
    /** @type {Map<string, string>} slug-relative path → text */
    this.files = new Map()
    this.activeSlug = null
  }

  /** @param {string} slug @param {string} rel */
  key(slug, rel) { return `${slug}/${rel}` }

  // RunJournalStore
  async lines(slug) {
    const text = this.files.get(this.key(slug, 'events.jsonl'))
    return text ? text.split('\n').filter((line) => line !== '') : []
  }
  async append(slug, line) {
    const key = this.key(slug, 'events.jsonl')
    this.files.set(key, `${this.files.get(key) ?? ''}${line}\n`)
  }

  // ActivePipeline
  async current() { return this.activeSlug }
  async activate(slug) { this.activeSlug = slug }

  // TrackingFiles
  async read(slug, rel) { return this.files.get(this.key(slug, rel)) ?? null }
  async write(slug, rel, text) { this.files.set(this.key(slug, rel), text) }
  location(slug, rel) { return `${this.root}/${slug}/${rel}` }

  /** Test helpers */
  journal(slug) { return (this.files.get(this.key(slug, 'events.jsonl')) ?? '').split('\n').filter(Boolean).map((line) => JSON.parse(line)) }
  rewriteJournal(slug, edit) {
    const lines = this.files.get(this.key(slug, 'events.jsonl')).split('\n').filter(Boolean)
    this.files.set(this.key(slug, 'events.jsonl'), `${edit(lines).join('\n')}\n`)
  }
}

export class InMemoryTemplates {
  /** @param {Record<string, string>} templates */
  constructor(templates) { this.templates = templates }
  async read(name) { return this.templates[name] ?? null }
}

export class FixedClock {
  /** @param {string} iso */
  constructor(iso) { this.at = new Date(iso) }
  now() { return new Date(this.at) }
  advance(ms) { this.at = new Date(this.at.getTime() + ms) }
}

/** Deterministic, collision-poor string hash (djb2 over UTF-16 units, twice) standing for SHA-256. */
export class FakeHasher {
  async sha256(text) {
    let a = 5381
    let b = 52711
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index)
      a = ((a * 33) ^ code) >>> 0
      b = ((b * 31) ^ code) >>> 0
    }
    return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`
  }
}

/**
 * The simulated LLM: each dispatch runs the next scripted behaviour, which may write
 * files through the tracking double, then answers like an agent.
 */
export class ScriptedAgentRunner {
  /** @param {Array<(dispatch: {agent: string, label: string, prompt: string}) => Promise<object|void>|object|void>} behaviours */
  constructor(behaviours = []) {
    this.behaviours = [...behaviours]
    /** @type {Array<{agent: string, label: string, prompt: string}>} */
    this.dispatches = []
  }
  async run(dispatch) {
    this.dispatches.push(dispatch)
    const behaviour = this.behaviours.shift()
    if (!behaviour) throw new Error(`unexpected dispatch ${dispatch.label}`)
    return (await behaviour(dispatch)) ?? { ok: true, text: 'done' }
  }
}

export class RecordingProgress {
  constructor() { this.lines = [] }
  phase(phase) { this.lines.push(`phase ${phase}`) }
  log(message) { this.lines.push(message) }
}

/** `/`-separated, no `./`, `..` resolved: the keys the workspace double files by. */
const tidy = (path) => {
  const parts = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..' && parts.length > 0 && parts.at(-1) !== '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

/** The working copy and its neighbours: files by path relative to the working copy. */
export class InMemoryWorkspace {
  /** @param {Record<string, string>} files e.g. { 'api/Payment.sln': '', '../web/package.json': '{}' } */
  constructor(files = {}) {
    this.files = new Map(Object.entries(files).map(([path, text]) => [tidy(path), text]))
  }
  async read(path) { return this.files.get(tidy(path)) ?? null }
  async write(path, text) { this.files.set(tidy(path), text) }
  async list(path) {
    const dir = tidy(path)
    const prefix = dir === '' ? '' : `${dir}/`
    const entries = new Map()
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix) || key === dir) continue
      const [name, ...rest] = key.slice(prefix.length).split('/')
      if (name === '..') continue
      entries.set(name, rest.length > 0 ? 'dir' : entries.get(name) ?? 'file')
    }
    if (entries.size === 0 && dir !== '') return null
    return [...entries].map(([name, kind]) => ({ name, kind }))
  }
  config() { return JSON.parse(this.files.get('skraft-config.json')) }
}

/**
 * Git facts by folder (relative to the working copy): the repository top, merge bases by ref,
 * and the files changed since the base, relative to that folder.
 */
export class InMemorySourceControl {
  /**
   * @param {Record<string, { top?: string, mergeBases?: Record<string, string>, changed?: string[] | null }>} folders
   * @param {{ unavailable?: string | null }} [options] unavailable: why Git cannot run here, null when it can
   */
  constructor(folders = {}, { unavailable = null } = {}) {
    this.folders = folders
    this.missing = unavailable
    /** @type {Array<{ dir: string, sha: string }>} */
    this.diffs = []
  }
  async unavailable() { return this.missing }
  async repository(dir) { return this.folders[tidy(dir) || '.']?.top ?? null }
  async mergeBase(dir, ref) { return this.folders[tidy(dir) || '.']?.mergeBases?.[ref] ?? null }
  async changedFiles(dir, sha) {
    this.diffs.push({ dir, sha })
    const changed = this.folders[tidy(dir) || '.']?.changed
    return changed === undefined ? [] : changed
  }
}

/**
 * The machine the commands run on: which programs are installed, and how a command line
 * exits (`'<cwd> $ <argv joined by spaces>'` → exit code). Everything else exits 0.
 * It is both the CommandRunner and the Executables port.
 */
export class ScriptedMachine {
  /**
   * @param {{ installed?: string[], exits?: Record<string, number | null>, clock?: FixedClock, takesMs?: number }} [options]
   *   exits: null for a program stopped before it exited; clock advances by takesMs per run
   */
  constructor({ installed = ['git', 'docker', 'dotnet', 'npm', 'npx', 'mvn', 'python'], exits = {}, clock = null, takesMs = 0 } = {}) {
    this.installed = new Set(installed)
    this.exits = exits
    this.clock = clock
    this.takesMs = takesMs
    /** @type {Array<{ argv: string[], cwd: string }>} */
    this.runs = []
  }
  async locate(program) { return this.installed.has(program) ? `/usr/local/bin/${program}` : null }
  async run({ argv, cwd }) {
    this.runs.push({ argv, cwd })
    if (!this.installed.has(argv[0])) return { started: false, exitCode: null, stdout: '', stderr: '', error: `command not found: ${argv[0]}` }
    this.clock?.advance(this.takesMs)
    const line = `${cwd} $ ${argv.join(' ')}`
    if (this.exits[line] === null) return { started: true, exitCode: null, stdout: '', stderr: '', error: `${argv[0]} was stopped by SIGKILL` }
    const exitCode = this.exits[line] ?? 0
    return { started: true, exitCode, stdout: `${argv.join(' ')} output\n`, stderr: exitCode === 0 ? '' : 'it failed\n' }
  }
  /** The command lines run, as `'<cwd> $ <argv>'`. */
  lines() { return this.runs.map(({ argv, cwd }) => `${cwd} $ ${argv.join(' ')}`) }
}
