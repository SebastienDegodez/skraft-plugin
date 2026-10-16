import { readFileSync } from 'node:fs'

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
  async list(slug, folder) {
    const prefix = this.key(slug, `${folder}/`)
    return [...this.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(slug.length + 1)).sort()
  }

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
  /** @param {string} name a file name, as the plugin's templates folder needs one */
  async read(name) {
    if (typeof name !== 'string') throw new TypeError(`a template name is a file name, got ${name}`)
    return this.templates[name] ?? null
  }
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
  async head() { return null }
  async commits() { return [] }
}

/** Whether `path` is `folder` or under it; both relative to the same place, `.`-free. */
const under = (path, folder) => folder === '' || path === folder || path.startsWith(`${folder}/`)
const inside = (path, folder) => (folder === '' ? path : path.slice(folder.length + 1))

/**
 * Git repositories that change while the run goes: each has its commits and its uncommitted
 * files. Paths the helpers take are relative to the working copy; `.` is the working copy's
 * own repository, `../web` a neighbour one.
 */
export class InMemoryGit {
  /**
   * @param {{ repositories?: Record<string, { mergeBases?: Record<string, string> }>, unavailable?: string | null }} [options]
   *   every repository starts with one commit, `<top>-0`, which its merge bases usually name
   */
  constructor({ repositories = { '.': { mergeBases: { main: 'root-0' } } }, unavailable = null } = {}) {
    this.missing = unavailable
    /** @type {Map<string, { mergeBases: Record<string, string>, history: Array<{ sha: string, subject: string, files: string[] }>, dirty: Set<string> }>} */
    this.repositories = new Map(Object.entries(repositories).map(([top, { mergeBases = {} }]) => {
      const key = tidy(top)
      return [key, { mergeBases, history: [{ sha: `${shaPrefix(key)}-0`, subject: 'initial', files: [] }], dirty: new Set() }]
    }))
  }
  /** The repository holding a working-copy path, and the path inside it. */
  locate(path) {
    const file = tidy(path)
    const top = [...this.repositories.keys()].filter((key) => under(file, key)).sort((a, b) => b.length - a.length)[0]
    return top === undefined ? null : { top, repo: this.repositories.get(top), inner: inside(file, top) }
  }
  /** Files written and left uncommitted. @param {...string} paths */
  change(...paths) {
    for (const path of paths) {
      const at = this.locate(path)
      at.repo.dirty.add(at.inner)
    }
  }
  /** Uncommitted changes undone. @param {...string} paths */
  revert(...paths) {
    for (const path of paths) {
      const at = this.locate(path)
      at.repo.dirty.delete(at.inner)
    }
  }
  /** A commit of these files, all in one repository; returns its sha. @param {string} subject @param {string[]} paths */
  commit(subject, paths) {
    const at = this.locate(paths[0] ?? '.')
    const files = paths.map((path) => this.locate(path).inner)
    for (const file of files) at.repo.dirty.delete(file)
    const sha = `${shaPrefix(at.top)}-${at.repo.history.length}`
    at.repo.history.push({ sha, subject, files })
    return sha
  }
  async unavailable() { return this.missing }
  async repository(dir) {
    const at = this.locate(dir)
    return at === null ? null : at.top === '' ? '.' : at.top
  }
  async mergeBase(dir, ref) { return this.locate(dir)?.repo.mergeBases[ref] ?? null }
  async head(dir) { return this.locate(dir)?.repo.history.at(-1).sha ?? null }
  async commits(dir, since) {
    const at = this.locate(dir)
    const from = at?.repo.history.findIndex((commit) => commit.sha === since) ?? -1
    if (from < 0) return null
    return at.repo.history.slice(from + 1).map(({ sha, subject, files }) => ({
      sha, subject, files: files.filter((file) => under(file, at.inner)).map((file) => inside(file, at.inner)),
    }))
  }
  async changedFiles(dir, sha) {
    const commits = await this.commits(dir, sha)
    if (commits === null) return null
    const at = this.locate(dir)
    const dirty = [...at.repo.dirty].filter((file) => under(file, at.inner)).map((file) => inside(file, at.inner))
    return [...new Set([...commits.flatMap((commit) => commit.files), ...dirty])]
  }
}
const shaPrefix = (top) => (top === '' ? 'root' : top.replaceAll('../', 'up-').replaceAll('/', '-'))

/**
 * Commits replayed in a throwaway checkout: the test command exits 1 (the red test fails)
 * unless `exits` names another code for that commit; null stands for a program that could not
 * start. The clock advances by takesMs per replay.
 */
export class ScriptedReplay {
  /** @param {{ exits?: Record<string, number | null>, clock?: FixedClock | null, takesMs?: number }} [options] */
  constructor({ exits = {}, clock = null, takesMs = 0 } = {}) {
    this.exits = exits
    this.clock = clock
    this.takesMs = takesMs
    /** @type {Array<{ repository: string, sha: string, cwd: string, argv: string[] }>} */
    this.replays = []
  }
  async run(request) {
    this.replays.push(request)
    this.clock?.advance(this.takesMs)
    const exitCode = request.sha in this.exits ? this.exits[request.sha] : 1
    if (exitCode === null) return { started: false, exitCode: null, stdout: '', stderr: '', error: `command not found: ${request.argv[0]}` }
    return { started: true, exitCode, stdout: `${request.argv.join(' ')} at ${request.sha}\n`, stderr: '' }
  }
  /** The replays, as `'<sha> <repository>/<cwd> $ <argv>'`. */
  lines() { return this.replays.map(({ sha, repository, cwd, argv }) => `${sha} ${repository}/${cwd} $ ${argv.join(' ')}`) }
}

/** Agents by where they come from; the plugin ships the pipeline's own by default. */
export class InMemoryAgentCatalog {
  /** @param {{ plugin?: string[], repository?: string[] }} [agents] */
  constructor({ plugin = ['solution-researcher', 'solution-architect', 'acceptance-designer', 'software-engineer'], repository = [] } = {}) {
    this.plugin = new Set(plugin)
    this.repository = new Set(repository)
  }
  async locate(agent) { return this.plugin.has(agent) ? 'plugin' : this.repository.has(agent) ? 'repository' : null }
}

/** The plugin's own `workflows/skraft.dot`, read once: the default every test runs. */
export const BUILT_IN_WORKFLOW = readFileSync(new URL('../../../../plugins/skraft-framework/workflows/skraft.dot', import.meta.url), 'utf8')

export class InMemoryWorkflowSource {
  /** @param {string} [text] */
  constructor(text = BUILT_IN_WORKFLOW) { this.text = text }
  async builtIn() { return this.text }
}

/**
 * The machine the commands run on: which programs are installed, and how a command line
 * exits (`'<cwd> $ <argv joined by spaces>'` → exit code). Everything else exits 0.
 * It is both the CommandRunner and the Executables port. A program written with a `/`
 * (`.venv/bin/python`) is installed as a path relative to the working copy
 * (`services/py/.venv/bin/python`) and found from the folder it starts in.
 */
export class ScriptedMachine {
  /**
   * @param {{ installed?: string[], exits?: Record<string, number | null>, clock?: FixedClock, takesMs?: number, meanwhile?: Record<string, () => Promise<void> | void> }} [options]
   *   exits: null for a program stopped before it exited; clock advances by takesMs per run;
   *   meanwhile: what happens elsewhere on the machine while that command line runs
   */
  constructor({ installed = ['git', 'docker', 'dotnet', 'npm', 'npx', 'mvn', 'python'], exits = {}, clock = null, takesMs = 0, meanwhile = {} } = {}) {
    this.installed = new Set(installed)
    this.exits = exits
    this.clock = clock
    this.takesMs = takesMs
    this.meanwhile = meanwhile
    /** @type {Array<{ argv: string[], cwd: string }>} */
    this.runs = []
  }
  /** @param {string} program @param {string} cwd */
  installedAt(program, cwd) {
    if (!program.includes('/')) return this.installed.has(program) ? `/usr/local/bin/${program}` : null
    const path = tidy(`${cwd}/${program}`)
    return this.installed.has(path) ? `/work/${path}` : null
  }
  async locate(program, cwd = '.') { return this.installedAt(program, cwd) }
  async run({ argv, cwd }) {
    this.runs.push({ argv, cwd })
    if (this.installedAt(argv[0], cwd) === null) return { started: false, exitCode: null, stdout: '', stderr: '', error: `command not found: ${argv[0]}` }
    this.clock?.advance(this.takesMs)
    const line = `${cwd} $ ${argv.join(' ')}`
    await this.meanwhile[line]?.()
    if (this.exits[line] === null) return { started: true, exitCode: null, stdout: '', stderr: '', error: `${argv[0]} was stopped by SIGKILL` }
    const exitCode = this.exits[line] ?? 0
    return { started: true, exitCode, stdout: `${argv.join(' ')} output\n`, stderr: exitCode === 0 ? '' : 'it failed\n' }
  }
  /** The command lines run, as `'<cwd> $ <argv>'`. */
  lines() { return this.runs.map(({ argv, cwd }) => `${cwd} $ ${argv.join(' ')}`) }
}

/**
 * Every dependency a use case takes, over the doubles above; a test names only the ones it
 * looks at. config: the text of skraft-config.json, no file when undefined; now: the clock.
 */
export const inMemoryDeps = ({ tracking = new InMemoryTracking(), config, now = '2026-10-15T08:00:00.000Z', ...given } = {}) => ({
  journal: tracking,
  activePipeline: tracking,
  files: tracking,
  workspace: new InMemoryWorkspace(config === undefined ? {} : { 'skraft-config.json': config }),
  sourceControl: new InMemorySourceControl(),
  commandRunner: new ScriptedMachine(),
  templates: new InMemoryTemplates({}),
  clock: new FixedClock(now),
  hasher: new FakeHasher(),
  agentRunner: new ScriptedAgentRunner(),
  progress: new RecordingProgress(),
  workflowSource: new InMemoryWorkflowSource(),
  agentCatalog: new InMemoryAgentCatalog(),
  ...given,
})
