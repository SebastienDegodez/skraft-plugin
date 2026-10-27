import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { CONSENT_VERSIONS } from '../../../../plugins/skraft-framework/engine/domain/decisions/consents.mjs'
import { CONSENT_TEXT, PUBLISH_CONSENT_TEXT } from '../../../../plugins/skraft-framework/engine/domain/decisions/questions.mjs'

const fingerprint = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12)

// A consent's text and its version change together: an acceptance kept for an earlier text is
// asked again only when the version moves. Changing a text breaks this test until its version is
// bumped and the fingerprint below updated with it.
test('each consent question\'s text is pinned to its version', () => {
  assert.deepEqual({
    visuals: { version: CONSENT_VERSIONS.visuals, text: fingerprint(CONSENT_TEXT) },
    pullRequest: { version: CONSENT_VERSIONS.pullRequest, text: fingerprint(PUBLISH_CONSENT_TEXT) },
  }, {
    visuals: { version: 1, text: '98517f38d62f' },
    pullRequest: { version: 2, text: 'b47f63e770b4' },
  })
})
