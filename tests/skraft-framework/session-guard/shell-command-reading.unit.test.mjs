// Unit tests of the shell reader behind G7/G8 (src/domain/shell-command-reading.mjs): it
// splits a command line the way a POSIX shell does, far enough to know what it writes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readCommandLine, joinPath, UNKNOWN } from '../../../plugins/skraft-framework/src/domain/shell-command-reading.mjs'

const words = (command) => readCommandLine(command).map((c) => c.words)
const redirects = (command) => readCommandLine(command).flatMap((c) => c.redirects)
const shown = (value) => JSON.stringify(value).split('\\u0000').join('?')

test('quotes and escapes come off as the shell removes them, glued pieces make one word', () => {
  assert.deepEqual(words(`rm a/'state.json' "b c"/d e\\ f 'it''s' "q\\"x" "\\$y" s\\.json`), [
    ['rm', 'a/state.json', 'b c/d', 'e f', 'its', 'q"x', '$y', 's.json'],
  ])
  assert.deepEqual(words(`echo "a\\b" 'a\\b'`), [['echo', 'a\\b', 'a\\b']], 'a backslash is literal before other characters and inside single quotes')
  assert.deepEqual(words('echo a\\\nb'), [['echo', 'ab']], 'a line continuation joins')
  assert.deepEqual(words(`echo "line\\\nnext"`), [['echo', 'linenext']])
  assert.deepEqual(words('echo "" \'\''), [['echo', '', '']], 'empty quotes are empty words')
})

test('a line splits into simple commands at every separator, never inside quotes or substitutions', () => {
  assert.deepEqual(words('a; b && c || d | e & f\ng'), [['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g']])
  assert.deepEqual(words('(a) ; { b; }'), [['a'], ['{', 'b'], ['}']])
  assert.deepEqual(words(`echo "a; b" 'c && d'`), [['echo', 'a; b', 'c && d']])
  assert.deepEqual(words('echo a # rm x; y\nb'), [['echo', 'a'], ['b']], 'a comment runs to the end of its line')
  assert.deepEqual(words('echo a#b'), [['echo', 'a#b']], 'a # inside a word is not a comment')
  assert.deepEqual(words(';;  ;'), [])
  assert.deepEqual(readCommandLine(''), [])
  assert.deepEqual(readCommandLine(undefined), [])
})

test('variables the line assigns are substituted after the assignment, others are unknown', () => {
  assert.equal(shown(words('D=x/y; rm $D/s ${D}/t "$D"u')), shown([['D=x/y'], ['rm', 'x/y/s', 'x/y/t', 'x/yu']]))
  assert.equal(shown(words('export E=p q=r; rm $E $q')), shown([['export', 'E=p', 'q=r'], ['rm', 'p', 'r']]))
  assert.equal(shown(words('rm $HOME/a ${X:-b} $1 $@ $? $$')), shown([['rm', '?/a', '?', '?', '?', '?', '?']]))
  assert.equal(shown(words('F=$UNSET; rm $F')), shown([['F=?'], ['rm', '?']]), 'an assignment from an unknown value stays unknown')
  assert.equal(shown(words('G=1 rm $G')), shown([['G=1', 'rm', '?']]), 'a prefix assignment is not visible to the command\'s own words')
  assert.equal(readCommandLine('rm $D', { vars: { D: 'given' } })[0].words[1], 'given')
  assert.deepEqual(words('echo $ a$'), [['echo', '$', 'a$']], 'a lone $ is literal')
})

test('$( ), backticks and arithmetic: substituted commands are read too, their value is unknown', () => {
  const commands = readCommandLine('echo "$(rm a)" `rm b` $(( 1 + 2 )) $(cd x; rm "c d")')
  assert.equal(shown(commands.map((c) => c.words)), shown([
    ['echo', '?', '?', '?', '?'], ['rm', 'a'], ['rm', 'b'], ['cd', 'x'], ['rm', 'c d'],
  ]))
  assert.deepEqual(readCommandLine('echo $(echo ")")').map((c) => c.words), [['echo', UNKNOWN], ['echo', ')']])
  assert.deepEqual(readCommandLine('echo $(rm a').map((c) => c.words), [['echo', UNKNOWN], ['rm', 'a']], 'an unclosed $( still runs what it holds')
  assert.deepEqual(readCommandLine('echo `rm b').map((c) => c.words), [['echo', UNKNOWN], ['rm', 'b']], 'an unclosed backtick too')
})

test('redirections: file writes are kept, reads and descriptor copies are not', () => {
  assert.deepEqual(redirects('a > f1 >> f2 >| f3 2> f4 &> f5 &>> f6 >&f7 1>>f8'), [
    { op: '>', target: 'f1' }, { op: '>>', target: 'f2' }, { op: '>|', target: 'f3' }, { op: '2>', target: 'f4' },
    { op: '&>', target: 'f5' }, { op: '&>>', target: 'f6' }, { op: '>&', target: 'f7' }, { op: '1>>', target: 'f8' },
  ])
  assert.deepEqual(redirects('a < f 2>&1 >&- <<< s << EOF <> g'), [{ op: '<>', target: 'g' }], 'a read-write <> opens for writing')
  assert.deepEqual(redirects(`a > 'q'"uoted"`), [{ op: '>', target: 'quoted' }])
  assert.deepEqual(readCommandLine('> f').map((c) => [c.words, c.redirects]), [[[], [{ op: '>', target: 'f' }]]])
  assert.deepEqual(words('a 2>&1 | b'), [['a'], ['b']], 'a descriptor copy is not a separator')
})

test('joinPath resolves . and .. lexically, keeps absolute paths, and reads either separator', () => {
  assert.equal(joinPath('/r/a', '../b/./c'), '/r/b/c')
  assert.equal(joinPath('', 'x/y'), 'x/y')
  assert.equal(joinPath('a/', '/abs'), '/abs')
  assert.equal(joinPath('C:\\repo', 'x\\y'), 'C:/repo/x/y')
  assert.equal(joinPath('a', '..'), '.')
  assert.equal(joinPath('', '../up'), '../up')
  assert.equal(joinPath('/', '..'), '/')
  assert.equal(joinPath('a//b', 'c'), 'a/b/c')
})
