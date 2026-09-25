import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { renderReport } from '../../../plugins/skraft-framework/src/application/render-report.mjs'

// Application boundary only. readTemplate is an internal injected IO port, not
// a user-configurable template path. Golden files freeze pre-extraction output;
// never regenerate expected Markdown during a test run.
const fixtureRoot = new URL('./fixtures/qa-templates/', import.meta.url)
const pluginRoot = new URL('../../../plugins/skraft-framework/', import.meta.url)
const fixtureText = (name) => readFileSync(new URL(name, fixtureRoot), 'utf8')
const hashText = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const revision = '1234567890abcdef1234567890abcdef12345678'
const templatePath = (kind) => `skills/qa-reporting/assets/templates/${kind}.md`

function fixture(kind = 'forecast', language = 'en') {
  const data = {
    kind, language, story: 'basket', title: 'Keep the basket', revision,
    impact: {
      expected: 'Customers can retry with their basket.',
      actual: 'Basket retained locally; deployment not recorded.',
    },
    criteria: [{ id: 'AC-1', description: 'Retain the basket',
      test: 'tests/basket.test.mjs', evidence: 'qa/tests.stdout' }],
    testPlanRef: 'qa/plan.md', qualityEvidenceRef: 'qa/quality.json',
    reviewRef: 'qa/review.md', changeLogRef: 'qa/changes.md',
    limitations: ['Provider outage recovery is not covered.'],
    media: [{ label: 'Basket screenshot', path: 'qa/basket.png' }], maxMedia: 1,
  }
  const stdout = 'One basket test passed.\n'
  const files = new Map([
    ['qa/plan.md', '# Approved plan\n\n- Retry payment with the saved basket.'],
    ['qa/review.md', '# Review\n\nNEEDS_REWORK: remaining gates are not recorded.'],
    ['qa/changes.md', '# Changes\n\n- Retain basket in src/basket.mjs.'],
    ['qa/tests.stdout', stdout], ['qa/tests.exit', '0\n'],
    ['qa/quality.json', JSON.stringify({
      $schema: 'quality-gates-evidence/v3', story: data.story,
      repo_root_rev: revision, produced_at: '2026-09-19T10:00:00Z',
      producer: 'software-engineer', tech_adapter: 'fixture-runner',
      commits_covered: [], test_integrity: { cycles: [] },
      gates: [{ id: 'G1', label: 'Basket test', status: 'pass',
        command_executed: 'node --test tests/basket.test.mjs',
        stdout_ref: 'qa/tests.stdout', exit_code_ref: 'qa/tests.exit',
        stdout_sha256: hashText(stdout), stdout_tail: stdout,
        metrics: { tests_total: 1, tests_passed: 1, tests_failed: 0 } }],
    })],
  ])
  return { data, ports: { readText: (ref) => files.get(ref), hashText } }
}

for (const kind of ['forecast', 'outcome']) {
  for (const language of ['en', 'fr']) {
    test(`${language} ${kind} default Markdown stays byte-identical to pre-extraction golden`, () => {
      const { data, ports } = fixture(kind, language)
      // Lazy read: current renderer ignores this port. After extraction this
      // exercises the actual bundled file, not a duplicated test-side default.
      const markdown = renderReport(data, { ...ports,
        readTemplate: (ref) => readFileSync(new URL(ref, pluginRoot), 'utf8'),
      })
      assert.equal(markdown, fixtureText(`${kind}.${language}.golden.md`))
    })
  }

  test(`${kind} selects its fixed plugin-relative template through the internal port`, () => {
    const { data, ports } = fixture(kind)
    const calls = []
    const markdown = renderReport(data, { ...ports, readTemplate(ref) {
      calls.push(ref)
      return 'Template selected.\n'
    } })
    assert.deepEqual(calls, [templatePath(kind)])
    assert.equal(markdown, 'Template selected.\n')
  })

  test(`${kind} composes separate factual view slots using the supplied fixture layout`, () => {
    const { data, ports } = fixture(kind)
    const template = fixtureText(`${kind}.template.md`)
    const markdown = renderReport(data, { ...ports, readTemplate: () => template })
    assert.ok(markdown.startsWith('QA fixture layout\n'), 'injected layout must replace hardcoded report layout')
    const slot = (name) => {
      const match = new RegExp(`BEGIN ${name}\\n([\\s\\S]*?)\\nEND ${name}`).exec(markdown)
      assert.ok(match, `template must retain delimiters for ${name}`)
      return match[1]
    }
    assert.equal(slot('title'), data.title)
    assert.equal(slot('kind'), kind === 'forecast' ? 'Forecast report' : 'Outcome report')
    assert.equal(slot('identity'), `${data.story} | ${revision}`)
    assert.equal(slot('expectedImpact'), data.impact.expected)
    assert.match(slot('traceability'), /\| AC-1 \| Retain the basket \| tests\/basket\.test\.mjs \|/)
    assert.match(slot('traceability'), kind === 'forecast' ? /PLANNED/ : /UNVERIFIED/)
    assert.match(slot('limitations'), /Provider outage recovery is not covered\./)
    assert.match(slot('media'), /Basket screenshot: qa\/basket\.png local-only; not remotely accessible/)
    if (kind === 'forecast') {
      assert.match(slot('testPlan'), /Retry payment with the saved basket\./)
      assert.doesNotMatch(markdown, /Basket retained locally|NEEDS_REWORK/)
    } else {
      assert.equal(slot('actualImpact'), data.impact.actual)
      assert.match(slot('gates'), /\| G1 \| Basket test \| pass \|/)
      assert.match(slot('gates'), /tests_passed: 1/)
      assert.match(slot('gates'), /\| G2 \|\s*\| UNVERIFIED \|/)
      assert.match(slot('review'), /NEEDS_REWORK: remaining gates are not recorded\./)
      assert.match(slot('changes'), /Retain basket in src\/basket\.mjs\./)
    }
    const changed = renderReport(data, { ...ports,
      readTemplate: () => template.replace('QA fixture layout', 'Changed fixture layout'),
    })
    assert.equal(changed, markdown.replace('QA fixture layout', 'Changed fixture layout'))
  })

  for (const missing of ['undefined', 'ENOENT']) {
    test(`${kind} missing template (${missing}) fails instead of falling back to built-in Markdown`, () => {
      const { data, ports } = fixture(kind)
      const error = Object.assign(new Error(`Missing template: ${templatePath(kind)}`), { code: 'ENOENT' })
      assert.throws(() => renderReport(data, { ...ports, readTemplate() {
        if (missing === 'ENOENT') throw error
        return undefined
      } }), missing === 'ENOENT' ? (thrown) => thrown === error : /template/i)
    })
  }
}

test('invalid kind is rejected before any template or source read', () => {
  const { data, ports } = fixture()
  const calls = []
  assert.throws(() => renderReport({ ...data, kind: '../outcome' }, { ...ports,
    readTemplate: (ref) => { calls.push(['template', ref]); return 'Unexpected template' },
    readText: (ref) => { calls.push(['source', ref]); return undefined },
  }), /Invalid report kind/)
  assert.deepEqual(calls, [])
})