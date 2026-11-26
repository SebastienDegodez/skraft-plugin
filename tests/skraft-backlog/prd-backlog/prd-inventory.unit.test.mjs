// INVENTORY: a PRD is read as it is written, whatever tool wrote it, and never rewritten.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { criteriaFor, inventoryOf, isDraft } from '../../../plugins/skraft-backlog/prd-backlog/prd-inventory.mjs'

const fixture = (name) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')
const count = (inventory) => inventory.requirements.reduce((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + 1 }), {})
const byId = (inventory, id) => inventory.requirements.find((r) => r.id === id)

test('an HVE PRD written in lines: every FR, NFR, AC, constraint, goal and decision is read, and the AC names its FR', () => {
  const inventory = inventoryOf(fixture('prd-formats/hve-brd-builder-prd.md'))
  assert.deepEqual(count(inventory), { DD: 4, GOAL: 3, FR: 7, NFR: 9, CON: 4, AC: 7 })
  assert.deepEqual([inventory.format, inventory.formatSource, inventory.status, inventory.epicSource], ['hve', 'detected', 'approved', 'none'])
  assert.match(byId(inventory, 'FR-001').statement, /^The BRD Builder guides users through the three-phase lifecycle/)
  assert.equal(byId(inventory, 'FR-001').line, 110)
  assert.ok(byId(inventory, 'AC-002').links.includes('FR-002'))
  assert.deepEqual(inventory.cited, [], 'the traceability matrix only cites what the PRD defines')
  assert.deepEqual(inventory.mvp?.inScope, ['FR-001', 'FR-002', 'FR-003', 'FR-004', 'FR-005', 'FR-006', 'FR-007'])
})

test('an HVE PRD written in tables, with goal prefixes of its own: the rows define, the matrices only cite', () => {
  const inventory = inventoryOf(fixture('prd-formats/hve-privacy-planner-prd.md'))
  assert.deepEqual(count(inventory), { GOAL: 3, DD: 4, FR: 7, NFR: 9, CON: 3, AC: 8 })
  const fr = byId(inventory, 'FR-003')
  assert.match(fr.statement, /^Classification gate and DPIA threshold — When processing meets the DPIA threshold predicate/)
  assert.deepEqual(fr.links, ['PG-001', 'AC-003'])
  assert.deepEqual(inventory.cited.map((c) => c.id), ['BG-001', 'BG-002', 'BG-003'], 'the BRD goals it names are cited, not defined')
})

test('a BMad PRD: bold FR-1 lines with no leading zeros, read like any other', () => {
  const inventory = inventoryOf(fixture('prd-formats/bmad-notifications-prd.md'))
  assert.deepEqual(count(inventory), { FR: 7, NFR: 3 })
  assert.equal(inventory.format, 'generic')
  assert.equal(byId(inventory, 'FR-6').statement.startsWith('Quiet hours. A user can set quiet hours.'), true)
})

test('the skraft PRD still reads its EP-### epics and the FRs under them', () => {
  const inventory = inventoryOf(fixture('eligibilite-prd.md'))
  assert.equal(inventory.epicSource, 'ep')
  assert.deepEqual(inventory.epics.map((e) => e.id), ['EP-001', 'EP-002'])
  assert.ok(inventory.requirements.filter((r) => r.kind === 'FR').every((r) => r.epic !== null))
})

test('epics come from FEAT-### definitions, then from feature headings; an FR keeps the one it sits under', () => {
  const feat = inventoryOf('## Features\n\n### FEAT-001: Ordering\n\n- FR-001: The customer orders.\n\n### FEAT-002: Paying\n\n- FR-002: The customer pays.\n')
  assert.equal(feat.epicSource, 'feat')
  assert.deepEqual(feat.requirements.map((r) => [r.id, r.epic]), [['FR-001', 'FEAT-001'], ['FR-002', 'FEAT-002']])
  const headings = inventoryOf('## Features and requirements\n\n### Ordering\n\n**FR-1 Pick.** The customer picks.\n\n### Paying\n\n**FR-2 Pay.** The customer pays.\n')
  assert.equal(headings.epicSource, 'features')
  assert.deepEqual(headings.epics.map((e) => [e.id, e.title]), [['EP-001', 'Ordering'], ['EP-002', 'Paying']])
  assert.deepEqual(headings.requirements.map((r) => r.epic), ['EP-001', 'EP-002'])
})

test('the frontmatter prefixes of the PRD name its families; a cited FR never defined is reported with its line', () => {
  const text = '---\nprd_id: "X"\nstatus: "draft"\nrequirement_id_prefixes:\n  fr: "REQ"\n---\n\nREQ-001: The agent answers.\n\nSee REQ-002 and FR-009.\n'
  const inventory = inventoryOf(text)
  assert.deepEqual(inventory.requirements.map((r) => [r.id, r.kind]), [['REQ-001', 'FR']])
  assert.deepEqual(inventory.cited, [{ id: 'REQ-002', lines: [10] }, { id: 'FR-009', lines: [10] }])
  assert.equal(isDraft(inventory), true)
  assert.deepEqual([inventoryOf(text, { format: 'hve' }).formatSource, inventoryOf('FR-001: x\n').format], ['argument', 'generic'])
})

test('an id that opens a list, a code block or a comment defines nothing', () => {
  const inventory = inventoryOf('FR-001, FR-002 are related.\n\n```\nFR-003: in code\n```\n\n<!-- FR-004: hidden -->\n\n- FR-005: The real one.\n')
  assert.deepEqual(inventory.requirements.map((r) => r.id), ['FR-005'])
})

test('the PRD\'s own acceptance criteria follow the FRs a story covers, linked either way', () => {
  const lines = inventoryOf(fixture('prd-formats/hve-brd-builder-prd.md'))
  assert.deepEqual(criteriaFor(lines, ['FR-002']).map((c) => c.id), ['AC-002'])
  const tables = inventoryOf(fixture('prd-formats/hve-privacy-planner-prd.md'))
  assert.deepEqual(criteriaFor(tables, ['FR-003', 'NFR-001']).map((c) => c.id), ['AC-003'])
})
