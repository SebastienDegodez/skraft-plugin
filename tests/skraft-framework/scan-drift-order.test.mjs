import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanDrift } from '../../scripts/scan-drift.mjs'

// Filename stems are stable IDs; front-matter names are display labels. This
// deliberately underivable label proves topology resolution reads descriptors.
const RESEARCHER_LABEL = 'Agent 7 / Evidence Cartographer'

const bookYml = ({ retire = false } = {}) => `meta:
  basename_exceptions: []
sources:
  agents: "plugins/skraft-framework/com.github.copilot/agents/*.agent.md"
  workers: "plugins/skraft-framework/com.github.copilot/agents/workers/*/*.agent.md"
  lenses: "plugins/skraft-framework/com.github.copilot/agents/reviewer-lenses/*.agent.md"
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
${retire ? '        retire:\n          - "docs/site/fr/reference/agents/*.md"\n' : ''}        pages:
          - id: dashboard
            type: dashboard
            sidebar_position: 1
            fr: fr/dashboard/index.md
            en: en/dashboard/index.md
`

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

async function withFixture({ brokenParent = false, retire = false, enDashboardBody = '', frDashboardBody = '' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'scan-drift-topology-'))
  const siteRoot = join(root, 'docs/site')
  const directories = [
    'docs/site/_data',
    'docs/site/fr/dashboard',
    'docs/site/en/dashboard',
    'plugins/skraft-framework/com.github.copilot/agents/workers/demo',
    'plugins/skraft-framework/com.github.copilot/agents/reviewer-lenses',
    'plugins/skraft-framework/skills/routing',
  ]
  await Promise.all(directories.map((path) => mkdir(join(root, path), { recursive: true })))

  await writeFile(join(root, 'docs/site/_data/book.yml'), bookYml({ retire }))
  await writeFile(join(root, 'docs/site/fr/dashboard/index.md'), `---\nlayout: dashboard\nlang: fr\n---\n${frDashboardBody}`)
  await writeFile(join(root, 'docs/site/en/dashboard/index.md'), `---\nlayout: dashboard\nlang: en\n---\n${enDashboardBody}`)
  await writeFile(join(root, 'plugins/skraft-framework/skills/routing/SKILL.md'), '---\nname: routing\n---\n')
  await writeFile(join(root, 'plugins/skraft-framework/com.github.copilot/agents/skraft-orchestrator.agent.md'), orchestratorAgent)
  await writeFile(join(root, 'plugins/skraft-framework/com.github.copilot/agents/solution-researcher.agent.md'), brokenParent ? researcherAgent.replace('Engineering entry', 'Missing dispatcher') : researcherAgent)
  await writeFile(join(root, 'plugins/skraft-framework/com.github.copilot/agents/backlog-discoverer.agent.md'), productAgent('Product discovery'))
  await writeFile(join(root, 'plugins/skraft-framework/com.github.copilot/agents/backlog-planner.agent.md'), productAgent('Product planning'))

  if (retire) {
    await mkdir(join(root, 'docs/site/fr/reference/agents'), { recursive: true })
    await writeFile(join(root, 'docs/site/fr/reference/agents/old-agent.md'), '# Retired catalogue page\n')
  }

  return {
    root,
    siteRoot,
    ledger: () => scanDrift({
      bookPath: join(root, 'docs/site/_data/book.yml'),
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

test('scan-drift identifies superseded catalogue pages for controlled retirement', async () => {
  const fixture = await withFixture({ retire: true })
  try {
    const item = fixture.ledger().items.find(({ type }) => type === 'catalogue-retirement')
    assert.ok(item)
    assert.match(item.detail, /1 superseded catalogue Markdown page/)
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
