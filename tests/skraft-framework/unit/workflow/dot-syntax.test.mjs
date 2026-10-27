// The DOT subset a workflow is written in: a matrix of syntax cases, beyond what the
// workflow scenarios (workflow-check, workflow-eject) show through the use cases.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDot } from '../../../../plugins/skraft-framework/engine/domain/workflow/dot.mjs'

test('comments, quoted strings, separators, chains and attribute lists are read', () => {
  const text = [
    '# a preprocessor-style line',
    '/* a comment',
    '   over two lines */ digraph',
    '  "my flow" {',
    '  // graph attributes, two ways',
    '  graph [version="2"; goal="say \\"hi\\" \\\\ \\n"] [ rank = -1.5 ]',
    '  size = .5',
    '# another preprocessor-style line',
    '  a [shape=box]; b [shape=Msquare, label="two',
    'lines"]',
    '  a -> c -> b [max_visits=3][label=FAIL,]',
    '  a [phase=X] /* trailing */',
    '  "quoted id" -> a ; dir = "C:\\\\"',
    '}',
    '// no newline after this comment',
  ].join('\n')

  assert.deepEqual(parseDot(text), {
    ok: true,
    graph: {
      name: 'my flow',
      attributes: { version: '2', goal: 'say "hi" \\ \\n', rank: '-1.5', size: '.5', dir: 'C:\\' },
      nodes: [
        { id: 'a', attributes: { shape: 'box', phase: 'X' }, line: 9 },
        { id: 'b', attributes: { shape: 'Msquare', label: 'two\nlines' }, line: 9 },
        { id: 'c', attributes: {}, line: 11 },
        { id: 'quoted id', attributes: {}, line: 13 },
      ],
      edges: [
        { from: 'a', to: 'c', attributes: { max_visits: '3', label: 'FAIL' }, line: 11 },
        { from: 'c', to: 'b', attributes: { max_visits: '3', label: 'FAIL' }, line: 11 },
        { from: 'quoted id', to: 'a', attributes: {}, line: 13 },
      ],
    },
  })
})

test('a graph without a name, its brace on the next line, with keywords quoted as IDs, is read', () => {
  assert.deepEqual(parseDot('digraph\n{\n  "node" -> "graph" }'), {
    ok: true,
    graph: {
      name: null,
      attributes: {},
      nodes: [{ id: 'node', attributes: {}, line: 3 }, { id: 'graph', attributes: {}, line: 3 }],
      edges: [{ from: 'node', to: 'graph', attributes: {}, line: 3 }],
    },
  })
  assert.deepEqual(parseDot('digraph flow\n{\n}'), { ok: true, graph: { name: 'flow', attributes: {}, nodes: [], edges: [] } })
})

test('a named subgraph adds its nodes and edges to the graph, never its attributes', () => {
  assert.deepEqual(parseDot('digraph {\n  subgraph cluster_x { label="X"; a -> b [label=PASS] }; c\n}'), {
    ok: true,
    graph: {
      name: null,
      attributes: {},
      nodes: [{ id: 'a', attributes: {}, line: 2 }, { id: 'b', attributes: {}, line: 2 }, { id: 'c', attributes: {}, line: 2 }],
      edges: [{ from: 'a', to: 'b', attributes: { label: 'PASS' }, line: 2 }],
    },
  })
})

test('each construct outside the subset is refused with its line', () => {
  const refusals = [
    ['', 'line 1: expected digraph, got end of file'],
    ['strict digraph {}', 'line 1: strict graphs are not supported'],
    ['\ngraph {}', 'line 2: undirected graphs are not supported; use digraph'],
    ['digraph x y {}', 'line 1: expected {, got "y"'],
    ['digraph subgraph {}', 'line 1: expected {, got "subgraph"'],
    ['digraph {\n  strict\n}', 'line 2: expected an ID to start a statement, got "strict"'],
    ['digraph {\n  a -> graph\n}', 'line 2: expected an ID after ->, got "graph"'],
    ['digraph {\n  a -> node\n}', 'line 2: expected an ID after ->, got "node"'],
    ['digraph {\n  a [shape=digraph]\n}', 'line 2: expected an ID as the value of shape, got "digraph"'],
    ['digraph {\n  /*/ a\n}', 'line 2: unterminated comment'],
    ['digraph {\n  a -- b\n}', 'line 2: undirected edges (--) are not supported; use ->'],
    ['digraph {\n  a -> subgraph\n}', 'line 2: subgraph is not supported'],
    ['digraph {\n  subgraph { a }\n}', 'line 2: a subgraph needs a name, such as cluster_review; got "{"'],
    ['digraph {\n  subgraph s a\n}', 'line 2: expected { after subgraph s, got "a"'],
    ['digraph {\n  subgraph s { a\n', 'line 3: missing } at the end of the graph'],
    ['digraph {\n  { a b }\n}', 'line 2: { } groups are not supported'],
    ['digraph {\n  a -> { b c }\n}', 'line 2: { } groups are not supported'],
    ['digraph {\n  a:n -> b\n}', 'line 2: ports (a:p) are not supported'],
    ['digraph {\n  a [label=<b>bold</b>]\n}', 'line 2: HTML strings are not supported; use a double-quoted string'],
    ['digraph {\n  node [shape=box]\n}', 'line 2: node [...] default attributes are not supported; set the attributes on each node'],
    ['digraph {\n\n  edge [color=red]\n}', 'line 3: edge [...] default attributes are not supported; set the attributes on each edge'],
    ['digraph {\n  a [label="open\n  b\n}', 'line 2: unterminated string'],
    ['digraph {\n  /* open\n  a\n}', 'line 2: unterminated comment'],
    ['digraph {\n  a -> b\n', 'line 3: missing } at the end of the graph'],
    ['digraph {\n  a -> b', 'line 2: missing } at the end of the graph'],
    ['digraph {\n  a\n}\nb', 'line 4: unexpected "b" after the closing }'],
    ['digraph {\n  a @ b\n}', 'line 2: unexpected character "@"'],
    ['digraph {\n  a # b\n}', 'line 2: unexpected character "#"'],
    ['digraph {\n  a - b\n}', 'line 2: unexpected character "-"'],
    ['digraph {\n  a b\n}', 'line 2: unexpected "b"; end the statement with a new line or ;'],
    ['digraph {\n  a [shape box]\n}', 'line 2: expected = after shape, got "box"'],
    ['digraph {\n  a [shape=]\n}', 'line 2: expected an ID as the value of shape, got "]"'],
    ['digraph {\n  a [=box]\n}', 'line 2: expected an ID as attribute name, got "="'],
    ['digraph {\n  a [shape=box\n}', 'line 3: expected an ID as attribute name, got "}"'],
    ['digraph {\n  a ->\n}', 'line 2: expected an ID after ->, got end of line'],
    ['digraph {\n  a -> edge\n}', 'line 2: expected an ID after ->, got "edge"'],
    ['digraph {\n  rankdir =\n}', 'line 2: expected an ID as the value of rankdir, got end of line'],
    ['digraph {\n  -> a\n}', 'line 2: expected an ID to start a statement, got "->"'],
  ]
  for (const [text, error] of refusals) assert.deepEqual(parseDot(text), { ok: false, errors: [error] }, JSON.stringify(text))
})
