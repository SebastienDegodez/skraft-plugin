import { readFileSync } from 'node:fs'
import { answerYaml } from './answer-yaml.mjs'

// Hand-written doubles for the engine ports. No mock library: each double is a small
// working implementation over plain JavaScript values.

/** Tracking folder in memory: the journal store, the active pipeline and the phase files. */
export class InMemoryTracking {
  constructor({ root = '/work/.copilot-tracking/skraft-plans' } = {}) {
    this.root = root
    /** @type {Map<string, string>} slug-relative path → text */
    this.files = new Map()
    this.activeSlug = null
    /** The journal keys of the machine this working copy is on. */
    this.journalKeys = new InMemoryJournalKeys()
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
    const prefix = folder === '' || folder === '.' ? `${slug}/` : this.key(slug, `${folder}/`)
    return [...this.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(slug.length + 1)).sort()
  }
  async pipelines() { return [...new Set([...this.files.keys()].map((key) => key.split('/')[0]))].sort() }

  /** Test helpers */
  journal(slug) { return (this.files.get(this.key(slug, 'events.jsonl')) ?? '').split('\n').filter(Boolean).map((line) => JSON.parse(line)) }
  rewriteJournal(slug, edit) {
    const lines = this.files.get(this.key(slug, 'events.jsonl')).split('\n').filter(Boolean)
    this.files.set(this.key(slug, 'events.jsonl'), `${edit(lines).join('\n')}\n`)
  }
}

/**
 * `<slug>/.lock` in the tracking double, as one session sees it: created only when absent,
 * replaced only while it holds what that session saw. A replace frees the path for a moment, as
 * the rename aside does on disk: `inGap` is what another session does then; a renew never does.
 */
export class InMemoryRunLock {
  /** @param {InMemoryTracking} tracking @param {string} [owner] */
  constructor(tracking, owner = 'session-a') {
    this.tracking = tracking
    this.owner = owner
    /** @type {((slug: string) => void) | null} */
    this.inGap = null
  }
  async read(slug) { return this.held(slug) }
  held(slug) { return this.tracking.files.get(this.tracking.key(slug, '.lock')) ?? null }
  async create(slug, text) {
    if (this.held(slug) !== null) return false
    this.tracking.files.set(this.tracking.key(slug, '.lock'), text)
    return true
  }
  async renew(slug, seen, text) {
    if (this.held(slug) !== seen) return false
    this.tracking.files.set(this.tracking.key(slug, '.lock'), text)
    return true
  }
  async replace(slug, seen, text) {
    if (this.held(slug) === null || this.held(slug) !== seen) return false
    this.tracking.files.delete(this.tracking.key(slug, '.lock'))
    this.inGap?.(slug)
    if (text === null) return true
    return this.create(slug, text)
  }
}

/**
 * A timer the test runs by hand: `tick()` calls every function still registered, once; bound
 * to a clock, it also ticks each time that clock advances awake.
 */
export class ManualTimer {
  /** @param {FixedClock} [clock] */
  constructor(clock) {
    /** @type {Array<{ ms: number, run: () => Promise<void> }>} */
    this.entries = []
    /** One tick after the other, as an interval never overlaps itself. */
    this.ticking = Promise.resolve()
    clock?.awake.push(() => this.tick())
  }
  every(ms, run) {
    const entry = { ms, run }
    this.entries.push(entry)
    return () => { this.entries = this.entries.filter((other) => other !== entry) }
  }
  tick() {
    this.ticking = this.ticking.then(async () => { for (const { run } of [...this.entries]) await run() })
    return this.ticking
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
  constructor(iso) {
    this.at = new Date(iso)
    /** @type {Array<() => Promise<void>>} what runs when time passes with the machine awake (timers) */
    this.awake = []
  }
  now() { return new Date(this.at) }
  /** Time passes at once, the machine awake: the timers bound to this clock run, once. */
  advance(ms) {
    this.sleep(ms)
    for (const run of this.awake) void run()
  }
  /**
   * Time passes the way it does while a long command runs, the machine awake: the timers bound
   * to this clock run every 30 s of it, each seeing its own time.
   */
  async pass(ms) {
    for (let left = ms; left > 0; left -= 30_000) {
      this.sleep(Math.min(left, 30_000))
      for (const run of this.awake) await run()
    }
  }
  /** Time passes, the machine asleep: no timer runs. */
  sleep(ms) { this.at = new Date(this.at.getTime() + ms) }
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
  /** Stands for HMAC-SHA-256: the fake hash of the key and the text together. */
  async hmacSha256(key, text) { return this.sha256(`${key}\u0000${text}`) }
}

/**
 * The machine's journal keys outside the working copy: ids of 32 hex digits, in creation order.
 * Share one between two hosts for the same machine; a fresh one is another machine.
 */
export class InMemoryJournalKeys {
  constructor() {
    /** @type {Map<string, string>} */
    this.keys = new Map()
  }
  async create() {
    const id = String(this.keys.size + 1).padStart(32, '0')
    const key = `${'ab'.repeat(15)}${String(this.keys.size + 1).padStart(2, '0')}`
    this.keys.set(id, key)
    return { id, key }
  }
  async read(id) { return this.keys.get(id) ?? null }
  async available() { return true }
}

/** What a lens answers when the test scripts nothing for it: it passes. */
export const passing = (dispatch) => answerYaml({ lens: dispatch.agent.replace(/-lens$/, ''), verdict: 'pass', findings: [] })

/**
 * The simulated LLM: each dispatch runs the next scripted behaviour, which may write
 * files through the tracking double, then answers like an agent. Lenses and the refuter,
 * dispatched together, are answered by `review`: every lens passes and every finding is
 * confirmed unless a test replaces it.
 */
export class ScriptedAgentRunner {
  /** @param {Array<(dispatch: {agent: string, label: string, prompt: string}) => Promise<object|void>|object|void>} behaviours */
  constructor(behaviours = []) {
    this.behaviours = [...behaviours]
    /** @type {'claude-code' | 'copilot'} the host whose models the agents run on */
    this.host = 'claude-code'
    /** @type {Array<{agent: string, label: string, prompt: string}>} */
    this.dispatches = []
    /** @type {Array<Array<{agent: string, label: string, prompt: string}>>} */
    this.batches = []
    /** @type {(dispatch: {agent: string, label: string, prompt: string}) => Promise<object|string>|object|string} */
    this.review = (dispatch) => (dispatch.agent === 'finding-refuter' ? answerYaml({ verdict: 'confirmed', reason: 'the patch shows it' }) : passing(dispatch))
    /** @type {number | undefined} what each batch costs, beside what each answer says */
    this.batchCostUsd = undefined
    /** @type {((dispatch: {agent: string, label: string, prompt: string}) => Promise<object|void>) | null} what answers a pr-writer, apart from the queue */
    this.writer = null
  }
  async run(dispatch) {
    this.dispatches.push(dispatch)
    if (dispatch.agent === 'pr-writer' && this.writer !== null) return (await this.writer(dispatch)) ?? { ok: true, text: 'done' }
    const behaviour = this.behaviours.shift()
    if (!behaviour) throw new Error(`unexpected dispatch ${dispatch.label}`)
    return (await behaviour(dispatch)) ?? { ok: true, text: 'done' }
  }
  async runMany(dispatches) {
    this.batches.push(dispatches)
    const answers = []
    for (const dispatch of dispatches) {
      const answer = await this.review(dispatch)
      answers.push(typeof answer === 'string' ? { ok: true, text: answer } : answer)
    }
    return this.batchCostUsd === undefined ? { answers } : { answers, costUsd: this.batchCostUsd }
  }
  /** Every lens and refuter dispatch, batch after batch. */
  reviewed() { return this.batches.flat() }
}

/**
 * The human at the host: each question gets the next scripted answer, `{ answer, reason }`,
 * or null (dismissed, nobody there), or what a function of the question returns once it did
 * what the human does first (fix the machine); once the script runs out, every question gets null.
 */
export class ScriptedHuman {
  /** @param {Array<{ answer: string, reason?: string | null } | null>} answers */
  constructor(answers = []) {
    this.answers = [...answers]
    /** @type {Array<{ key: string, kind: string, text: string, options: string[], refusals: string[], header: string }>} */
    this.questions = []
    /** @type {string[]} what the engine put in front of the human, in order */
    this.shown = []
  }
  async show(view) { this.shown.push(view) }
  async ask(question) {
    this.questions.push(question)
    const scripted = this.answers.shift() ?? null
    const next = typeof scripted === 'function' ? await scripted(question) : scripted
    return next === null ? null : { answer: next.answer, reason: next.reason ?? null }
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

/**
 * The working copy and its neighbours: files by path relative to the working copy. unlistable:
 * the folders the machine cannot list, by path, with why; listing one rejects.
 */
export class InMemoryWorkspace {
  /** @param {Record<string, string>} files e.g. { 'api/Payment.sln': '', '../web/package.json': '{}' } */
  constructor(files = {}) {
    this.files = new Map(Object.entries(files).map(([path, text]) => [tidy(path), text]))
    /** @type {Map<string, string>} */
    this.unlistable = new Map()
    /** @type {Array<[string, string]>} each file replaced in one rename, with its new text, in order */
    this.replaced = []
  }
  async read(path) { return this.files.get(tidy(path)) ?? null }
  async write(path, text) { this.files.set(tidy(path), text) }
  async replace(path, text) {
    this.replaced.push([tidy(path), text])
    this.files.set(tidy(path), text)
  }
  async list(path) {
    const dir = tidy(path)
    if (this.unlistable.has(dir)) throw new Error(this.unlistable.get(dir))
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

/** The developer's own `~/.skraft/config.json`: its text, none when undefined. */
/**
 * What the hosts set for their agents outside skraft: CLAUDE_CODE_EFFORT_LEVEL, and the agents
 * `subagents.agents` of ~/.copilot/settings.json names, as the file spells them.
 */
export class InMemoryHostSettings {
  /** @param {{ claudeCodeEffort?: string | null, copilotAgents?: string[] }} [settings] */
  constructor({ claudeCodeEffort = null, copilotAgents = [] } = {}) { this.settings = { claudeCodeEffort, copilotAgents } }
  async read() { return this.settings }
}

/** The Copilot SDK of the machine: where it is, or where it was looked for. */
export class InMemoryCopilotSdk {
  /** @param {import('../../../../plugins/skraft-framework/engine/application/ports/copilot-sdk.mjs').CopilotSdkLocation} [location] */
  constructor(location = { found: false, looked: '/home/dev/.copilot/pkg' }) { this.location = location }
  async locate() { return this.location }
}

export class InMemoryUserSettings {
  /** @param {string | undefined} [text] */
  constructor(text) { this.text = text ?? null }
  async read() { return this.text }
  /** @param {string} text */
  async write(text) { this.text = text }
  /** The file as JSON. */
  json() { return JSON.parse(this.text) }
}

/** The working copy's remote unless a test names another: the repository the code host doubles name. */
export const GITHUB_REMOTE = 'https://github.com/acme/shop.git'

/**
 * Git facts by folder (relative to the working copy): the repository top, merge bases by ref,
 * and the files changed since the base, relative to that folder.
 */
export class InMemorySourceControl {
  /**
   * @param {Record<string, { top?: string, mergeBases?: Record<string, string>, changed?: string[] | null }>} folders
   * @param {{ unavailable?: string | null, remote?: string | null }} [options] unavailable: why Git cannot run here, null when it can;
   *   remote: the URL of the working copy's remote, null without one
   */
  constructor(folders = {}, { unavailable = null, remote = GITHUB_REMOTE } = {}) {
    this.folders = folders
    this.missing = unavailable
    this.remote = remote
    /** @type {Array<{ dir: string, sha: string }>} */
    this.diffs = []
  }
  async unavailable() { return this.missing }
  async remoteUrl() { return this.remote }
  async repository(dir) { return this.folders[tidy(dir) || '.']?.top ?? null }
  /** The files the repository holds under dir, committed or left uncommitted, relative to dir. */
  async files(dir) {
    const at = this.locate(dir)
    if (at === null || at.repo.tracked === null) return null
    const all = [...at.repo.tracked, ...at.repo.history.flatMap((commit) => commit.files), ...at.repo.dirty]
    return [...new Set(all)].filter((file) => under(file, at.inner)).map((file) => inside(file, at.inner))
  }
  async mergeBase(dir, ref) { return this.folders[tidy(dir) || '.']?.mergeBases?.[ref] ?? null }
  /** Like Git, which takes no null in its argv, it refuses a base that is no sha. */
  async changedFiles(dir, sha) {
    if (typeof sha !== 'string') throw new TypeError(`changedFiles of ${dir} needs a sha, got ${sha}`)
    this.diffs.push({ dir, sha })
    const changed = this.folders[tidy(dir) || '.']?.changed
    return changed === undefined ? [] : changed
  }
  async head() { return null }
  async commits() { return [] }
  async diff() { return '' }
  async existsAt() { return false }
  async commitFiles() { return { ok: true } }
  async commitCopies() { return { ok: true } }
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
   * @param {{ repositories?: Record<string, { mergeBases?: Record<string, string>, tracked?: string[] | null }>, unavailable?: string | null, published?: string[], commitFails?: string | null, remote?: string | null }} [options]
   *   every repository starts with one commit, `<top>-0`, which its merge bases usually name;
   *   tracked: the files it already holds, relative to its top; null when Git cannot list them;
   *   published: the files that first commit holds, relative to the working copy; commitFails:
   *   why every commit the engine makes fails, null when it succeeds; remote: the URL of the
   *   working copy's remote, null without one
   */
  constructor({ repositories = { '.': { mergeBases: { main: 'root-0' } } }, unavailable = null, published = [], commitFails = null, remote = GITHUB_REMOTE } = {}) {
    this.missing = unavailable
    this.remote = remote
    this.published = new Set(published.map(tidy))
    this.commitFails = commitFails
    /** @type {Array<{ dir: string, paths: string[], message: string }>} */
    this.engineCommits = []
    /** @type {Array<{ from: string, to: string }>} */
    this.copies = []
    /** The files commitCopies refuses to copy: a symbolic link, outside its folder, not a PNG. @type {string[]} */
    this.refuses = []
    /** @type {Map<string, { mergeBases: Record<string, string>, tracked: string[] | null, history: Array<{ sha: string, subject: string, body: string, files: string[] }>, dirty: Set<string> }>} */
    this.repositories = new Map(Object.entries(repositories).map(([top, { mergeBases = {}, tracked = [] }]) => {

      const key = tidy(top)
      return [key, { mergeBases, tracked, history: [{ sha: `${shaPrefix(key)}-0`, subject: 'initial', body: '', files: [] }], dirty: new Set() }]
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
  /** History rewritten: the commits after sha leave the repository holding path. @param {string} path @param {string} sha */
  reset(path, sha) {
    const { repo } = this.locate(path)
    repo.history.splice(repo.history.findIndex((commit) => commit.sha === sha) + 1)
  }
  /** Uncommitted changes undone. @param {...string} paths */
  revert(...paths) {
    for (const path of paths) {
      const at = this.locate(path)
      at.repo.dirty.delete(at.inner)
    }
  }
  /**
   * A commit of these files, all in one repository; returns its sha.
   * @param {string} subject @param {string[]} paths @param {string} [body] the message after the subject's blank line
   */
  commit(subject, paths, body = '') {
    const at = this.locate(paths[0] ?? '.')
    const files = paths.map((path) => this.locate(path).inner)
    for (const file of files) at.repo.dirty.delete(file)
    at.repo.made = (at.repo.made ?? 0) + 1
    const sha = `${shaPrefix(at.top)}-${at.repo.made}`
    at.repo.history.push({ sha, subject, body, files })
    return sha
  }
  async unavailable() { return this.missing }
  async remoteUrl() { return this.remote }
  async repository(dir) {
    const at = this.locate(dir)
    return at === null ? null : at.top === '' ? '.' : at.top
  }
  /** The files the repository holds under dir, committed or left uncommitted, relative to dir. */
  async files(dir) {
    const at = this.locate(dir)
    if (at === null || at.repo.tracked === null) return null
    const all = [...at.repo.tracked, ...at.repo.history.flatMap((commit) => commit.files), ...at.repo.dirty]
    return [...new Set(all)].filter((file) => under(file, at.inner)).map((file) => inside(file, at.inner))
  }
  async mergeBase(dir, ref) { return this.locate(dir)?.repo.mergeBases[ref] ?? null }
  async head(dir) { return this.locate(dir)?.repo.history.at(-1).sha ?? null }
  async commits(dir, since) {
    const at = this.locate(dir)
    const from = at?.repo.history.findIndex((commit) => commit.sha === since) ?? -1
    if (from < 0) return null
    return at.repo.history.slice(from + 1).map(({ sha, subject, body, files }, index) => ({
      sha, parent: at.repo.history[from + index].sha, subject, body, files: files.filter((file) => under(file, at.inner)).map((file) => inside(file, at.inner)),
    }))
  }
  /** The text a commit holds at a path, as `holds` set it. */
  async show(dir, sha, path) { return this.contents?.[sha]?.[tidy(`${dir}/${path}`)] ?? null }
  /** Files the commit holds, by path relative to the working copy. @param {string} sha @param {Record<string, string>} files */
  holds(sha, files) {
    this.contents ??= {}
    this.contents[sha] = { ...(this.contents[sha] ?? {}), ...Object.fromEntries(Object.entries(files).map(([path, text]) => [tidy(path), text])) }
  }
  /**
   * The files the repository holds at a commit of its history: what it tracked, and what the
   * commits up to it changed; at a commit outside it, the files a test says it holds.
   */
  async filesAt(dir, sha) {
    const at = this.locate(dir)
    const upTo = at.repo.history.findIndex((commit) => commit.sha === sha)
    if (upTo < 0) return this.contents?.[sha] === undefined ? null : Object.keys(this.contents[sha])
    const all = [...(at.repo.tracked ?? []), ...at.repo.history.slice(0, upTo + 1).flatMap((commit) => commit.files)]
    return [...new Set(all)].filter((file) => under(file, at.inner)).map((file) => inside(file, at.inner))
  }
  async existsAt(dir, sha, path) {
    const file = tidy(`${dir}/${path}`)
    const at = this.locate(file)
    const upTo = at.repo.history.findIndex((commit) => commit.sha === sha)
    return this.published.has(file) || at.repo.history.slice(1, upTo + 1).some((commit) => commit.files.includes(at.inner))
  }
  async commitFiles(dir, paths, message) {
    if (this.commitFails !== null) return { ok: false, error: this.commitFails }
    this.engineCommits.push({ dir, paths, message })
    const [subject, ...rest] = message.split('\n')
    this.commit(subject, paths.map((path) => tidy(`${dir}/${path}`)), rest.join('\n').trim())
    return { ok: true }
  }
  /** Each file copied where `to` says, relative to dir, then the copies committed alone; `copies` keeps them in order. */
  async commitCopies(dir, copies, message) {
    const refused = copies.filter(({ from }) => this.refuses.includes(from)).map(({ from }) => from)
    if (refused.length > 0) return { ok: false, error: 'refused', refused }
    if (this.commitFails !== null) return { ok: false, error: this.commitFails }
    this.copies.push(...copies.map(({ from, to }) => ({ from, to })))
    return this.commitFiles(dir, copies.map(({ to }) => to), message)
  }
  async changedFiles(dir, sha) {
    const commits = await this.commits(dir, sha)
    if (commits === null) return null
    const at = this.locate(dir)
    const dirty = [...at.repo.dirty].filter((file) => under(file, at.inner)).map((file) => inside(file, at.inner))
    return [...new Set([...commits.flatMap((commit) => commit.files), ...dirty])]
  }
  /** One `diff --git` section per changed file, with what `patches` says the change adds. */
  async diff(dir, sha) {
    const files = await this.changedFiles(dir, sha)
    if (files === null) return null
    return files.map((file) => `diff --git a/${file} b/${file}\n${(this.patches?.[file] ?? []).map((line) => `${line}\n`).join('')}`).join('')
  }
  /** Lines a change adds to a file, as its diff shows them. @param {string} path relative to the working copy @param {...string} lines */
  adds(path, ...lines) { this.patched(path, lines.map((line) => `+${line}`)) }
  /** Lines a change removes from a file, as its diff shows them. @param {string} path relative to the working copy @param {...string} lines */
  removes(path, ...lines) { this.patched(path, lines.map((line) => `-${line}`)) }
  /** @param {string} path @param {string[]} lines */
  patched(path, lines) {
    this.patches ??= {}
    const inner = this.locate(path).inner
    this.patches[inner] = [...(this.patches[inner] ?? []), ...lines]
  }
}
const shaPrefix = (top) => (top === '' ? 'root' : top.replaceAll('../', 'up-').replaceAll('/', '-'))

/**
 * Commits replayed in a throwaway checkout: the test command exits 1 (the red test fails)
 * unless `exits` names another code for that commit; null stands for a program that could not
 * start. The clock advances by takesMs per replay.
 */
export class ScriptedReplay {
  /**
   * @param {{ exits?: Record<string, number | null>, outputs?: Record<string, string>, clock?: FixedClock | null, takesMs?: number }} [options]
   *   exits: by `'<sha>'`, or by `'<sha> <argv>'` for one command at that commit; outputs: what a `'<sha> <argv>'` prints
   */
  constructor({ exits = {}, outputs = {}, clock = null, takesMs = 0 } = {}) {
    this.exits = exits
    this.outputs = outputs
    this.clock = clock
    this.takesMs = takesMs
    /** @type {Array<{ repository: string, sha: string, cwd: string, argv: string[], importRoots: string[] }>} each program tried, in order */
    this.replays = []
  }
  /** One checkout: the first choice whose exit is not scripted null starts, as CommitReplay does. */
  async run({ choices, ...request }) {
    await this.clock?.pass(this.takesMs)
    for (const argv of choices) {
      this.replays.push({ ...request, argv })
      const exitCode = this.exitOf({ ...request, argv })
      if (exitCode !== null) return { started: true, exitCode, stdout: this.outputs[`${request.sha} ${argv.join(' ')}`] ?? `${argv.join(' ')} at ${request.sha}\n`, stderr: '' }
    }
    return { started: false, exitCode: null, stdout: '', stderr: '', error: `could not start ${choices.map(([program]) => program).join(' nor ')}` }
  }
  /** The exit of `'<sha> <argv>'` when scripted, else of the sha, else 1 (a failing test). */
  exitOf({ sha, argv }) {
    const line = `${sha} ${argv.join(' ')}`
    if (line in this.exits) return this.exits[line]
    return sha in this.exits ? this.exits[sha] : 1
  }
  /** The replays, as `'<sha> <repository>/<cwd> $ <argv>'`, then ` [import <roots>]` for a Python program's import roots. */
  lines() { return this.replays.map(({ sha, repository, cwd, argv, importRoots }) => `${sha} ${repository}/${cwd} $ ${argv.join(' ')}${importRoots.length > 0 ? ` [import ${importRoots.join(', ')}]` : ''}`) }
}

/** The agents the default workflow starts: its agents, its lenses and the refuter. */
export const PLUGIN_AGENTS = Object.freeze([
  'solution-researcher', 'solution-architect', 'acceptance-designer', 'software-engineer',
  'consistency-lens', 'architecture-compliance-lens', 'fitness-lens',
  'coverage-lens', 'business-alignment-lens', 'testability-lens', 'boundary-enforcement-lens',
  'test-integrity-lens', 'architecture-boundaries-lens', 'cold-reader-lens', 'mock-fidelity-lens', 'contract-fidelity-lens',
  'finding-refuter', 'pr-writer',
])

/** The mocking and contract testing skills the plugin ships, the skills a component asks for. */
export const SHIPPED_COMPONENT_SKILLS = Object.freeze([
  'mocking-microcks-dotnet', 'mocking-inprocess-dotnet', 'mocking-microcks-python', 'mocking-inprocess-python', 'mocking-microcks-typescript', 'mocking-inprocess-typescript',
  'contract-testing', 'contract-testing-dotnet', 'contract-testing-python',
])

/**
 * Agents by where they come from; the plugin ships the pipeline's own by default. Each agent
 * declares skill names; a skill is provided when `skillFiles` holds its SKILL.md text, found at
 * `<skillRoot>/<name>/SKILL.md`; by default, the component skills the plugin ships.
 */
export class InMemoryAgentCatalog {
  /**
   * @param {{ plugin?: string[], repository?: string[], skills?: Record<string, string[]>, skillFiles?: Record<string, string>, skillRoot?: string }} [agents]
   *   skills: the skill names each agent declares; skillFiles: SKILL.md text by skill name
   */
  constructor({ plugin = PLUGIN_AGENTS, repository = [], skills = {}, skillFiles = Object.fromEntries(SHIPPED_COMPONENT_SKILLS.map((name) => [name, '# skill\n'])), skillRoot = '/plugin/skills' } = {}) {
    this.plugin = new Set(plugin)
    this.repository = new Set(repository)
    this.skillsByAgent = skills
    this.skillFiles = skillFiles
    this.skillRoot = skillRoot
  }
  async locate(agent) { return this.plugin.has(agent) ? 'plugin' : this.repository.has(agent) ? 'repository' : null }
  async skill(name) { return name in this.skillFiles ? { name, path: `${this.skillRoot}/${name}/SKILL.md`, text: this.skillFiles[name] } : null }
  async skills(agent) {
    const names = this.skillsByAgent[agent] ?? []
    return {
      found: names.filter((name) => name in this.skillFiles).map((name) => ({ name, path: `${this.skillRoot}/${name}/SKILL.md`, text: this.skillFiles[name] })),
      missing: names.filter((name) => !(name in this.skillFiles)),
    }
  }
}

/**
 * The forge of the working copy's remote: its remotes, the branch HEAD is on, the default branch,
 * the pull requests by head, each with its state and body. `calls` lists what the engine asked,
 * in order; `fails` gives the reason a push, a listing, an opening, an edit, keeping an issue comment or reading an issue fails with; `read`
 * reads a body file, as gh does (the pipeline host hands it the tracking folder). `issuesRead`
 * lists the issues the engine read, in order.
 */
export class InMemoryCodeHost {
  /**
   * @param {{ unavailable?: string | null, branch?: string | null, defaultBranch?: string | null, remotes?: string[], open?: Array<{ number: number, head: string, state?: string, body?: string }>, fails?: Record<string, string>, repository?: { host: string, repository: string } | null, issues?: Record<number, { title: string, body: string } | 'pull-request'> }} [forge]
   *   repository: the host and `<owner>/<repo>` the remote names, null when it names none;
   *   issues: the issues of the forge by number, 'pull-request' for a number that is one; without
   *   it, the forge has every issue, titled `Issue <number>`, its body `Acceptance criteria of #<number>`.
   *   An issue is read only from a forge that is available (unavailable null) and not told to fail.
   */
  constructor({ unavailable = null, branch = 'checkout', defaultBranch = 'main', remotes = ['origin'], open = [], fails = {}, repository = { host: 'github.com', repository: 'acme/shop' }, issues } = {}) {
    this.issues = issues
    /** @type {number[]} */
    this.issuesRead = []
    this.missing = unavailable
    this.named = repository
    this.branch = branch
    this.default = defaultBranch
    this.remoteNames = remotes
    /** @type {Array<{ number: number, url: string, head: string, state: string, body: string, base?: string, title?: string, bodyFile?: string, draft?: boolean }>} */
    this.pullRequests = open.map(({ number, head, state = 'open', body = '' }) => ({ number, head, state, body, url: `https://github.example.com/acme/shop/pull/${number}` }))
    this.fails = fails
    /** @type {Array<{ number: number, bodyFile: string, body: string, bodies: string[], edits: number, url: string }>} the issue comments on the forge, in the order they were posted; a test may remove one, as a human deleting it */
    this.comments = []
    /** how many comments were ever posted */
    this.posted = 0
    /** @type {string[]} */
    this.calls = []
    /** @type {(file: string) => string} */
    this.read = () => ''
  }
  async unavailable() { return this.missing }
  async issue(number) {
    this.issuesRead.push(number)
    const unreadable = this.missing ?? this.fails.issue
    if (unreadable) return { read: 'failed', reason: unreadable }
    const found = this.issues === undefined ? { title: `Issue ${number}`, body: `Acceptance criteria of #${number}` } : this.issues[number]
    if (found === 'pull-request') return { read: 'pull-request' }
    return found ? { read: 'issue', issue: { number, title: found.title, url: `https://github.example.com/acme/shop/issues/${number}`, body: found.body } } : { read: 'missing' }
  }
  async remotes() { return this.remoteNames }
  async repository() { return this.named }
  async currentBranch() { return this.branch }
  async defaultBranch() { return this.default }
  async push(branch) {
    this.calls.push(`push ${branch}`)
    return this.fails.push ? { ok: false, reason: this.fails.push } : { ok: true }
  }
  async findPullRequest(head) {
    this.calls.push(`find ${head}`)
    if (this.fails.find) return { ok: false, reason: this.fails.find }
    const found = this.pullRequests.findLast((pull) => pull.head === head)
    return { ok: true, found: found ? { number: found.number, url: found.url, state: found.state, body: found.body } : null }
  }
  async create({ base, head, title, bodyFile, draft }) {
    this.calls.push(`create ${base} <- ${head}${draft ? ' (draft)' : ''}: ${title}`)
    if (this.fails.create) return { ok: false, reason: this.fails.create }
    const number = 41 + this.pullRequests.length + 1
    const url = `https://github.example.com/acme/shop/pull/${number}`
    this.pullRequests.push({ number, url, head, base, title, bodyFile, draft, state: 'open', body: this.read(bodyFile) })
    return { ok: true, number, url }
  }
  async edit({ number, bodyFile }) {
    this.calls.push(`edit #${number} ${bodyFile}`)
    if (this.fails.edit) return { ok: false, reason: this.fails.edit }
    this.pullRequests.find((pull) => pull.number === number).body = this.read(bodyFile)
    return { ok: true }
  }
  async keepIssueComment({ number, marker, url, bodyFile }) {
    this.calls.push(`keep comment #${number}${url === null ? '' : ` ${url.slice(url.indexOf('#'))}`}`)
    if (this.fails.comment) return { ok: false, reason: this.fails.comment }
    const body = this.read(bodyFile)
    const kept = this.comments.find((comment) => comment.url === url) ?? this.comments.findLast((comment) => comment.number === number && comment.body.includes(marker))
    if (kept) {
      kept.body = body
      kept.bodies.push(body)
      kept.edits += 1
      return { ok: true, url: kept.url }
    }
    this.posted += 1
    const comment = { number, bodyFile, body, bodies: [body], edits: 0, url: `https://github.example.com/acme/shop/issues/${number}#issuecomment-${900 + this.posted}` }
    this.comments.push(comment)
    return { ok: true, url: comment.url }
  }
}

/**
 * The pull requests of the forge, by number, and the comments kept on them. `calls` lists what the
 * engine asked, in order; `fails` gives the reason a read or keeping a comment fails with; `read`
 * reads a body file, as gh does (the review host hands it the review's folder).
 */
export class InMemoryPullRequests {
  /**
   * @param {{ unavailable?: string | null, pullRequests?: object[], fails?: Record<string, string> }} [forge]
   */
  constructor({ unavailable = null, pullRequests = [], fails = {}, repository = { host: 'github.com', repository: 'acme/shop' } } = {}) {
    this.missing = unavailable
    this.named = repository
    this.pullRequests = pullRequests
    this.fails = fails
    /** @type {Array<{ number: number, body: string, bodies: string[], url: string }>} */
    this.comments = []
    /** @type {string[]} */
    this.calls = []
    /** @type {(file: string) => string} */
    this.read = () => ''
  }
  async unavailable() {
    this.calls.push('unavailable')
    return this.missing
  }
  async repository() { return this.named }
  async find(number) {
    this.calls.push(`find #${number}`)
    if (this.fails.read) return { ok: false, reason: this.fails.read }
    return { ok: true, found: this.pullRequests.find((pull) => pull.number === number) ?? null }
  }
  async keepComment({ number, marker, url, bodyFile }) {
    this.calls.push(`keep comment #${number}${url === null ? '' : ` ${url.slice(url.indexOf('#'))}`}`)
    if (this.fails.comment) return { ok: false, reason: this.fails.comment }
    const body = this.read(bodyFile)
    const kept = this.comments.find((comment) => comment.url === url) ?? this.comments.findLast((comment) => comment.number === number && comment.body.includes(marker))
    if (kept) {
      kept.body = body
      kept.bodies.push(body)
      return { ok: true, url: kept.url }
    }
    const comment = { number, body, bodies: [body], url: `https://github.example.com/acme/shop/pull/${number}#issuecomment-${900 + this.comments.length + 1}` }
    this.comments.push(comment)
    return { ok: true, url: comment.url }
  }
}

/** The plugin's own `workflows/pipeline.skraft.dot`, read once: the default every test runs. */
export const BUILT_IN_WORKFLOW = readFileSync(new URL('../../../../plugins/skraft-framework/workflows/pipeline.skraft.dot', import.meta.url), 'utf8')

export const BUILT_IN_REVIEW = readFileSync(new URL('../../../../plugins/skraft-framework/workflows/review.skraft.dot', import.meta.url), 'utf8')

export class InMemoryWorkflowSource {
  /** @param {string} [text] @param {Record<string, string>} [called] the plugin's other workflows, by file */
  constructor(text = BUILT_IN_WORKFLOW, called = { review: BUILT_IN_REVIEW }) {
    this.text = text
    this.workflows = called
  }
  async builtIn() { return this.text }
  async called(file) { return this.workflows[file] ?? null }
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
   * @param {{ installed?: string[], exits?: Record<string, number | null>, clock?: FixedClock, takesMs?: number, meanwhile?: Record<string, () => Promise<void> | void>, floods?: string[] }} [options]
   *   exits: null for a program stopped before it exited; clock advances by takesMs per run;
   *   meanwhile: what happens elsewhere on the machine while that command line runs; floods:
   *   the command lines whose output passes the runner's limit, kept cut
   */
  constructor({ installed = ['git', 'docker', 'dotnet', 'npm', 'npx', 'mvn', 'python'], exits = {}, clock = null, takesMs = 0, meanwhile = {}, floods = [] } = {}) {
    this.installed = new Set(installed)
    this.exits = exits
    this.clock = clock
    this.takesMs = takesMs
    this.meanwhile = meanwhile
    this.floods = new Set(floods)
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
  async run({ argv, cwd, timeoutMs }) {
    this.runs.push({ argv, cwd, ...(timeoutMs === undefined ? {} : { timeoutMs }) })
    if (this.installedAt(argv[0], cwd) === null) return { started: false, exitCode: null, stdout: '', stderr: '', error: `command not found: ${argv[0]}` }
    await this.clock?.pass(this.takesMs)
    const line = `${cwd} $ ${argv.join(' ')}`
    await this.meanwhile[line]?.()
    if (this.exits[line] === null) return { started: true, exitCode: null, stdout: '', stderr: '', error: `${argv[0]} was stopped by SIGKILL` }
    const exitCode = this.exits[line] ?? 0
    const output = { stdout: `${argv.join(' ')} output\n`, stderr: exitCode === 0 ? '' : 'it failed\n' }
    if (this.floods.has(line)) return { started: true, exitCode, stdout: `${output.stdout}\n… output cut …\n`, stderr: output.stderr, truncated: true }
    return { started: true, exitCode, ...output }
  }
  /** The command lines run, as `'<cwd> $ <argv>'`. */
  lines() { return this.runs.map(({ argv, cwd }) => `${cwd} $ ${argv.join(' ')}`) }
}

/**
 * Every dependency a use case takes, over the doubles above; a test names only the ones it
 * looks at. config: the text of skraft-config.json, no file when undefined; local: the text of
 * skraft-config.local.json; user: the text of ~/.skraft/config.json; now: the clock.
 */
export const inMemoryDeps = ({ tracking = new InMemoryTracking(), config, local, user, now = '2026-10-15T08:00:00.000Z', ...given } = {}) => ({
  journal: tracking,
  activePipeline: tracking,
  files: tracking,
  workspace: new InMemoryWorkspace({ ...(config === undefined ? {} : { 'skraft-config.json': config }), ...(local === undefined ? {} : { 'skraft-config.local.json': local }) }),
  userSettings: new InMemoryUserSettings(user),
  sourceControl: new InMemorySourceControl(),
  commandRunner: new ScriptedMachine(),
  templates: new InMemoryTemplates({}),
  clock: new FixedClock(now),
  hasher: new FakeHasher(),
  journalKeys: tracking.journalKeys,
  agentRunner: new ScriptedAgentRunner(),
  progress: new RecordingProgress(),
  workflowSource: new InMemoryWorkflowSource(),
  agentCatalog: new InMemoryAgentCatalog(),
  hostSettings: new InMemoryHostSettings(),
  forges: { github: { codeHost: new InMemoryCodeHost(), pullRequests: new InMemoryPullRequests() } },
  runLock: new InMemoryRunLock(tracking),
  timer: new ManualTimer(),
  ...given,
})
