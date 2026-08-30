import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createRegisterExecutors, pilotPermissionHandler, registerExecutors } from '../../eng/vally-agent-executor/plugin.mjs'

const noOpClient = {
  async start() {},
  async createSession() {
    throw new Error('not called by registration test')
  },
  async stop() {},
}

describe('Vally executor plugin registration', () => {
  it('registers exactly one real-agent executor under the eval suite name', () => {
    const registered = []
    const registry = { register: (executor) => registered.push(executor) }
    const register = createRegisterExecutors({
      repoRoot: '/repo',
      createClient: () => noOpClient,
      permissionHandler: () => ({ kind: 'reject' }),
      computeMetrics: () => ({}),
    })

    register(registry)

    strictEqual(registered.length, 1)
    strictEqual(registered[0].name, 'skraft-agent-runner')
    strictEqual(typeof registered[0].execute, 'function')
    strictEqual(typeof registered[0].shutdown, 'function')
    strictEqual(typeof registerExecutors, 'function')
  })

  it('allows reads inside the prepared workspace and rejects write or shell requests in the pilot', () => {
    const context = { workDir: '/tmp/work', readableRoots: ['/tmp/work', '/tmp/skills/outside-in-tdd'] }

    deepStrictEqual(pilotPermissionHandler({ kind: 'read', path: '/tmp/work/src' }, context), { kind: 'approve-once' })
    deepStrictEqual(pilotPermissionHandler({ kind: 'read', path: 'README.md' }, context), { kind: 'approve-once' })
    deepStrictEqual(
      pilotPermissionHandler({ kind: 'read', path: '/tmp/skills/outside-in-tdd/SKILL.md' }, context),
      { kind: 'approve-once' },
    )
    strictEqual(pilotPermissionHandler({ kind: 'read', path: '/repo/plugins' }, context).kind, 'reject')
    strictEqual(pilotPermissionHandler({ kind: 'read' }, context).kind, 'reject')
    strictEqual(pilotPermissionHandler({ kind: 'write' }, context).kind, 'reject')
    strictEqual(pilotPermissionHandler({ kind: 'shell' }, context).kind, 'reject')
  })

  it('allows only workspace-local writes and local toolchain commands for delivery stimuli', () => {
    const context = {
      stimulus: { tags: { permissions: 'workspace-write' } },
      workDir: '/tmp/work',
    }

    deepStrictEqual(
      pilotPermissionHandler({ kind: 'write', fileName: '/tmp/work/src/domain.mjs' }, context),
      { kind: 'approve-once' },
    )
    strictEqual(pilotPermissionHandler({ kind: 'write', fileName: '/tmp/outside.mjs' }, context).kind, 'reject')
    deepStrictEqual(
      pilotPermissionHandler({
        kind: 'shell',
        commands: [{ identifier: 'dotnet test CheckoutPricing.slnx --no-restore', readOnly: true }],
        commandSegments: [
          { identifier: 'dotnet test', fullCommandText: 'dotnet test CheckoutPricing.slnx --no-restore' },
          { identifier: 'tail', fullCommandText: 'tail -30' },
        ],
        possiblePaths: ['/tmp/work'],
        possibleUrls: [],
        fullCommandText: 'dotnet test CheckoutPricing.slnx --no-restore',
      }, context),
      { kind: 'approve-once' },
    )
    strictEqual(pilotPermissionHandler({
      kind: 'shell',
      commands: [{ identifier: 'dotnet restore CheckoutPricing.slnx', readOnly: false }],
      commandSegments: [{ identifier: 'dotnet restore', fullCommandText: 'dotnet restore CheckoutPricing.slnx' }],
      possiblePaths: ['/tmp/work'],
      possibleUrls: [],
      fullCommandText: 'dotnet restore CheckoutPricing.slnx',
    }, context).kind, 'reject')
    strictEqual(pilotPermissionHandler({
      kind: 'shell',
      commands: [{ identifier: 'curl https://example.com', readOnly: false }],
      commandSegments: [{ identifier: 'curl', fullCommandText: 'curl https://example.com' }],
      possiblePaths: [],
      possibleUrls: [{ url: 'https://example.com' }],
      fullCommandText: 'curl https://example.com',
    }, context).kind, 'reject')
    deepStrictEqual(pilotPermissionHandler({
      kind: 'shell',
      commands: [{ identifier: 'mkdir -p .copilot-tracking/evidence && cat', readOnly: false }],
      commandSegments: [
        { identifier: 'mkdir', fullCommandText: 'mkdir -p .copilot-tracking/evidence' },
        { identifier: 'cat', fullCommandText: 'cat > .copilot-tracking/evidence/result.json' },
        { identifier: 'echo', fullCommandText: 'echo done' },
      ],
      possiblePaths: ['/tmp/work/.copilot-tracking/evidence/result.json'],
      possibleUrls: [],
      fullCommandText: 'mkdir -p .copilot-tracking/evidence && cat > .copilot-tracking/evidence/result.json && echo done',
    }, context), { kind: 'approve-once' })
    deepStrictEqual(pilotPermissionHandler({
      kind: 'shell',
      commandSegments: [{ identifier: 'grep', fullCommandText: "grep -r 'Mock<' src" }],
      possiblePaths: ['/tmp/work/src'],
      possibleUrls: [],
      fullCommandText: "grep -r 'Mock<' src",
    }, context), { kind: 'approve-once' })
    deepStrictEqual(pilotPermissionHandler({
      kind: 'shell',
      commandSegments: [
        { identifier: 'cd', fullCommandText: 'cd /tmp/work' },
        { identifier: 'node', fullCommandText: 'node scripts/render.mjs' },
      ],
      possiblePaths: ['/tmp/work', '/tmp/work/scripts/render.mjs'],
      possibleUrls: [],
      fullCommandText: 'cd /tmp/work && node scripts/render.mjs',
    }, context), { kind: 'approve-once' })
    strictEqual(pilotPermissionHandler({
      kind: 'shell',
      commandSegments: [
        { identifier: 'cd', fullCommandText: 'cd /tmp/outside' },
        { identifier: 'node', fullCommandText: 'node scripts/render.mjs' },
      ],
      possiblePaths: ['/tmp/outside', '/tmp/outside/scripts/render.mjs'],
      possibleUrls: [],
      fullCommandText: 'cd /tmp/outside && node scripts/render.mjs',
    }, context).kind, 'reject')
    deepStrictEqual(pilotPermissionHandler({
      kind: 'shell',
      commandSegments: [{ identifier: 'bash', fullCommandText: 'bash scripts/configure-mutation.sh --root .' }],
      possiblePaths: ['/tmp/work/scripts/configure-mutation.sh'],
      possibleUrls: [],
      fullCommandText: 'bash scripts/configure-mutation.sh --root .',
    }, context), { kind: 'approve-once' })
    strictEqual(pilotPermissionHandler({
      kind: 'shell',
      commandSegments: [{ identifier: 'bash', fullCommandText: 'bash arbitrary.sh' }],
      possiblePaths: ['/tmp/work/arbitrary.sh'],
      possibleUrls: [],
      fullCommandText: 'bash arbitrary.sh',
    }, context).kind, 'reject')
  })

  it('rejects a shell command that names an absolute path outside the workspace', () => {
    const context = {
      stimulus: { tags: { permissions: 'workspace-write' } },
      workDir: '/tmp/work',
    }

    strictEqual(pilotPermissionHandler({
      kind: 'shell',
      commandSegments: [{ identifier: 'find', fullCommandText: 'find /repo/.copilot-tracking -type f' }],
      possiblePaths: [],
      possibleUrls: [],
      fullCommandText: 'find /repo/.copilot-tracking -type f',
    }, context).kind, 'reject')
    deepStrictEqual(pilotPermissionHandler({
      kind: 'shell',
      commandSegments: [{ identifier: 'git', fullCommandText: 'git status --porcelain 2>/dev/null' }],
      possiblePaths: ['/tmp/work'],
      possibleUrls: [],
      fullCommandText: 'git status --porcelain 2>/dev/null',
    }, context), { kind: 'approve-once' })
  })

  // The executor assembles the CLI the descriptors invoke as `$CLAUDE_PLUGIN_ROOT`
  // and passes it as a readable root, so the mandated `node .../state.mjs` is
  // allowed. It stays a READ root: the CLI is not a place the agent may write, and
  // the rest of the filesystem is no more reachable than before.
  it('runs the assembled plugin CLI while keeping everything else out of reach', () => {
    const pluginRoot = '/tmp/skraft-plugin-root-ab12'
    const context = {
      stimulus: { tags: { permissions: 'workspace-write' } },
      workDir: '/tmp/work',
      readableRoots: ['/tmp/work', pluginRoot],
    }

    deepStrictEqual(
      pilotPermissionHandler({ kind: 'read', path: `${pluginRoot}/src/cli/state.mjs` }, context),
      { kind: 'approve-once' },
    )
    deepStrictEqual(pilotPermissionHandler({
      kind: 'shell',
      commandSegments: [{ identifier: 'node', fullCommandText: `node ${pluginRoot}/src/cli/state.mjs get --project checkout-pricing` }],
      possiblePaths: [`${pluginRoot}/src/cli/state.mjs`],
      possibleUrls: [],
      fullCommandText: `node ${pluginRoot}/src/cli/state.mjs get --project checkout-pricing`,
    }, context), { kind: 'approve-once' })

    strictEqual(
      pilotPermissionHandler({ kind: 'write', fileName: `${pluginRoot}/src/cli/state.mjs` }, context).kind,
      'reject',
    )
    strictEqual(pilotPermissionHandler({ kind: 'read', path: '/repo/tests/agents' }, context).kind, 'reject')
    strictEqual(pilotPermissionHandler({
      kind: 'shell',
      commandSegments: [{ identifier: 'cat', fullCommandText: 'cat /repo/tests/agents/backlog-discoverer/eval.yaml' }],
      possiblePaths: [],
      possibleUrls: [],
      fullCommandText: 'cat /repo/tests/agents/backlog-discoverer/eval.yaml',
    }, context).kind, 'reject')
  })

})
