import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanDrift } from '../../scripts/scan-drift.mjs'

// Every agent carries TWO namings and this fixture keeps them deliberately apart, because
// conflating them is what made the scanner permanently wrong in production (issue #150):
//   * the descriptor file stem (backlog-discoverer-reviewer.agent.md) is the identity the
//     handbook links point at;
//   * the front-matter `name` is a display label, and the orchestrator chains by label.
// The earlier fixture wrote `agents:` in slugs, so it exercised a world that does not exist.
const REVIEWER_LABEL = 'Skraft - Backlog Discoverer Reviewer'

// A label that no prefix-stripping / lowercasing rule turns into its file stem. The real
// orchestrator is exactly this shape — `Skraft - Orchestrator` labels
// skraft-orchestrator.agent.md — so the resolver must READ descriptors, never derive.
const UNDERIVABLE_REVIEWER_LABEL = 'Skraft - Backlog Discoverer (Review Lens)'

const orchestratorAgent = (reviewerLabel) => `---
name: Skraft - Orchestrator
description: "x"
agents:
  - Skraft - Backlog Discoverer
  - ${reviewerLabel}
metadata:
  phases:
    - DISCOVER
  skills:
    - skraft-difficulty-routing
---
`

const discovererAgent = `---
name: Skraft - Backlog Discoverer
description: "x"
metadata:
  skills:
    - github-search-protocol
    - issue-triage
---
`

const discovererReviewerAgent = (reviewerLabel) => `---
name: ${reviewerLabel}
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

async function withFixture({ wrongOrder, reviewerLabel = REVIEWER_LABEL }) {
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

  await writeFile(join(root, 'plugins/skraft-framework/agents/skraft-orchestrator.agent.md'), orchestratorAgent(reviewerLabel))
  await writeFile(join(root, 'plugins/skraft-framework/agents/backlog-discoverer.agent.md'), discovererAgent)
  await writeFile(join(root, 'plugins/skraft-framework/agents/backlog-discoverer-reviewer.agent.md'), discovererReviewerAgent(reviewerLabel))

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

// Guards the naming distinction itself: the chain is resolved by reading each descriptor's
// front-matter `name`, not by transforming the label into a slug. Under a derive-the-slug
// scanner this label yields `backlog-discoverer-(review-lens)`, matches no page link, and
// the false order-drift of issue #150 returns.
test('scan-drift resolves the chain through the descriptors, not by slugifying the label', async () => {
  const fixture = await withFixture({ wrongOrder: false, reviewerLabel: UNDERIVABLE_REVIEWER_LABEL })
  try {
    const ledger = scanDrift({
      bookPath: join(fixture.root, 'docs/site/_data/book.yml'),
      root: fixture.root,
      siteRoot: fixture.siteRoot,
      emptyThreshold: 1,
    })
    const drift = ledger.items.find((it) => it.type === 'order-drift')
    assert.equal(drift, undefined, `did not expect an order-drift item, got: ${drift?.detail}`)
  } finally {
    await fixture.cleanup()
  }
})
