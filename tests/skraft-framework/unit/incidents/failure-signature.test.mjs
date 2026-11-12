import { test } from 'node:test'
import assert from 'node:assert/strict'
import { failureSignatureInput } from '../../../../plugins/skraft-framework/engine/domain/pipeline/failure-signature.mjs'

const signature = ({ proof, root, slug }) => failureSignatureInput({ step: 'gates', cause: 'deterministic', proof, root, slug })

test('volatile evidence normalizes across hosts while meaningful errors and line order remain distinct', () => {
  const first = [
    '2026-11-12T15:12:35.398+01:00 PID=782 elapsed 12.3 s commit c0ffee1234567 id 12ab34cd-1234-5678-90ab-cdef12345678 localhost:50321',
    'at 15:12:35.398 Error: ECONNRESET',
    '/Users/alice/project/.copilot-tracking/skraft-plans/run-104/gates/api/test-1.log',
  ].join('\n')
  const second = [
    '2026-11-13T19:47:01.100-04:00 pid:943 elapsed 6 s commit f0ffee1234567 id 89ab34cd-1234-5678-90ab-cdef12345678 localhost:61234',
    'at 19:47:01.100 Error: ECONNRESET',
    'C:\\work\\project\\.copilot-tracking\\skraft-plans\\run-928\\gates\\api\\test-2.log',
  ].join('\n')

  assert.equal(signature({ proof: first, root: '/Users/alice/project', slug: 'run-104' }), signature({ proof: second, root: 'C:\\work\\project', slug: 'run-928' }))
  assert.notEqual(signature({ proof: first.replace('ECONNRESET', 'ECONNREFUSED'), root: '/Users/alice/project', slug: 'run-104' }), signature({ proof: first, root: '/Users/alice/project', slug: 'run-104' }))
  assert.notEqual(signature({ proof: 'first error\nsecond error', root: '', slug: '' }), signature({ proof: 'second error\nfirst error', root: '', slug: '' }))
})
