// The files the canvas reads and writes. It reads what the workflow wrote under
// `.copilot-tracking/skraft-plans/<slug>/backlog/` and the HVE handoff under
// `.copilot-tracking/github-issues/prds/<slug>/`; it writes only two files of its own, next to
// the backlog: `review.json` (the stories a human reviewed, with the fingerprint of the file they
// read, and the repository the human chose to create them in) and `published.json` (the issue
// each published story became).
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isReviewed } from '../handoff.mjs'
import { sha256 } from '../prd-inventory.mjs'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const STORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** @param {string} cwd */
const plansDir = (cwd) => join(cwd, '.copilot-tracking', 'skraft-plans')

/** @param {string} cwd @param {string} slug */
export const backlogDir = (cwd, slug) => join(plansDir(cwd), slug, 'backlog')

/** @param {string} cwd @param {string} slug */
export const handoffDir = (cwd, slug) => join(cwd, '.copilot-tracking', 'github-issues', 'prds', slug)

/** @param {unknown} slug @returns {slug is string} */
export const isSlug = (slug) => typeof slug === 'string' && SLUG.test(slug)

/** @param {string} path */
const readJson = async (path) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return undefined
  }
}

/** @param {string} path @param {unknown} value */
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

/**
 * The backlogs of the workspace: every slug whose story map exists, the most recent first.
 * @param {string} cwd
 * @returns {Promise<{ slug: string, updatedAt: number }[]>}
 */
export const listBacklogs = async (cwd) => {
  const slugs = await readdir(plansDir(cwd)).catch(() => [])
  const found = await Promise.all(slugs.filter(isSlug).map(async (slug) => {
    const info = await stat(join(backlogDir(cwd, slug), 'story-map.json')).catch(() => null)
    return info ? { slug, updatedAt: info.mtimeMs } : null
  }))
  return found.filter((entry) => entry !== null).sort((a, b) => b.updatedAt - a.updatedAt || a.slug.localeCompare(b.slug))
}

/**
 * A story map the assessment can walk: milestones, and epics that each hold stories.
 * @param {any} map
 */
const walkable = (map) => Array.isArray(map?.milestones) && Array.isArray(map?.epics)
  && map.epics.every((epic) => typeof epic?.id === 'string' && Array.isArray(epic.stories)
    && epic.stories.every((story) => typeof story?.id === 'string' && Array.isArray(story.after) && Array.isArray(story.covers)))

/**
 * Everything the workflow and the canvas wrote for one backlog.
 * @param {string} cwd @param {string} slug
 * @returns {Promise<{ raw: import('./assess.mjs').RawBacklog } | { error: string }>}
 */
export const loadBacklog = async (cwd, slug) => {
  if (!isSlug(slug)) return { error: `${slug} is not a backlog slug` }
  const dir = backlogDir(cwd, slug)
  const map = await readJson(join(dir, 'story-map.json'))
  if (!walkable(map)) return { error: `${slug}: story-map.json is missing or cannot be read` }
  const ids = map.epics.flatMap((epic) => epic.stories.map((story) => story.id)).filter((id) => STORY_ID.test(id))
  const read = await Promise.all(ids.map(async (id) => {
    const text = await readFile(join(dir, 'stories', `${id}.json`), 'utf8').catch(() => null)
    try { return text === null ? null : { id, file: JSON.parse(text), fingerprint: sha256(text) } } catch { return null }
  }))
  const stories = read.filter((entry) => entry !== null)
  const handoff = await readFile(join(handoffDir(cwd, slug), 'handoff.md'), 'utf8').catch(() => null)
  const plan = await readJson(join(dir, 'plan.json'))
  const review = await readJson(join(dir, 'review.json'))
  return {
    raw: {
      slug,
      inventory: (await readJson(join(dir, 'inventory.json'))) ?? null,
      map,
      files: new Map(stories.map((s) => [s.id, s.file])),
      fingerprints: new Map(stories.map((s) => [s.id, s.fingerprint])),
      reviews: await latestReviews(join(dir, 'reviews')),
      plan: plan && Array.isArray(plan.issues) ? plan : null,
      published: record((await readJson(join(dir, 'published.json')))?.stories),
      reviewed: record(review?.stories),
      repo: typeof review?.repo === 'string' ? review.repo : typeof plan?.repo === 'string' ? plan.repo : projectOf(handoff),
      handoff: { exists: handoff !== null, reviewed: handoff !== null && isReviewed(handoff) },
    },
  }
}

/** @param {unknown} value @returns {Record<string, any>} */
const record = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : {})

/** The repository the handoff names, when it names one. @param {string | null} handoff */
const projectOf = (handoff) => {
  const project = /^\* \*\*Project\*\*: (\S+)$/m.exec(handoff ?? '')?.[1]
  return project && project !== 'unresolved' ? project : null
}

/**
 * The last review of each epic: `reviews/<epic>/discuss-review-<N>.json` with the highest N.
 * @param {string} dir
 * @returns {Promise<Map<string, { attempt: number, review: any }>>}
 */
const latestReviews = async (dir) => {
  const epics = await readdir(dir).catch(() => [])
  const entries = await Promise.all(epics.map(async (epic) => {
    const attempts = (await readdir(join(dir, epic)).catch(() => []))
      .map((name) => Number(/^discuss-review-(\d+)\.json$/.exec(name)?.[1] ?? Number.NaN))
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => b - a)
    for (const attempt of attempts) {
      const review = await readJson(join(dir, epic, `discuss-review-${attempt}.json`))
      if (review) return /** @type {const} */ ([epic, { attempt, review }])
    }
    return null
  }))
  return new Map(entries.filter((entry) => entry !== null))
}

/**
 * Records that a human reviewed these stories, as their files read now; or withdraws the review.
 * @param {string} cwd @param {string} slug
 * @param {{ id: string, fingerprint: string }[]} stories
 * @param {{ reviewed: boolean, now: string }} change
 */
export const writeReviews = async (cwd, slug, stories, { reviewed, now }) => {
  const path = join(backlogDir(cwd, slug), 'review.json')
  const file = await readJson(path)
  const current = record(file?.stories)
  for (const story of stories) {
    if (reviewed) current[story.id] = { at: now, fingerprint: story.fingerprint }
    else delete current[story.id]
  }
  await writeJson(path, { version: 1, stories: current, ...(typeof file?.repo === 'string' ? { repo: file.repo } : {}) })
  return current
}

/**
 * Records the repository the human chose to create the issues in: it outlives the canvas and wins
 * over the one plan.json names.
 * @param {string} cwd @param {string} slug @param {string} repo
 */
export const writeRepo = async (cwd, slug, repo) => {
  const path = join(backlogDir(cwd, slug), 'review.json')
  const file = await readJson(path)
  await writeJson(path, { version: 1, stories: record(file?.stories), repo })
}

/**
 * Records the issue each published story became, keeping what earlier publications recorded.
 * @param {string} cwd @param {string} slug @param {Record<string, { number: number, url?: string }>} items
 */
export const writePublished = async (cwd, slug, items) => {
  const path = join(backlogDir(cwd, slug), 'published.json')
  const current = { ...record((await readJson(path))?.stories), ...items }
  await writeJson(path, { version: 1, stories: current })
  return current
}

/**
 * A cheap signature of the backlog's files: it changes when the workflow or a human writes one.
 * @param {string} cwd @param {string} slug
 */
export const signatureOf = async (cwd, slug) => {
  const parts = []
  const walk = async (dir, depth) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name)
      if (entry.isDirectory() && depth > 0) await walk(path, depth - 1)
      else if (entry.isFile() && !entry.name.endsWith('.tmp')) {
        const info = await stat(path).catch(() => null)
        if (info) parts.push(`${path}:${info.mtimeMs}:${info.size}`)
      }
    }
  }
  await walk(backlogDir(cwd, slug), 2)
  await walk(handoffDir(cwd, slug), 0)
  return sha256(parts.join('\n'))
}
