import { test } from 'node:test'
import assert from 'node:assert/strict'
// The one domain import of this feature: markdownOf is an extracted rule with a matrix of edge
// cases, which the acceptance scenarios of azure-boards-story.test.mjs already cover end to end.
import { markdownOf } from '../../../../plugins/skraft-framework/engine/domain/pipeline/html-markdown.mjs'

const MATRIX = Object.freeze({
  'a text without a tag is Markdown and stays as written': ['Rows with a < b & c > d\n\n- one\n  - two', 'Rows with a < b & c > d\n\n- one\n  - two'],
  'paragraphs and divs are set apart by a blank line': ['<div>One</div><div>Two</div><p>Three</p>', 'One\n\nTwo\n\nThree'],
  'a line break stays a line break': ['One<br>Two<br/>Three<br />Four', 'One\nTwo\nThree\nFour'],
  'bold, italic and code': ['<b>a</b> <strong>b</strong> <i>c</i> <em>d</em> <code>e</code>', '**a** **b** *c* *d* `e`'],
  'an unordered list': ['<ul><li>one</li><li>two</li></ul>', '- one\n- two'],
  'an ordered list': ['<ol><li>one</li><li>two</li></ol>', '1. one\n1. two'],
  'a nested list is indented under its item': ['<ul><li>one<ul><li>inner</li></ul></li><li>two</li></ul>', '- one\n  - inner\n- two'],
  'a list set apart from the text around it': ['<p>Before</p><ul><li>one</li></ul><p>After</p>', 'Before\n\n- one\n\nAfter'],
  'headings by level': ['<h1>A</h1><h3>B</h3><h6>C</h6>', '# A\n\n### B\n\n###### C'],
  'a link keeps its target': ['<a href="https://example.com/a?b=1&amp;c=2">the page</a>', '[the page](https://example.com/a?b=1&c=2)'],
  'a link without a target keeps its text': ['<a name="top">the page</a>', '[the page]'],
  'a block of code keeps its lines and its spaces, its code tag dropped': ['<pre><code>if (a) {\n  b()\n}</code></pre>', '```\nif (a) {\n  b()\n}\n```'],
  'entities are decoded, in text only': ['<p>a &lt;b&gt; &amp; &quot;c&quot; &#39;d&#39; &#x41;&#66;&nbsp;e</p>', 'a <b> & "c" \'d\' AB e'],
  'an unknown or out-of-range entity stays as written': ['<p>&unknown; &#0; &#99999999;</p>', '&unknown; &#0; &#99999999;'],
  'a tag skraft does not know is dropped, its text kept': ['<span style="color:red">red</span> <font>x</font>', 'red x'],
  'attributes of a known tag are ignored': ['<p class="a" style="b">text</p>', 'text'],
  'upper-case tags are read': ['<P>One</P><UL><LI>two</LI></UL>', 'One\n\n- two'],
  'whitespace between tags is collapsed': ['<p>  a \n\n  b  </p>\n  <p>c</p>', 'a b\n\nc'],
  'an unclosed tag does not hang nor swallow the text': ['<p>one <b>two', 'one **two'],
  'a stray closing tag is harmless': ['</ul></li>text</p>', 'text'],
  'a blockquote': ['<blockquote>quoted</blockquote>', '> quoted'],
})

for (const [name, [html, markdown]] of Object.entries(MATRIX)) {
  test(`markdownOf: ${name}`, () => {
    assert.equal(markdownOf(html), markdown)
  })
}

test('markdownOf: a long run of open brackets is read in linear time', () => {
  const started = Date.now()
  markdownOf(`<p>${'<'.repeat(200_000)}</p>${'<a '.repeat(50_000)}`)
  assert.ok(Date.now() - started < 1_000)
})
