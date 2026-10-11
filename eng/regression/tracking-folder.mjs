// IO adapter: read a `.copilot-tracking/skraft-plans/<slug>/` folder and summarise it.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { summarizeV1, summarizeV2, parseEventsJsonl } from './summary.mjs'

const listFiles = (root) => {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) out.push(relative(root, full).split(sep).join('/'))
    }
  }
  walk(root)
  return out.sort()
}

const readText = (root, rel) => readFileSync(join(root, ...rel.split('/')), 'utf8')

const REVIEW_MD = /^reviews\/[^/]+\/[^/]+-review-\d+\.md$/i
const QG_EVIDENCE = /^evidence\/(?:.+\/)?qg-[^/]+\.json$/i

/**
 * @param {string} dir tracking folder
 * @returns {{ format: 'v1' | 'v2', summary: import('./summary.mjs').RunSummary }}
 */
export const readTrackingFolder = (dir) => {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`tracking folder not found: ${dir}`)
  const files = listFiles(dir)

  if (files.includes('events.jsonl')) {
    return { format: 'v2', summary: summarizeV2(parseEventsJsonl(readText(dir, 'events.jsonl')), { files }) }
  }
  if (files.includes('state.json')) {
    const state = JSON.parse(readText(dir, 'state.json'))
    const reviews = files.filter((f) => REVIEW_MD.test(f)).map((path) => ({ path, content: readText(dir, path) }))
    const evidence = files
      .filter((f) => QG_EVIDENCE.test(f))
      .flatMap((path) => {
        try {
          return [{ path, json: JSON.parse(readText(dir, path)) }]
        } catch {
          return []
        }
      })
    return { format: 'v1', summary: summarizeV1({ state, reviews, evidence, files }) }
  }
  throw new Error(`${dir} holds neither events.jsonl (v2) nor state.json (v1)`)
}
