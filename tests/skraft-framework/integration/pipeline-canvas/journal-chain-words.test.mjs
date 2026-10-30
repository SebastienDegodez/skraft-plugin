// What the Journal tab says of the hash chain, for a journal this machine verifies in full and for
// one adopted from another machine, whose first lines stay unverified.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderJournal } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/canvas-ui/view.js'

const journal = (chain) => ({ slug: 'checkout', chain: { state: 'verified', reason: '', ...chain }, entries: [], total: 0 })
const detail = (chain, lang) => /<span class="chain-detail">(.*?)<\/span>/.exec(renderJournal(journal(chain), lang))?.[1]

test('a journal this machine verifies in full is said chained and signed on every line', () => {
  assert.equal(detail({ lines: 19, unverified: 0 }, 'en'), '19 lines, each chained to the one before and signed.')
  assert.equal(detail({ lines: 19, unverified: 0 }, 'fr'), '19 lignes, chacune chaînée à la précédente et signée.')
})

test('an adopted journal is never said signed on every line: its first lines stay unverified, the ones written here are signed', () => {
  assert.equal(detail({ lines: 13, unverified: 12 }, 'en'), '13 lines, each chained to the one before. The first 12 were written before this machine adopted the journal: their signature stays unverified. Written on this machine since, signed and verified: 1.')
  assert.equal(detail({ lines: 15, unverified: 12 }, 'en'), '15 lines, each chained to the one before. The first 12 were written before this machine adopted the journal: their signature stays unverified. Written on this machine since, signed and verified: 3.')
  assert.equal(detail({ lines: 13, unverified: 12 }, 'fr'), '13 lignes, chacune chaînée à la précédente. Les 12 premières ont été écrites avant l’adoption du journal sur cette machine : leur signature reste non vérifiée. Écrites sur cette machine depuis, signées et vérifiées : 1.')
})
