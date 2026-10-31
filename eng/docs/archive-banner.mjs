#!/usr/bin/env node
// Marks a built v1 tree as archived, once, for the docs-archive-v1 release asset. The banner is
// static: the archive never fetches anything from the live site.
//
//   node eng/docs/archive-banner.mjs banner <tree dir> --tag v1.15.3 --current /skraft-plugin/
//   node eng/docs/archive-banner.mjs index  <archive dir> --base /skraft-plugin/ --tags v1.15.3,v1.15.2,…
//
// `banner` adds the banner after <body> in every .html file of the tree (twice is a no-op);
// `index` writes <archive dir>/v1/index.html, the list of the archived trees.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const MARKER = 'skraft-archive-banner'
const TAG = /^v\d+\.\d+\.\d+$/
const BASE = /^\/(?:[A-Za-z0-9._-]+\/)*$/

/** A base path such as `/skraft-plugin/`: absolute, ends with a slash, no character to escape. */
const checkBase = (base) => {
  if (!BASE.test(base)) throw new Error(`not a base path: ${base}`)
  return base
}

const checkTag = (tag) => {
  if (!TAG.test(tag)) throw new Error(`not a v1 release tag: ${tag}`)
  return tag
}

/** The banner shown on top of every archived page. */
export const bannerHtml = (tag, current) =>
  `<div id="${MARKER}" role="note" style="background:#fff4ce;color:#1f1f1f;border-bottom:1px solid #d4b106;padding:.6rem 1rem;font:15px/1.4 system-ui,sans-serif;text-align:center">` +
  `Archived documentation for skraft ${checkTag(tag)}. <a href="${checkBase(current)}" style="color:#0b5cad;font-weight:600">Current documentation →</a></div>`

/** The page with the banner right after its opening <body> tag; unchanged when already marked or bodiless. */
export const withBanner = (html, tag, current) => {
  if (html.includes(`id="${MARKER}"`)) return html
  const body = /<body\b[^>]*>/i.exec(html)
  if (!body) return html
  const at = body.index + body[0].length
  return html.slice(0, at) + bannerHtml(tag, current) + html.slice(at)
}

/** Adds the banner to every .html file under `dir`; returns how many files changed. */
export const bannerTree = (dir, tag, current) => {
  const files = readdirSync(dir, { recursive: true }).map(String).filter((file) => file.endsWith('.html'))
  let changed = 0
  for (const file of files) {
    const path = join(dir, file)
    const html = readFileSync(path, 'utf8')
    const next = withBanner(html, tag, current)
    if (next !== html) {
      writeFileSync(path, next)
      changed += 1
    }
  }
  return changed
}

/** The v1/index.html page listing the archived trees, newest first as given. */
export const indexHtml = (base, tags) => {
  checkBase(base)
  const items = tags.map((tag) => `<li><a href="${base}${checkTag(tag)}/">skraft ${tag}</a></li>`).join('\n')
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>skraft v1 documentation (archived)</title></head>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem">
<h1>skraft v1 documentation (archived)</h1>
<p>These trees are frozen as they were published. <a href="${base}">Current documentation →</a></p>
<ul>
${items}
</ul>
</body>
</html>
`
}

const main = (argv) => {
  const [command, ...rest] = argv
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: { tag: { type: 'string' }, current: { type: 'string' }, base: { type: 'string' }, tags: { type: 'string' } },
  })
  if (command === 'banner' && positionals.length === 1 && values.tag && values.current) {
    const changed = bannerTree(positionals[0], values.tag, values.current)
    process.stdout.write(`archive-banner: ${changed} pages marked in ${positionals[0]}\n`)
    return 0
  }
  if (command === 'index' && positionals.length === 1 && values.base && values.tags) {
    const tags = values.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    mkdirSync(join(positionals[0], 'v1'), { recursive: true })
    writeFileSync(join(positionals[0], 'v1', 'index.html'), indexHtml(values.base, tags))
    process.stdout.write(`archive-banner: v1/index.html lists ${tags.length} trees\n`)
    return 0
  }
  process.stderr.write('Usage: archive-banner.mjs banner <dir> --tag <tag> --current <base> | index <dir> --base <base> --tags <t1,t2>\n')
  return 2
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2))
