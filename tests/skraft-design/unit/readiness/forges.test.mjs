import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pipelineHost } from '../support/pipeline-host.mjs'
import { createReadiness } from '../../../../plugins/skraft-design/engine/application/architecture/readiness.mjs'
import { createDesignRun } from '../../../../plugins/skraft-design/engine/application/architecture/design-run.mjs'
import { createArchitectureForge } from '../../../../plugins/skraft-design/engine/infrastructure/architecture/forge.mjs'

const MARKER = '<!-- skraft-design:research:v1 -->'
const azureStory = (project = 'Store', state = 'Active') => ({ id: 42, fields: {
  'System.Title': 'Pay for order', 'System.WorkItemType': 'User Story', 'System.TeamProject': project,
  'System.Description': '<p>Pay once.</p>', 'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>AC-1: receipt visible.</p>', 'System.State': state, 'System.Tags': 'payments',
} })
const forge = (kind, { project = 'Store', azureItems, host = 'github.com', state = 'open' } = {}) => {
  const calls = []
  const commandRunner = { run: async ({ argv, timeoutMs }) => {
    calls.push(argv)
    assert.ok(timeoutMs > 0)
    let value
    if (argv.join(' ') === 'git remote') value = 'origin'
    else if (argv.slice(0, 3).join(' ') === 'git remote get-url') value = 'https://dev.azure.com/team/Store/_git/api'
    else if (argv[0] === 'gh') value = { number: 42, title: 'Pay for order', body: 'Pay once.\r\nAC-1: receipt visible.', state, labels: [] }
    else if (argv.includes('--resource=connectionData')) value = { authenticatedUser: { id: 'my-identity' } }
    else if (argv.includes('--resource=comments')) value = { comments: [
      { id: 1, createdBy: { id: 'my-identity' }, text: `${MARKER}\nMy earlier research.` },
      { id: 2, createdBy: { id: 'another-identity' }, text: `${MARKER}\nNot my research.` },
    ] }
    else if (argv.slice(0, 4).join(' ') === 'az boards work-item show') value = azureItems?.[Number(argv.find((argument) => argument.startsWith('--id=')).slice(5))] ?? azureStory(project)
    else throw new Error(`Unexpected command ${JSON.stringify(argv)}`)
    return { started: true, exitCode: 0, stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '' }
  } }
  const codeHost = { unavailable: async () => null, repository: async () => kind === 'github' ? { host, repository: 'team/store' } : null }
  return { calls, architectureForge: createArchitectureForge({ commandRunner, codeHost, forge: kind }) }
}

for (const kind of ['github', 'azure-devops']) {
  test(`${kind} readiness reads the configured forge without falling back to another client`, async () => {
    const { calls, architectureForge } = forge(kind)
    const scope = await createReadiness({ architectureForge }).check({ issue: 42 })
    assert.equal(scope.ok, true, scope.reason)
    assert.equal(scope.stories[0].forge, kind)
    assert.match(scope.stories[0].body, /AC-1: receipt visible/)
    assert.equal(calls.some(([program]) => program === (kind === 'github' ? 'az' : 'gh')), false)
  })
}

test('GitHub Enterprise architecture identity includes its host', async () => {
  const { architectureForge } = forge('github', { host: 'forge.example.test' })
  const scope = await createReadiness({ architectureForge }).check({ issue: 42 })
  assert.equal(scope.ok, true, scope.reason)
  assert.equal(scope.stories[0].repository, 'forge.example.test/team/store')
})

test('a closed GitHub issue is refused even when status/ready is absent or present', async () => {
  const { architectureForge } = forge('github', { state: 'closed' })
  const result = await createReadiness({ architectureForge }).check({ issue: 42 })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'issue-not-open')
})

test('Azure DevOps refuses a work item from another project', async () => {
  const { architectureForge } = forge('azure-devops', { project: 'Another project' })
  const result = await createReadiness({ architectureForge }).check({ issue: 42 })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'forge-unreadable')
})

test('Azure DevOps excludes a closed work item without relying on tags', async () => {
  const { architectureForge } = forge('azure-devops', { azureItems: { 42: azureStory('Store', 'Closed') } })
  const result = await createReadiness({ architectureForge }).check({ issue: 42 })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'issue-not-open')
})

test('an Azure design restart reuses only the authenticated author\'s research comment', async () => {
  const host = pipelineHost({ slug: 'issue-42', forge: 'azure-devops', config: { forge: 'azure-devops' } })
  const { architectureForge } = forge('azure-devops')
  const run = createDesignRun({ ...host.deps, architectureForge, architectureRepository: { branch: async () => ({ ok: true }) } })
  const started = await run.start({ issue: 42 })
  assert.equal(started.status, 'ready', started.reason)
  assert.equal(await host.tracking.read('issue-42', 'plans/prior-research.md'), `${MARKER}\nMy earlier research.`)
})

test('Azure epic discovery includes a native story even when it contains technical tasks', async () => {
  const child = (number) => ({ rel: 'System.LinkTypes.Hierarchy-Forward', url: `https://dev.azure.com/team/Store/_apis/wit/workItems/${number}` })
  const { calls, architectureForge } = forge('azure-devops', { azureItems: {
    1: { ...azureStory(), id: 1, fields: { ...azureStory().fields, 'System.WorkItemType': 'Epic' }, relations: [child(42)] },
    42: { ...azureStory(), relations: [child(43)] },
  } })
  const scope = await createReadiness({ architectureForge }).check({ epic: 1 })
  assert.equal(scope.ok, true, scope.reason)
  assert.deepEqual(scope.stories.map(({ number }) => number), [42])
  assert.equal(calls.some((argv) => argv.includes('--id=43')), false)
})
