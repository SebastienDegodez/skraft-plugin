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
