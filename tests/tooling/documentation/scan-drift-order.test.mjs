import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanDrift } from '../../../scripts/scan-drift.mjs'

// Filename stems are stable IDs; front-matter names are display labels. This
// deliberately underivable label proves topology resolution reads descriptors.
const RESEARCHER_LABEL = 'Agent 7 / Evidence Cartographer'

const FR_DOCS = 'docs/website/i18n/fr/docusaurus-plugin-content-docs/current'
const EN_DOCS = 'docs/website/docs'

const bookYml = ({ retire = false, guides = false } = {}) => `meta:
  title_en: Book
sources:
  agents: "plugins/skraft-framework/com.github.copilot/agents/*.agent.md"
  workers: "plugins/skraft-framework/com.github.copilot/agents/*-worker.agent.md"
  lenses: "plugins/skraft-framework/com.github.copilot/agents/*.agent.md"
  skills: "plugins/skraft-framework/skills/*/SKILL.md"
parts:
  - id: reference
    diataxis_mode: reference
    sections:
      - id: catalogue
        title_fr: Catalogue
        title_en: Catalogue
        ownership: dashboard
        source_families: [agents, skills, workers, lenses]
${retire ? `        retire:\n          - "${FR_DOCS}/reference/agents/*.md"\n` : ''}        pages:
          - id: dashboard
            type: dashboard
            sidebar_position: 1
            doc: reference/catalogue
${guides ? `  - id: how-to
    diataxis_mode: how-to
    pages:
      - id: install-on-a-host
        type: editorial
        doc: how-to/install-on-a-host
      - id: run-gates
        type: editorial
        doc: how-to/run-gates
` : ''}`

const orchestratorAgent = `---
name: Engineering entry
user-invocable: true
agents:
  - ${RESEARCHER_LABEL}
metadata:
  phases:
    - RESEARCH
  skills:
    - routing
---
`

const researcherAgent = `---
name: ${RESEARCHER_LABEL}
metadata:
  phase: RESEARCH
  dispatched_by: Engineering entry
  skills:
    - routing
---
`

const productAgent = (name) => `---
name: ${name}
userInvocable: true
metadata:
  skills:
    - routing
---
`

async function withFixture({ brokenParent = false, retire = false, enDashboardBody = '', frDashboardBody = '', workflow = null, guides = null } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'scan-drift-topology-'))
  const siteRoot = join(root, 'docs/website')
  const directories = [
    `${FR_DOCS}/reference`,
    `${EN_DOCS}/reference`,
    'plugins/skraft-framework/com.github.copilot/agents',
    'plugins/skraft-framework/skills/routing',
  ]
  await Promise.all(directories.map((path) => mkdir(join(root, path), { recursive: true })))

  await writeFile(join(root, 'docs/website/book.yml'), bookYml({ retire, guides: guides !== null }))
  await writeFile(join(root, FR_DOCS, 'reference/catalogue.md'), `---\ntitle: Catalogue\n---\n${frDashboardBody}`)
  await writeFile(join(root, EN_DOCS, 'reference/catalogue.md'), `---\ntitle: Catalogue\n---\n${enDashboardBody}`)
  for (const file of guides ?? []) {
    await mkdir(join(root, file, '..'), { recursive: true })
    await writeFile(join(root, file), '---\ntitle: Guide\n---\n# Guide\n')
  }
  await writeFile(join(root, 'plugins/skraft-framework/skills/routing/SKILL.md'), '---\nname: routing\n---\n')
  await writeFile(join(root, 'plugins/skraft-framework/com.github.copilot/agents/skraft-orchestrator.agent.md'), orchestratorAgent)
  await writeFile(join(root, 'plugins/skraft-framework/com.github.copilot/agents/solution-researcher.agent.md'), brokenParent ? researcherAgent.replace('Engineering entry', 'Missing dispatcher') : researcherAgent)
  await writeFile(join(root, 'plugins/skraft-framework/com.github.copilot/agents/backlog-discoverer.agent.md'), productAgent('Product discovery'))
  await writeFile(join(root, 'plugins/skraft-framework/com.github.copilot/agents/backlog-planner.agent.md'), productAgent('Product planning'))

  if (workflow) {
    // an agent a dynamic workflow dispatches; the workflow is declared by another plugin's Copilot extension
    await writeFile(join(root, 'plugins/skraft-framework/com.github.copilot/agents/story-slicer.agent.md'), `---\nname: story-slicer\nmetadata:\n  dispatched_by: prd-workflow\n---\n`)
    const extension = join(root, 'plugins/skraft-backlog/com.github.copilot/extensions/prd-workflow')
    await mkdir(extension, { recursive: true })
    await writeFile(join(extension, 'copilot-extension.json'), JSON.stringify({ name: workflow, version: 1 }))
  }

  if (retire) {
    await mkdir(join(root, FR_DOCS, 'reference/agents'), { recursive: true })
    await writeFile(join(root, FR_DOCS, 'reference/agents/old-agent.md'), '# Retired catalogue page\n')
  }

  return {
    root,
    siteRoot,
    ledger: () => scanDrift({
      bookPath: join(root, 'docs/website/book.yml'),
      root,
      siteRoot,
      emptyThreshold: 1,
    }),
    cleanup: async () => rm(root, { recursive: true, force: true }),
  }
}

test('scan-drift covers dashboard source families without per-item Markdown pages', async () => {
  const fixture = await withFixture()
  try {
    const ledger = fixture.ledger()
    assert.equal(ledger.items.some(({ type }) => type === 'orphan-source'), false)
    assert.equal(ledger.items.some(({ type }) => type === 'missing-page'), false)
    assert.equal(ledger.items.some(({ type }) => type === 'empty-page'), false)
    assert.equal(ledger.items.some(({ type }) => type === 'catalogue-topology'), false)
  } finally {
    await fixture.cleanup()
  }
})

test('scan-drift reads a doc in docs/ and in the French i18n tree, .md or .mdx, and reports a page one locale lacks as a parity break', async () => {
  const fixture = await withFixture({
    guides: [`${EN_DOCS}/how-to/install-on-a-host.mdx`, `${FR_DOCS}/how-to/install-on-a-host.mdx`, `${EN_DOCS}/how-to/run-gates.md`],
  })
  try {
    const items = fixture.ledger().items.filter(({ type }) => ['parity-break', 'missing-page'].includes(type))
    assert.deepEqual(items.map(({ type, severity, lang, doc, fr, en }) => ({ type, severity, lang, doc, fr, en })), [
      {
        type: 'parity-break', severity: 'high', lang: 'fr', doc: 'how-to/run-gates',
        fr: `${FR_DOCS}/how-to/run-gates.md`, en: `${EN_DOCS}/how-to/run-gates.md`,
      },
    ])
  } finally {
    await fixture.cleanup()
  }
})

test('scan-drift reports a declared doc with no file in either locale as one missing page', async () => {
  const fixture = await withFixture({ guides: [`${EN_DOCS}/how-to/install-on-a-host.md`, `${FR_DOCS}/how-to/install-on-a-host.md`] })
  try {
    const items = fixture.ledger().items.filter(({ type }) => ['parity-break', 'missing-page'].includes(type))
    assert.deepEqual(items.map(({ type, lang, doc, detail }) => ({ type, lang, doc, detail })), [
      { type: 'missing-page', lang: 'both', doc: 'how-to/run-gates', detail: 'The doc how-to/run-gates is declared in book.yml but has no file in either locale.' },
    ])
  } finally {
    await fixture.cleanup()
  }
})

test('scan-drift resolves an underivable dispatch label through descriptors', async () => {
  const fixture = await withFixture()
  try {
    const ledger = fixture.ledger()
    assert.equal(
      ledger.items.some(({ detail }) => detail?.includes('DISPATCH_TARGET_MISSING')),
      false,
      'display labels must resolve to stable descriptor IDs',
    )
  } finally {
    await fixture.cleanup()
  }
})

test('scan-drift promotes broken topology to a blocker', async () => {
  const fixture = await withFixture({ brokenParent: true })
  try {
    const ledger = fixture.ledger()
    const blocker = ledger.items.find(({ type, detail }) => type === 'catalogue-topology' && detail.includes('DISPATCH_PARENT_MISSING'))
    assert.ok(blocker)
    assert.equal(blocker.severity, 'blocker')
  } finally {
    await fixture.cleanup()
  }
})

test('scan-drift reports no topology drift for an agent a declared dynamic workflow dispatches, and a blocker when none declares it', async () => {
  const declared = await withFixture({ workflow: 'prd-workflow' })
  const undeclared = await withFixture({ workflow: 'another-workflow' })
  try {
    assert.deepEqual(declared.ledger().items.filter(({ type }) => type === 'catalogue-topology').map(({ detail }) => detail), [])
    const blocker = undeclared.ledger().items.find(({ type, detail }) => type === 'catalogue-topology' && detail.includes('DISPATCH_PARENT_MISSING'))
    assert.equal(blocker?.severity, 'blocker', 'a dispatcher nothing declares stays a blocker')
  } finally {
    await declared.cleanup()
    await undeclared.cleanup()
  }
})

test('scan-drift identifies superseded catalogue pages for controlled retirement', async () => {
  const fixture = await withFixture({ retire: true })
  try {
    const item = fixture.ledger().items.find(({ type }) => type === 'catalogue-retirement')
    assert.ok(item)
    assert.match(item.detail, /1 superseded catalogue Markdown page/)
    assert.deepEqual([item.pageId, item.doc, item.fr, item.en], [
      'dashboard', 'reference/catalogue', `${FR_DOCS}/reference/catalogue.md`, `${EN_DOCS}/reference/catalogue.md`,
    ])
  } finally {
    await fixture.cleanup()
  }
})

test('scan-drift flags retired catalogue index and item links', async () => {
  const fixture = await withFixture({
    enDashboardBody: '[Agents](/en/reference/agents/) and [lens](/en/reference/lenses/test-integrity-lens.html)',
  })
  try {
    const item = fixture.ledger().items.find(({ type }) => type === 'legacy-link')
    assert.ok(item)
    assert.match(item.detail, /\/en\/reference\/agents\//)
    assert.match(item.detail, /\/en\/reference\/lenses\/test-integrity-lens\.html/)
  } finally {
    await fixture.cleanup()
  }
})

test('scan-drift blocks retired five-phase orchestration narratives', async () => {
  const fixture = await withFixture({
    frDashboardBody: 'Le pipeline suit 5 phases : DISCOVER → DISCUSS → DESIGN → DISTILL → DELIVER.',
  })
  try {
    const item = fixture.ledger().items.find(({ type }) => type === 'narrative-orchestration')
    assert.ok(item)
    assert.equal(item.severity, 'blocker')
  } finally {
    await fixture.cleanup()
  }
})
