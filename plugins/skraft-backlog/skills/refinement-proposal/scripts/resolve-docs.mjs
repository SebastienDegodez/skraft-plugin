#!/usr/bin/env node
// Finds the PRD and BRD an issue should be reviewed against, under the repository's docs folder.
// A document is USED only when the issue links it. Any other document that looks related is a
// CANDIDATE to confirm: it is listed, never used, because a wrong PRD makes a confident wrong review.
//
//   node resolve-docs.mjs --issue-file issue.json [--docs docs] [--root .]
//
// issue.json holds { "title": "…", "body": "…" } (the GitHub issue object works as is).
// Prints JSON: { searched, used: [{ path, kind, via }], candidates: [{ path, kind, matched }],
//                missing: [path], none: boolean }
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_FILES = 2000
const posix = (path) => path.split(sep).join('/')

const STOPWORDS = new Set(`the and for with that this from into when then than have has will would should could
about after before their there what which while your user users les des une pour avec dans sur par pas plus que qui
est sont être être aux ces ses son sa leur nous vous elle elles ils doit faire mais comme quand alors
issue feature story bug add allow make update`.split(/\s+/))

/** PRD, BRD or null, from the path and the first lines of the document. */
export function documentKind(path, head = '') {
  const name = posix(path).toLowerCase()
  if (/(^|[/_.-])prds?([/_.-]|$)|product[-_ ]requirements?/.test(name)) return 'PRD'
  if (/(^|[/_.-])brds?([/_.-]|$)|business[-_ ]requirements?/.test(name)) return 'BRD'
  const text = String(head).toLowerCase()
  if (/^type:\s*prd\b|product requirements? document|exigences produit/m.test(text)) return 'PRD'
  if (/^type:\s*brd\b|business requirements? document|exigences métier|besoins métier/m.test(text)) return 'BRD'
  return null
}

export const words = (text) => [...new Set(String(text ?? '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !STOPWORDS.has(word)))]

/** Paths under docs/ the issue text points at: relative paths or GitHub blob URLs. */
export function linkedPaths(text, docsDir = 'docs') {
  const dir = posix(docsDir).replace(/\/+$/, '')
  const escaped = dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const found = new Set()
  const pattern = new RegExp(`(?:^|[\\s(\\[<'"\`]|/blob/[^/\\s]+/)(?:\\./)?(${escaped}/[^\\s)\\]>'"\`#?]+\\.md)`, 'gi')
  for (const match of String(text ?? '').matchAll(pattern)) found.add(match[1])
  return [...found]
}

/**
 * @param {{ title: string, body: string }} issue
 * @param {{ path: string, head: string }[]} documents every Markdown file under docsDir
 */
export function resolveDocs(issue, documents, { docsDir = 'docs' } = {}) {
  const known = new Map(documents.map((doc) => [posix(doc.path), { ...doc, kind: documentKind(doc.path, doc.head) }]))
  const used = []
  const missing = []
  for (const path of linkedPaths(`${issue?.title ?? ''}\n${issue?.body ?? ''}`, docsDir)) {
    const doc = known.get(posix(path))
    if (!doc) missing.push(path)
    else used.push({ path: doc.path, kind: doc.kind ?? 'DOC', via: 'linked from the issue' })
  }
  const usedPaths = new Set(used.map((doc) => doc.path))
  const wanted = words(issue?.title)
  const candidates = [...known.values()]
    .filter((doc) => doc.kind && !usedPaths.has(doc.path))
    .map((doc) => {
      const own = new Set(words(`${doc.path} ${String(doc.head).split('\n').slice(0, 5).join(' ')}`))
      return { path: doc.path, kind: doc.kind, matched: wanted.filter((word) => own.has(word)) }
    })
    .filter((doc) => doc.matched.length > 0)
    .sort((left, right) => right.matched.length - left.matched.length || left.path.localeCompare(right.path))
    .slice(0, 3)
  return { searched: posix(docsDir), used, candidates, missing, none: used.length === 0 && candidates.length === 0 }
}

export function listDocuments(root, docsDir) {
  const base = resolve(root, docsDir)
  if (!existsSync(base) || !statSync(base).isDirectory()) return []
  const found = []
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (found.length >= MAX_FILES) return
      if (name.startsWith('.') || name === 'node_modules') continue
      const path = join(dir, name)
      const stat = statSync(path)
      if (stat.isDirectory()) walk(path)
      else if (/\.md$/i.test(name)) found.push({ path: posix(relative(root, path)), head: readFileSync(path, 'utf8').slice(0, 1500) })
    }
  }
  walk(base)
  return found
}

export function main(argv, { log = console.log, error = console.error, cwd = process.cwd() } = {}) {
  const options = { docs: 'docs', root: cwd }
  for (let index = 0; index < argv.length; index++) {
    const key = { '--issue-file': 'issueFile', '--docs': 'docs', '--root': 'root' }[argv[index]]
    const value = argv[index + 1]
    if (!key || value === undefined) { error(`resolve-docs: unknown or incomplete argument ${argv[index]}`); return 2 }
    options[key] = value
    index++
  }
  if (!options.issueFile) { error('resolve-docs: --issue-file is required'); return 2 }
  let issue
  try { issue = JSON.parse(readFileSync(resolve(cwd, options.issueFile), 'utf8')) } catch (err) { error(`resolve-docs: ${err.message}`); return 2 }
  const root = resolve(cwd, options.root)
  log(JSON.stringify(resolveDocs(issue, listDocuments(root, options.docs), { docsDir: options.docs }), null, 2))
  return 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2))
