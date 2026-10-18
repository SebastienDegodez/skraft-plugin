import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryGit } from '../support/in-memory-host.mjs'
import { API, nominal, scripted, SLUG, TRACKING } from '../support/pipeline-host.mjs'

const SCAN = 'details/2026-10-11/structural-scan.json'
const MANUAL = ['Anti-Corruption Layer', 'Bounded-context split or merge', 'Aggregate crossing an existing boundary']

/** The report's commitments, each as `commitment detected hitCount` and its hits as `path:line text`. @param {any} report */
const found = (report) => report.commitments.map(({ commitment, label, detected, hitCount, hits }) => [
  commitment, label, detected, hitCount, hits.map(({ path, line, text }) => `${path}:${line} ${text}`),
])

const dispatchOf = (host, agent) => [...host.agentRunner.dispatches, ...host.agentRunner.reviewed()].find((dispatch) => dispatch.agent === agent).prompt
const designDocuments = (host) => host.events().find((event) => event.type === 'step.recorded' && event.step === 'design').documents

test('before each attempt of the architect, the engine scans the code the repository holds for the structural commitments; the architect and the design review read the same report', async () => {
  const files = {
    'src/Bus.cs': 'namespace Shop;\npublic interface ICommandBus { }\n',
    'src/Order.cs': '// a Saga one day\nvar label = "EventStream";\n/* QueryBus\n   ProcessManager */\nclass Order { }\n',
    'src/web.ts': 'const t = `Apply(PaidEvent)`;\nconst q = \'IQueryBus\';\nexport class PaymentSaga {}\r\n',
    'src/notes.py': '# ProcessManager later\nx = "IEventStore"\ny = """ICorrelatedBy\nSaga"""\nstream = EventStream()\nz = \'\'\'QueryBus\nApply(PaidEvent)\'\'\'\n',
    'docs/saga.md': 'Saga\n',
    'node_modules/lib/Saga.js': 'class Saga {}\n',
    'src/bin/Saga.cs': 'class Saga {}\n',
  }
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' }, tracked: Object.keys(files) } } })
  const host = scripted({ files, git }, nominal)

  assert.equal((await host.start()).status, 'done')

  const report = JSON.parse(await host.tracking.read(SLUG, SCAN))
  assert.deepEqual(Object.keys(report), ['scannedFiles', 'commitments', 'manualReview'])
  assert.deepEqual([report.scannedFiles, report.manualReview], [4, MANUAL])
  assert.deepEqual(found(report), [
    ['cqrs-bus', 'CQRS + dispatch bus', true, 1, ['src/Bus.cs:2 public interface ICommandBus { }']],
    ['event-sourcing', 'Event Sourcing', true, 1, ['src/notes.py:5 stream = EventStream()']],
    ['saga', 'Saga / Process Manager', true, 1, ['src/web.ts:3 export class PaymentSaga {}']],
  ])
  assert.ok(dispatchOf(host, 'solution-architect').includes(`- Read first:\n- ${TRACKING}/research/2026-10-11/${SLUG}-research.md\n- ${TRACKING}/${SCAN}\n- Fill each output`), dispatchOf(host, 'solution-architect'))
  assert.ok(dispatchOf(host, 'consistency-lens').includes(`${TRACKING}/${SCAN}`), dispatchOf(host, 'consistency-lens'))
  assert.ok(!dispatchOf(host, 'acceptance-designer').includes(SCAN))
  assert.deepEqual(designDocuments(host), ['details/2026-10-11/consistency-matrix-checkout.md', 'details/2026-10-11/context-map.md', SCAN])
})

test('a component in a neighbour repository is scanned in its own repository, its paths from the working copy, twenty hits kept per commitment', async () => {
  const WEB = { name: 'web', root: '../web', stack: 'react', mocking: { strategy: 'inprocess' }, paths: { src: ['src'], tests: ['tests'] }, commands: {} }
  const files = { '../web/src/bus.ts': `${Array.from({ length: 22 }, () => 'bus.send(new QueryBus())').join('\n')}\n` }
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' }, tracked: [] }, '../web': { mergeBases: { main: 'up-web-0' }, tracked: ['src/bus.ts'] } } })
  const host = scripted({ components: [API, WEB], files, git }, nominal)

  await host.start()

  const report = JSON.parse(await host.tracking.read(SLUG, SCAN))
  const [bus] = report.commitments
  assert.deepEqual([report.scannedFiles, bus.hitCount, bus.hits.length], [1, 22, 20])
  assert.deepEqual([bus.hits[0], bus.hits[19].line], [{ path: '../web/src/bus.ts', line: 1, text: 'bus.send(new QueryBus())' }, 20])
})

test('a line kept in the report is cut at 160 characters', async () => {
  const line = `export const bus = new CommandBus() // ${'x'.repeat(200)}`
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' }, tracked: ['src/bus.ts'] } } })
  const host = scripted({ files: { 'src/bus.ts': `${line}\n` }, git }, nominal)

  await host.start()

  const [{ text }] = JSON.parse(await host.tracking.read(SLUG, SCAN)).commitments[0].hits
  assert.equal(text, line.slice(0, 160))
})

test('when Git cannot list a component\'s files, no scan is written and the architect is given none', async () => {
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { main: 'root-0' }, tracked: null } } })
  const host = scripted({ git }, nominal)

  assert.equal((await host.start()).status, 'done')

  assert.equal(await host.tracking.read(SLUG, SCAN), null)
  assert.ok(!dispatchOf(host, 'solution-architect').includes('structural-scan'))
  assert.deepEqual(designDocuments(host), ['details/2026-10-11/consistency-matrix-checkout.md', 'details/2026-10-11/context-map.md'])
})
