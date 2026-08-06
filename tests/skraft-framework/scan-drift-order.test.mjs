import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanDrift } from '../../scripts/scan-drift.mjs'

const orchestratorAgent = `---
name: skraft-orchestrator
description: "x"
agents:
  - backlog-discoverer
  - backlog-discoverer-reviewer
metadata:
  phases:
    - DISCOVER
  skills:
    - skraft-difficulty-routing
---
`

const discovererAgent = `---
name: backlog-discoverer
description: "x"
metadata:
  skills:
    - github-search-protocol
    - issue-triage
---
`

const discovererReviewerAgent = `---
name: backlog-discoverer-reviewer
description: "x"
metadata:
  skills:
    - discovery-review-criteria
---
`

const bookYml = `meta:
  basename_exceptions: []
parts:
  - id: reference
    diataxis_mode: reference
    sections:
      - id: agents
        pages:
          - id: agents-index
            type: derived
            sidebar_position: 1
            fr: fr/reference/agents/index.md
            en: en/reference/agents/index.md
      - id: skills
        pages:
          - id: skills-index
            type: derived
            sidebar_position: 1
            fr: fr/reference/skills/index.md
            en: en/reference/skills/index.md
`

const agentsIndex = `---
layout: doc
lang: fr
title: "Agents"
sidebar_position: 1
---

| Usage order | Phase | Producing agent | Reviewer |
| --- | --- | --- | --- |
| 0 | (meta) | [skraft-orchestrator](skraft-orchestrator.html) | — |
| 1 | DISCOVER | [backlog-discoverer](backlog-discoverer.html) | [backlog-discoverer-reviewer](backlog-discoverer-reviewer.html) |
`

const skillsIndex = ({ wrongOrder }) => {
  if (!wrongOrder) {
    return `---
layout: doc
lang: en
title: "Skills"
sidebar_position: 1
---

### 0) Single entry point — [skraft-orchestrator]({{ "/en/reference/agents/skraft-orchestrator" | relative_url }})
- **[skraft-difficulty-routing](skraft-difficulty-routing.html)** — x

### 1) DISCOVER — [backlog-discoverer]({{ "/en/reference/agents/backlog-discoverer" | relative_url }})
- **[github-search-protocol](github-search-protocol.html)** — x
- **[issue-triage](issue-triage.html)** — x

### 2) DISCOVER review — [backlog-discoverer-reviewer]({{ "/en/reference/agents/backlog-discoverer-reviewer" | relative_url }})
- **[discovery-review-criteria](discovery-review-criteria.html)** — x
`
  }
  return `---
layout: doc
lang: en
title: "Skills"
sidebar_position: 1
---

### 1) DISCOVER — [backlog-discoverer]({{ "/en/reference/agents/backlog-discoverer" | relative_url }})
- **[github-search-protocol](github-search-protocol.html)** — x
- **[issue-triage](issue-triage.html)** — x

### 0) Single entry point — [skraft-orchestrator]({{ "/en/reference/agents/skraft-orchestrator" | relative_url }})
- **[skraft-difficulty-routing](skraft-difficulty-routing.html)** — x

### 2) DISCOVER review — [backlog-discoverer-reviewer]({{ "/en/reference/agents/backlog-discoverer-reviewer" | relative_url }})
- **[discovery-review-criteria](discovery-review-criteria.html)** — x
`
}

async function withFixture({ wrongOrder }) {
  const root = await mkdtemp(join(tmpdir(), 'scan-drift-order-'))
  const siteRoot = join(root, 'docs/site')
  const paths = [
    'docs/site/_data',
    'docs/site/fr/reference/agents',
    'docs/site/en/reference/agents',
    'docs/site/fr/reference/skills',
    'docs/site/en/reference/skills',
    'plugins/skraft-framework/agents',
  ]
  await Promise.all(paths.map((p) => mkdir(join(root, p), { recursive: true })))

  await writeFile(join(root, 'docs/site/_data/book.yml'), bookYml)
  await writeFile(join(root, 'docs/site/fr/reference/agents/index.md'), agentsIndex)
  await writeFile(join(root, 'docs/site/en/reference/agents/index.md'), agentsIndex.replace('lang: fr', 'lang: en'))
  await writeFile(join(root, 'docs/site/fr/reference/skills/index.md'), skillsIndex({ wrongOrder }))
  await writeFile(join(root, 'docs/site/en/reference/skills/index.md'), skillsIndex({ wrongOrder }))

  await writeFile(join(root, 'plugins/skraft-framework/agents/skraft-orchestrator.agent.md'), orchestratorAgent)
  await writeFile(join(root, 'plugins/skraft-framework/agents/backlog-discoverer.agent.md'), discovererAgent)
  await writeFile(join(root, 'plugins/skraft-framework/agents/backlog-discoverer-reviewer.agent.md'), discovererReviewerAgent)

  return {
    root,
    siteRoot,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  }
}

test('scan-drift emits order-drift when skills index order does not match live agent usage order', async () => {
  const fixture = await withFixture({ wrongOrder: true })
  try {
    const ledger = scanDrift({
      bookPath: join(fixture.root, 'docs/site/_data/book.yml'),
      root: fixture.root,
      siteRoot: fixture.siteRoot,
      emptyThreshold: 1,
    })
    const drift = ledger.items.find((it) => it.type === 'order-drift')
    assert.ok(drift, 'expected an order-drift item')
    assert.match(drift.detail, /skills\/index section order mismatch/)
  } finally {
    await fixture.cleanup()
  }
})

test('scan-drift emits no order-drift when agents and skills indexes match live order', async () => {
  const fixture = await withFixture({ wrongOrder: false })
  try {
    const ledger = scanDrift({
      bookPath: join(fixture.root, 'docs/site/_data/book.yml'),
      root: fixture.root,
      siteRoot: fixture.siteRoot,
      emptyThreshold: 1,
    })
    assert.equal(
      ledger.items.some((it) => it.type === 'order-drift'),
      false,
      'did not expect an order-drift item'
    )
  } finally {
    await fixture.cleanup()
  }
})
