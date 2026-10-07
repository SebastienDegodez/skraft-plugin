import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildReportView } from '../../../plugins/skraft-framework/src/domain/reporting-presentation.mjs'

// Domain unit tests: escaping of structured fields, publication filtering of source
// documents (links, fences, controls), media selection and the view fields per kind.
const sha40 = 'e8b963a1f70c4d229e10b348a69f5c71d231809e'
const planRef = 'p/plan.md'

function forecastData(overrides = {}) {
  return {
    kind: 'forecast', story: 'checkout', title: 'Keep the basket', revision: sha40, language: 'en', maxMedia: 5,
    impact: { expected: 'Retry works.' },
    criteria: [], limitations: [], media: [], testPlanRef: planRef,
    ...overrides,
  }
}
const view = (overrides = {}, documents = new Map()) => buildReportView(forecastData(overrides), documents, {}, new Map())
const header = `${planRef} (local source reference; not remotely verified)\n\n`
// The published form of one source document.
function source(content) {
  const { testPlan } = view({}, new Map([[planRef, content]]))
  assert.ok(testPlan.startsWith(header), testPlan)
  return testPlan.slice(header.length)
}
const local = (destination) => `(local source reference: ${destination}; not remotely verified)`
const withheld = '(destination withheld: unsupported or unsafe URL)'

test('structured fields escape Markdown and HTML specials, drop controls and fold newlines', () => {
  assert.equal(view({ title: 'a&b<c>d|e@f[g]h`i*j\\k{l}m' }).title,
    'a&amp;b&lt;c&gt;d&#124;e&#64;f&#91;g&#93;h&#96;i&#42;j&#92;k&#123;l&#125;m')
  assert.equal(view({ title: 'a\u0001b\u007fc' }).title, 'abc')
  assert.equal(view({ title: 'one\ntwo\r\nthree\rfour' }).title, 'one two three four')
})

test('a missing or unreadable source document is reported, not invented', () => {
  assert.equal(view({}).testPlan, `${header}UNVERIFIED: missing or unavailable document`)
  assert.equal(view({ testPlanRef: undefined }).testPlan,
    '(missing reference) (local source reference; not remotely verified)\n\nUNVERIFIED: missing or unavailable document')
})

test('source prose escapes HTML and mentions but keeps Markdown', () => {
  assert.equal(source('# Plan & <b>notes</b> for @team *now*'), '# Plan &amp; &lt;b&gt;notes&lt;/b&gt; for &#64;team *now*')
})

test('source line endings are normalised and controls removed', () => {
  assert.equal(source('a\r\nb\rc\u0001d\u007fe'), 'a\nb\ncde')
})

test('inline links keep safe remote destinations with their titles', () => {
  assert.equal(source('[x](https://e.com)'), '[x](https://e.com/)')
  assert.equal(source('![shot](https://e.com/a.png)'), '![shot](https://e.com/a.png)')
  assert.equal(source('[x](<https://e.com>)'), '[x](https://e.com/)')
  assert.equal(source('[x]( https://e.com )'), '[x](https://e.com/)')
  assert.equal(source('[link text](https://e.com "Title here")'), '[link text](https://e.com/ "Title here")')
  assert.equal(source("[x](https://e.com 'Title here')"), "[x](https://e.com/ 'Title here')")
  assert.equal(source('[x](https://e.com (Title here))'), '[x](https://e.com/ (Title here))')
  assert.equal(source('[x](https://e.com  "Title")'), '[x](https://e.com/ "Title")')
  assert.equal(source('[x](http://e.com/a[b]*c)'), '[x](http://e.com/a%5Bb%5D%2Ac)')
})

test('inline links to local files keep their label and a local note', () => {
  assert.equal(source('[plan](docs/plan.md)'), `plan ${local('docs/plan.md')}`)
  assert.equal(source('![shot](img/a.png)'), `shot ${local('img/a.png')}`)
  assert.equal(source('[x](docs/a:b)'), `x ${local('docs/a:b')}`)
  assert.equal(source('[x](a//b)'), `x ${local('a//b')}`)
  assert.equal(source('[x](<docs/plan.md>)'), `x ${local('docs/plan.md')}`)
  assert.equal(source('[a[b](docs/plan.md)'), `a[b ${local('docs/plan.md')}`)
})

test('inline links to unsupported or unsafe destinations are withheld', () => {
  assert.equal(source('[x](javascript:alert(1))'), `x ${withheld})`)
  assert.equal(source('[x](//e.com/a)'), `x ${withheld}`)
  assert.equal(source('[x](ab>)'), `x ${withheld}`)
  assert.equal(source('[x](<bc)'), `x ${withheld}`)
  assert.equal(source('[x](<https://e.com/a b>)'), `x ${withheld}`)
  assert.equal(source('[x](<>)'), `x ${withheld}`)
  assert.equal(source('[x](https://user@e.com/a)'), `x ${withheld}`)
  assert.equal(source('[x](https://:pw@e.com/a)'), `x ${withheld}`)
  assert.equal(source('[x](xhttps://e.com/a)'), `x ${withheld}`)
})

test('reference definitions keep safe remote destinations and their suffix', () => {
  assert.equal(source('[ref]: https://e.com "Title"'), '[ref]: https://e.com/ "Title"')
  assert.equal(source('   [ref]: <https://e.com>'), '   [ref]: https://e.com/')
})

test('reference definitions to local or unsafe destinations keep the label only', () => {
  assert.equal(source('[ref]: docs/a.md'), `ref: ${local('docs/a.md')}`)
  assert.equal(source('[ref]:docs/a.md'), `ref: ${local('docs/a.md')}`)
  assert.equal(source('[ref]:  docs/a.md'), `ref: ${local('docs/a.md')}`)
  assert.equal(source('[ref]: docs/a.md "Title"'), `ref: ${local('docs/a.md')}`)
  assert.equal(source('[ref]: <docs/a.md>'), `ref: ${local('docs/a.md')}`)
  assert.equal(source('[ref]: javascript:x'), `ref: ${withheld}`)
  assert.equal(source('x [ref]: docs/a.md'), 'x [ref]: docs/a.md')
  assert.equal(source('    [ref]: docs/a.md'), '    [ref]: docs/a.md')
})

test('fenced code keeps code and breaks only markers and mentions', () => {
  assert.equal(source('```js\n<b>@x</b>\n<!-- skraft -->\n```\n@after'),
    '```js\n<b>@​x</b>\n<​!-- skraft -->\n```\n&#64;after')
  assert.equal(source('~~~a`b\n@x\n~~~'), '~~~a`b\n@​x\n~~~')
  assert.equal(source('   ```\n@x\n```'), '```\n@​x\n```')
})

test('a fence closes only on the same character, at least the same length and no info string', () => {
  assert.equal(source('```\n~~~\n@x\n```'), '```\n~~~\n@​x\n```')
  assert.equal(source('````\n```\n@x\n````'), '````\n```\n@​x\n````')
  assert.equal(source('```\n```js\n@x\n```'), '```\n```js\n@​x\n```')
  assert.equal(source('```\n``` \n@x'), '```\n``` \n&#64;x')
})

test('a backtick fence with a backtick info string is prose, not a fence', () => {
  assert.equal(source('```a`b\n@x'), '```a`b\n&#64;x')
})

test('lines that only resemble a fence stay prose', () => {
  assert.equal(source('x ```js\n@x'), 'x ```js\n&#64;x')
  assert.equal(source('`x\n@x'), '`x\n&#64;x')
  assert.equal(source('~x\n@x'), '~x\n&#64;x')
  assert.equal(source('    ```\n@x'), '    ```\n&#64;x')
  assert.equal(source('```js x\n@x'), '```js x\n&#64;x')
})

test('an unclosed source fence is closed before the following sections', () => {
  assert.equal(source('~~~~\n@x'), '~~~~\n@​x\n~~~~')
})

const mediaLines = (media, maxMedia = 5) => view({ media, maxMedia }).media.split('\n')

test('media embeds safe distinct remote URLs up to the selection limit', () => {
  assert.deepEqual(mediaLines([
    { label: 'one', url: 'https://e.com/1.png' },
    { label: 'dup', url: 'https://e.com/1.png' },
    { label: 'two', url: 'http://e.com/2.png', path: 'shots/2.png' },
    { label: 'three', url: 'https://e.com/3.png', path: 'shots/3.png' },
    { label: 'local', path: 'shots/l.png' },
  ], 2), [
    '- [one](https://e.com/1.png)',
    '- dup:  withheld (unsafe URL, duplicate or selection limit)',
    '- [two](http://e.com/2.png)',
    '- three: shots/3.png withheld (unsafe URL, duplicate or selection limit)',
    '- local: shots/l.png local-only; not remotely accessible',
    '3 media omitted.',
  ])
})

test('media URLs must be http(s), credential-free and free of spaces or controls', () => {
  for (const url of ['ftp://e.com/a', 'xhttps://e.com/a', 'https://e.com/a b', 'https://user@e.com/a',
    'https://:pw@e.com/a', 'https://e.com/<a>', ' ']) {
    assert.deepEqual(mediaLines([{ label: 'm', path: 'm.png', url }]),
      ['- m: m.png withheld (unsafe URL, duplicate or selection limit)', '1 media omitted.'], url)
  }
  assert.deepEqual(mediaLines([{ label: 'm', url: 'HTTPS://e.com/a[b]{c}|d' }]),
    ['- [m](https://e.com/a%5Bb%5D%7Bc%7D%7Cd)', '0 media omitted.'])
})

test('forecast view leaves outcome-only sections empty', () => {
  const forecast = view({ limitations: ['first', 'second'], impact: { expected: 'E', actual: 'A' } })
  assert.equal(forecast.kind, 'Forecast report')
  assert.equal(forecast.actualImpact, '')
  assert.equal(forecast.limitations, '- first\n- second')
  for (const field of ['gates', 'review', 'changes', 'aggregateNote', 'reviewNote']) {
    assert.equal(forecast[field], '', field)
  }
})

test('outcome view leaves the test plan empty and marks a missing actual impact', () => {
  const outcome = buildReportView(forecastData({ kind: 'outcome' }), new Map(), { error: 'x' }, new Map())
  assert.equal(outcome.kind, 'Outcome report')
  assert.equal(outcome.testPlan, '')
  assert.equal(outcome.actualImpact, 'UNVERIFIED')
})

test('criterion evidence is resolved against the quality evidence, else shown as declared', () => {
  const data = forecastData({
    kind: 'outcome', qualityEvidenceRef: 'p/evidence/q.json',
    criteria: [
      { id: 'AC-1', description: 'd', test: 't', evidence: 'evidence/g1.out' },
      { id: 'AC-2', description: 'd', test: 't', evidence: '../g2.out' },
    ],
  })
  const traceability = buildReportView(data, new Map(), { error: 'x' }, new Map()).traceability.split('\n')
  assert.deepEqual(traceability.slice(2), [
    '| AC-1 | d | t | UNVERIFIED | p/evidence/g1.out |',
    '| AC-2 | d | t | UNVERIFIED | ../g2.out |',
  ])
})
