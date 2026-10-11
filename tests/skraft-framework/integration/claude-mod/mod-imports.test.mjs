import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = fileURLToPath(new URL('../../../../plugins/skraft-framework/', import.meta.url))
const MODULE = join(PLUGIN, 'hooks', 'skraft-mod.tsx')

const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const specifiers = (source) =>
  [...withoutComments(source).matchAll(/^\s*(import|export)\s+(type\s+)?[^'"]*?\bfrom\s+['"]([^'"]+)['"]/gm)]
    .map(([, , typeOnly, spec]) => ({ spec, typeOnly: Boolean(typeOnly) }))

/** Every file the registered module loads at run time, and what each imports. */
const runtimeGraph = (entry) => {
  const seen = new Map()
  const visit = (file) => {
    if (seen.has(file)) return
    const source = readFileSync(file, 'utf8')
    const imports = specifiers(source).filter(({ typeOnly }) => !typeOnly).map(({ spec }) => spec)
    seen.set(file, { source, imports })
    for (const spec of imports) if (spec.startsWith('.')) visit(join(dirname(file), spec))
  }
  visit(entry)
  return seen
}

test('hooks.json registers the mod module alone: V2 ships no command hooks', () => {
  assert.deepEqual(JSON.parse(readFileSync(join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')), { modules: ['./skraft-mod.tsx'] })
})

test('the mod loads no Node API and no dynamic import, through any file it imports', () => {
  const graph = runtimeGraph(MODULE)
  const files = [...graph.keys()].map((file) => relative(PLUGIN, file).split(/[\\/]/).join('/'))
  assert.ok(files.includes('engine/drivers/claude-mod/claude-mod-driver.mjs'), files.join('\n'))
  assert.ok(files.includes('engine/application/run-pipeline.mjs'), files.join('\n'))

  const offending = [...graph].flatMap(([file, { source, imports }]) => [
    ...imports.filter((spec) => !spec.startsWith('.') && spec !== 'claude-code').map((spec) => `${relative(PLUGIN, file)} → ${spec}`),
    ...(/\bimport\s*\(/.test(withoutComments(source)) ? [`${relative(PLUGIN, file)} uses import()`] : []),
    ...(/(?<![.\w$])(process|require|Buffer)\b[.(]/.test(withoutComments(source)) ? [`${relative(PLUGIN, file)} uses a Node global`] : []),
  ])
  assert.deepEqual(offending, [])
})

test('the scan reads type-only imports apart from the ones that load', () => {
  assert.deepEqual(specifiers("import type { A } from 'claude-code'\nimport { b } from './b.mjs'\n// import { c } from 'node:fs'"), [
    { spec: 'claude-code', typeOnly: true },
    { spec: './b.mjs', typeOnly: false },
  ])
})
