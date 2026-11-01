import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  archiveDropdownItem,
  archiveFooterItem,
  inEachLocale,
} from '../../../docs/website/src/config/beside-links.mjs'

test('the v1 archive keeps the site base URL, with no locale, from the version dropdown', () => {
  const item = archiveDropdownItem({ baseUrl: '/skraft-plugin/', path: 'v1.15.3/', label: '1.15 (archived)' })
  assert.deepEqual(item, {
    type: 'html',
    value: '<a class="dropdown__link" href="/skraft-plugin/v1.15.3/">1.15 (archived)</a>',
  })
})

test('the v1 archive keeps the site base URL, with no locale, from the footer, under a translated label', () => {
  const item = archiveFooterItem({ baseUrl: '/skraft-plugin/', path: 'v1/', label: 'Archive v1 <"&">' })
  assert.deepEqual(item, {
    html: '<a class="footer__link-item" href="/skraft-plugin/v1/">Archive v1 &lt;&quot;&amp;&quot;&gt;</a>',
  })
})

test('a static file is linked without the base URL, so each locale build adds its own', () => {
  assert.equal(inEachLocale('dashboard/'), 'pathname:///dashboard/')
  assert.equal(inEachLocale('skraft-basic-presentation.html'), 'pathname:///skraft-basic-presentation.html')
})
