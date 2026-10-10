// Unit tests pinning each splitting rule of the shell reader behind G7/G8
// (src/domain/shell-command-reading.mjs) with exact outputs: a rule the reader drops
// silently is a write the guard no longer sees.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readCommandLine, joinPath, UNKNOWN } from '../../../plugins/skraft-framework/src/domain/shell-command-reading.mjs'

const U = UNKNOWN
const cmd = (words, redirects = [], stdin) => ({ words, redirects, ...(stdin ? { stdin } : {}) })
const read = (command, options) => readCommandLine(command, options)

test('UNKNOWN is the NUL character, which no command line word can hold', () => {
  assert.equal(U, '\u0000')
})

test('empty, absent and non-string input read as no command at all', () => {
  assert.deepEqual(read(''), [])
  assert.deepEqual(read(), [])
  assert.deepEqual(read(null), [])
  assert.deepEqual(read(42), [])
  assert.deepEqual(read(['rm', 'x']), [])
  assert.deepEqual(read('   \t '), [])
})

test('space, tab and carriage return all separate words', () => {
  assert.deepEqual(read('echo\ta\rb c'), [cmd(['echo', 'a', 'b', 'c'])])
})

test('a trailing backslash escapes nothing and adds nothing', () => {
  assert.deepEqual(read('echo a\\'), [cmd(['echo', 'a'])])
  assert.deepEqual(read('echo \\'), [cmd(['echo', ''])])
})

test('single quotes: everything up to the next quote is literal, an open quote runs to the end', () => {
  assert.deepEqual(read("echo 'abc"), [cmd(['echo', 'abc'])])
  assert.deepEqual(read("echo x'a;b"), [cmd(['echo', 'xa;b'])])
  assert.deepEqual(read("echo 'a\\'; rm x"), [cmd(['echo', 'a\\']), cmd(['rm', 'x'])], 'a backslash does not escape the closing single quote')
})

test('double quotes: a backslash escapes only $ ` " \\ and newline, an open quote runs to the end', () => {
  assert.deepEqual(read('echo "abc'), [cmd(['echo', 'abc'])])
  assert.deepEqual(read('echo "a\\$b" "a\\`b" "a\\"b" "a\\\\b" "a\\\nb"'), [cmd(['echo', 'a$b', 'a`b', 'a"b', 'a\\b', 'ab'])])
  assert.deepEqual(read('echo "a\\xb" "a\\;b" "a\\\'b"'), [cmd(['echo', 'a\\xb', 'a\\;b', "a\\'b"])])
  assert.deepEqual(read('echo "a\\'), [cmd(['echo', 'a\\'])], 'a backslash closing an open double quote stays')
  assert.deepEqual(read('echo "a\\"; rm x"'), [cmd(['echo', 'a"; rm x'])], 'an escaped quote does not close the string, so ; stays inside')
})

test('a backtick inside double quotes runs a command, closed or not', () => {
  assert.deepEqual(read('echo "a`rm x`b" >o'), [cmd(['echo', `a${U}b`], [{ op: '>', target: 'o' }]), cmd(['rm', 'x'])])
  assert.deepEqual(read('echo "a`rm x'), [cmd(['echo', `a${U}`]), cmd(['rm', 'x'])])
  assert.deepEqual(read('echo "`a`b`c`"'), [cmd(['echo', `${U}b${U}`]), cmd(['a']), cmd(['c'])])
})

test('backticks outside quotes: the command runs, a ; inside does not split the line', () => {
  assert.deepEqual(read('echo `a; b`'), [cmd(['echo', U]), cmd(['a']), cmd(['b'])])
  assert.deepEqual(read('echo `a`x`b'), [cmd(['echo', `${U}x${U}`]), cmd(['a']), cmd(['b'])])
})

test('$( ) ends at its own parenthesis: quotes, escapes and nested parentheses inside do not end it', () => {
  assert.deepEqual(read('echo $(printf "a\\")b") >out'), [
    cmd(['echo', U], [{ op: '>', target: 'out' }]),
    cmd(['printf', 'a")b']),
  ])
  assert.deepEqual(read('echo $(echo "a\\\\") x'), [cmd(['echo', U, 'x']), cmd(['echo', 'a\\'])])
  assert.deepEqual(read("echo $(echo 'a\\' b)"), [cmd(['echo', U]), cmd(['echo', 'a\\', 'b'])])
  assert.deepEqual(read("echo $(echo 'a\\' b) x"), [cmd(['echo', U, 'x']), cmd(['echo', 'a\\', 'b'])], 'a backslash in single quotes escapes nothing')
  assert.deepEqual(read('echo $(echo a\\) b)'), [cmd(['echo', U]), cmd(['echo', 'a)', 'b'])])
  assert.deepEqual(read("echo $(echo 'a)b') x"), [cmd(['echo', U, 'x']), cmd(['echo', 'a)b'])])
  assert.deepEqual(read('echo $(echo "a)b") x'), [cmd(['echo', U, 'x']), cmd(['echo', 'a)b'])])
  assert.deepEqual(read('echo $(echo "x" y) z'), [cmd(['echo', U, 'z']), cmd(['echo', 'x', 'y'])])
  assert.deepEqual(read('echo $(a $(b) c) d'), [cmd(['echo', U, 'd']), cmd(['a', U, 'c']), cmd(['b'])])
  assert.deepEqual(read('echo $(a; b) ; c'), [cmd(['echo', U]), cmd(['a']), cmd(['b']), cmd(['c'])])
  assert.deepEqual(read('echo $(a; b'), [cmd(['echo', U]), cmd(['a']), cmd(['b'])], 'an open $( runs to the end')
})

test('$(( )) is a number: unknown, never read as a command', () => {
  assert.deepEqual(read('echo $((1+(2))) x'), [cmd(['echo', U, 'x'])])
})

test('${NAME} takes a known value; an unknown name or any operator is unknown', () => {
  const vars = { A: 'v', AB: 'w', '1A': 'one', 'A-': 'dash' }
  assert.deepEqual(read('echo ${A} ${AB} ${B} ${A:-x} ${1A} ${A-} ${}', { vars }), [cmd(['echo', 'v', 'w', U, U, U, U, U])])
  assert.deepEqual(read('echo }${A}', { vars }), [cmd(['echo', '}v'])])
  assert.deepEqual(read('echo ${A}}x', { vars }), [cmd(['echo', 'v}x'])])
  assert.deepEqual(read('echo ${AB', { vars: { A: 'v' } }), [cmd(['echo', U])])
  // bash refuses an unclosed ${ outright; the reader reads the name as far as it goes
  assert.deepEqual(read('echo ${A', { vars }), [cmd(['echo', 'v'])])
  assert.deepEqual(read('echo x${A', { vars: { A: 'v' } }), [cmd(['echo', 'xv'])])
})

test('$NAME takes the longest name; special parameters are unknown; a bare $ is literal', () => {
  assert.deepEqual(read('echo $A $AB $A.x $Ax', { vars: { A: 'v', AB: 'w' } }), [cmd(['echo', 'v', 'w', 'v.x', U])])
  for (const special of ['0', '1', '9', '@', '*', '#', '?', '$', '!', '-']) {
    assert.deepEqual(read(`echo a$${special}b`), [cmd(['echo', `a${U}b`])], `$${special}`)
  }
  assert.deepEqual(read('echo $ a$ $% $/x'), [cmd(['echo', '$', 'a$', '$%', '$/x'])])
  assert.deepEqual(read('echo "$"'), [cmd(['echo', '$'])])
})

test('a # starts a comment only where a word starts: line start, after a blank or a separator', () => {
  assert.deepEqual(read('#x; rm y'), [])
  assert.deepEqual(read('#x\nrm y'), [cmd(['rm', 'y'])])
  assert.deepEqual(read('echo a # x'), [cmd(['echo', 'a'])])
  assert.deepEqual(read('echo a #b; rm c'), [cmd(['echo', 'a'])], 'the comment swallows the ; after it')
  assert.deepEqual(read('echo a\t#b; rm c\nrm d'), [cmd(['echo', 'a']), cmd(['rm', 'd'])])
  assert.deepEqual(read('a;#b; rm c'), [cmd(['a'])])
  assert.deepEqual(read('a&#b; rm c'), [cmd(['a'])])
  assert.deepEqual(read('a|#b; rm c'), [cmd(['a'])])
  assert.deepEqual(read('(#b; rm c\n)'), [])
  assert.deepEqual(read('echo a#b; rm c'), [cmd(['echo', 'a#b']), cmd(['rm', 'c'])])
  assert.deepEqual(read('echo "a"#b x'), [cmd(['echo', 'a#b', 'x'])])
  assert.deepEqual(read('echo $#x'), [cmd(['echo', `${U}x`])])
  // right after a redirect operator a word starts, so # opens a comment there too (bash
  // then refuses the line for want of a target); the comment ends at the next newline,
  // even one the line holds inside quotes
  assert.deepEqual(read('echo a >#c\nrm b'), [cmd(['echo', 'a'], [{ op: '>', target: '' }]), cmd(['rm', 'b'])])
  assert.deepEqual(read('echo a >#c "\n"'), [cmd(['echo', 'a'], [{ op: '>', target: '\n' }])])
})

test('every redirect operator keeps its form and its descriptor prefix', () => {
  assert.deepEqual(read('echo a>o1 >>o2 >|o3 &>o4 &>>o5 2>o6 10>o7 1>>o8 2>|o9 <>o10'), [cmd(['echo', 'a'], [
    { op: '>', target: 'o1' }, { op: '>>', target: 'o2' }, { op: '>|', target: 'o3' }, { op: '&>', target: 'o4' },
    { op: '&>>', target: 'o5' }, { op: '2>', target: 'o6' }, { op: '10>', target: 'o7' }, { op: '1>>', target: 'o8' },
    { op: '2>|', target: 'o9' }, { op: '<>', target: 'o10' },
  ])])
})

test('only an all-digit word glued to the operator is a descriptor', () => {
  assert.deepEqual(read('echo 1a>p a2>q 2a>r 10>s 1 >t'), [cmd(['echo', '1a', 'a2', '2a', '1'], [
    { op: '>', target: 'p' }, { op: '>', target: 'q' }, { op: '>', target: 'r' }, { op: '10>', target: 's' }, { op: '>', target: 't' },
  ])])
})

test('reads are left out: <, <<, <<-, <<<, <& — and their target is not a word', () => {
  assert.deepEqual(read('cat <in <<EOF <<-T <<<s <&3 x'), [cmd(['cat', 'x'], [], 'redirect')])
  assert.deepEqual(read('<in; echo a'), [cmd(['echo', 'a'])], 'a command of reads only is no command')
  assert.deepEqual(read('cat <&3 x; y'), [cmd(['cat', 'x'], [], 'redirect'), cmd(['y'])], 'the & of <& does not split the line')
})

test('>& copies a descriptor (digits or -) but writes a file otherwise', () => {
  assert.deepEqual(read('echo a >&2 >&10 >&- 2>&1 >&2x >&-x >&f'), [cmd(['echo', 'a'], [
    { op: '>&', target: '2x' }, { op: '>&', target: '-x' }, { op: '>&', target: 'f' },
  ])])
  assert.deepEqual(read('echo x >>&2'), [cmd(['echo', 'x'], [{ op: '>>', target: '&2' }])], '>> takes no descriptor copy: &2 is the target')
})

test('a redirect without a word after it has an empty target', () => {
  assert.deepEqual(read('echo a >'), [cmd(['echo', 'a'], [{ op: '>', target: '' }])])
  assert.deepEqual(read('echo a > 2>out'), [cmd(['echo', 'a'], [{ op: '>', target: '' }, { op: '2>', target: 'out' }])])
  assert.deepEqual(read('echo a >\nrm b'), [cmd(['echo', 'a'], [{ op: '>', target: '' }]), cmd(['rm', 'b'])])
  assert.deepEqual(read('echo a >;rm b'), [cmd(['echo', 'a'], [{ op: '>', target: '' }]), cmd(['rm', 'b'])])
})

test('a redirect alone is a command; one after a separator starts the next command', () => {
  assert.deepEqual(read('a;>out'), [cmd(['a']), cmd([], [{ op: '>', target: 'out' }])])
  assert.deepEqual(read('a &&>out'), [cmd(['a']), cmd([], [{ op: '>', target: 'out' }])])
  assert.deepEqual(read('a &>out'), [cmd(['a'], [{ op: '&>', target: 'out' }])])
  assert.deepEqual(read('a 2>&1 &b'), [cmd(['a']), cmd(['b'])])
  assert.deepEqual(read('a >|b|c'), [cmd(['a'], [{ op: '>|', target: 'b' }]), cmd(['c'], [], 'pipe')])
})

test('stdin: a lone | or |& feeds the next command, a read redirect feeds its own; || never does', () => {
  assert.deepEqual(read('a | b |& c || d'), [cmd(['a']), cmd(['b'], [], 'pipe'), cmd(['c'], [], 'pipe'), cmd(['d'])])
  assert.deepEqual(read('a < f; b 0<<E; c <<< s; d > o'), [cmd(['a'], [], 'redirect'), cmd(['b'], [], 'redirect'), cmd(['c'], [], 'redirect'), cmd(['d'], [{ op: '>', target: 'o' }])])
  assert.deepEqual(read('a | b < f'), [cmd(['a']), cmd(['b'], [], 'pipe')], 'the pipe is said first')
})

test('separators: ; & && | || newline and parentheses, each once, glued or spaced', () => {
  assert.deepEqual(read('a&b|c;d\ne(f)g&&h||i'), [cmd(['a']), cmd(['b']), cmd(['c'], [], 'pipe'), cmd(['d']), cmd(['e']), cmd(['f']), cmd(['g']), cmd(['h']), cmd(['i'])])
  assert.deepEqual(read('a &b|c'), [cmd(['a']), cmd(['b']), cmd(['c'], [], 'pipe')])
  assert.deepEqual(read('a&&b'), [cmd(['a']), cmd(['b'])])
  assert.deepEqual(read('a || b ;; c'), [cmd(['a']), cmd(['b']), cmd(['c'])])
})

test('pieces are trimmed of every white space, form feed and no-break space included', () => {
  assert.deepEqual(read('echo a\f; echo b\u00a0; \vc'), [cmd(['echo', 'a']), cmd(['echo', 'b']), cmd(['c'])])
})

test('an assignment-only command sets its names for the commands that follow', () => {
  assert.deepEqual(read('AB=x; A_1=y; _=z; echo $AB $A_1 $_'), [cmd(['AB=x']), cmd(['A_1=y']), cmd(['_=z']), cmd(['echo', 'x', 'y', 'z'])])
  assert.deepEqual(read("A='x y'; echo $A"), [cmd(['A=x y']), cmd(['echo', 'x y'])])
  assert.deepEqual(read('A=; echo a${A}b'), [cmd(['A=']), cmd(['echo', 'ab'])])
  assert.deepEqual(read('A=1 B=2; echo $A$B'), [cmd(['A=1', 'B=2']), cmd(['echo', '12'])])
})

test('a word that only looks like an assignment sets nothing', () => {
  assert.deepEqual(read('1A=x; echo $A'), [cmd(['1A=x']), cmd(['echo', U])])
  assert.deepEqual(read('A-B=x; echo $B'), [cmd(['A-B=x']), cmd(['echo', U])])
  assert.deepEqual(read('echo A=x; echo $A'), [cmd(['echo', 'A=x']), cmd(['echo', U])], 'an argument is not an assignment')
  assert.deepEqual(read('A=x echo; echo $A'), [cmd(['A=x', 'echo']), cmd(['echo', U])], 'a prefix assignment lives for its command only')
})

test('every declaring builtin sets the names it is given', () => {
  assert.deepEqual(read('export A=1; declare B=2; typeset C=3; local D=4; readonly E=5; echo $A $B $C $D $E'), [
    cmd(['export', 'A=1']), cmd(['declare', 'B=2']), cmd(['typeset', 'C=3']), cmd(['local', 'D=4']), cmd(['readonly', 'E=5']),
    cmd(['echo', '1', '2', '3', '4', '5']),
  ])
  assert.deepEqual(read('export A; echo x'), [cmd(['export', 'A']), cmd(['echo', 'x'])], 'a bare name sets nothing')
  assert.deepEqual(read('export -n A=1 B; echo $A'), [cmd(['export', '-n', 'A=1', 'B']), cmd(['echo', '1'])])
})

test('an assignment from an unknown value forgets what the variable held', () => {
  assert.deepEqual(read('A=x; A=$(y)z; echo $A'), [cmd(['A=x']), cmd([`A=${U}z`]), cmd(['y']), cmd(['echo', U])])
  assert.deepEqual(read('A=x; export A=`y`; echo ${A}'), [cmd(['A=x']), cmd(['export', `A=${U}`]), cmd(['y']), cmd(['echo', U])])
  assert.deepEqual(read('echo $A', { vars: { A: 'v' } }), [cmd(['echo', 'v'])])
  assert.deepEqual(read('A=$B; echo $A', { vars: { A: 'v' } }), [cmd([`A=${U}`]), cmd(['echo', U])])
})

test('the vars option seeds the line and is never changed by it', () => {
  const vars = { A: 'v' }
  assert.deepEqual(read('A=w; B=x; echo $A$B', { vars }), [cmd(['A=w']), cmd(['B=x']), cmd(['echo', 'wx'])])
  assert.deepEqual(vars, { A: 'v' })
})

test('substituted commands see the variables known where they run', () => {
  assert.deepEqual(read('A=x; echo $(rm $A)'), [cmd(['A=x']), cmd(['echo', U]), cmd(['rm', 'x'])])
  assert.deepEqual(read('echo `rm $A`', { vars: { A: 'y' } }), [cmd(['echo', U]), cmd(['rm', 'y'])])
})

test('joinPath reads Windows separators and drives as absolute only at the start', () => {
  assert.equal(joinPath('/base', 'C:/x'), 'C:/x')
  assert.equal(joinPath('/base', 'C:\\x\\y'), 'C:/x/y')
  assert.equal(joinPath('/base', 'aC:/b'), '/base/aC:/b')
  assert.equal(joinPath('/base', '1:/b'), '/base/1:/b')
  assert.equal(joinPath('C:\\w', 'a\\b'), 'C:/w/a/b')
  assert.equal(joinPath(undefined, 'C:/..'), 'C:/', 'above a drive root is the drive root')
  assert.equal(joinPath('C:/w/x', '../../..'), 'C:/')
  assert.equal(joinPath('C:/w', '../../y'), 'C:/y')
  assert.equal(joinPath('', 'aC:/..'), '.')
  assert.equal(joinPath('', '1:/..'), '.')
})

test('joinPath drops trailing slashes and empty segments of base and path', () => {
  assert.equal(joinPath('a//', 'b'), 'a/b')
  assert.equal(joinPath('/a/', 'b/'), '/a/b')
  assert.equal(joinPath('//', 'b'), '/b')
  assert.equal(joinPath('a', ''), 'a')
  assert.equal(joinPath('', ''), '.')
  assert.equal(joinPath(undefined, '.'), '.')
})

test('joinPath keeps .. that climbs above a relative root, and stops .. at the absolute root', () => {
  assert.equal(joinPath(undefined, '../a'), '../a')
  assert.equal(joinPath('', '../../a'), '../../a')
  assert.equal(joinPath('a', '../..'), '..')
  assert.equal(joinPath('a/b', '../../../c'), '../c')
  assert.equal(joinPath('/', '..'), '/')
  assert.equal(joinPath('/a', '../../b'), '/b')
  assert.equal(joinPath('/a', '..'), '/')
})
