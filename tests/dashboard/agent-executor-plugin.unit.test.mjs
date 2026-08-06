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

  it('allows reads and rejects write or shell requests in the pilot', () => {
    deepStrictEqual(pilotPermissionHandler({ kind: 'read' }), { kind: 'approve-once' })
    strictEqual(pilotPermissionHandler({ kind: 'write' }).kind, 'reject')
    strictEqual(pilotPermissionHandler({ kind: 'shell' }).kind, 'reject')
  })

})
