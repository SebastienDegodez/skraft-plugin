// Unit — how far G8 can read a shell line for an agent with no right on src/ and tests/:
// shellOpacity says why a line cannot be read to the end, withoutDataHereDocs drops only the
// here-document bodies an input-only program reads, commandWritesWhere hands each target to
// the judge that owns its kind, commandWritesWorkspace (strict) reads the session directory
// as holding src/ and tests/.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  commandWritesWhere, commandWritesWorkspace, isGlobPath, isUnresolvedPath, segmentCanBe, shellOpacity, withoutDataHereDocs,
} from '../../../plugins/skraft-framework/src/domain/session-guard-policy.mjs'

test('shellOpacity names what cannot be read, and reads the rest', () => {
  const cases = [
    ['eval "$x"', 'eval runs text the guard does not read'],
    ['source ./env.sh', 'source runs text the guard does not read'],
    ['. ./env.sh', '. runs text the guard does not read'],
    ["env -S 'bash -c x'", 'env -S runs a command line the guard does not read'],
    ['env bash -c ls', 'bash is started through a wrapper'],
    ['bash script.sh', 'bash runs a script or its input, which the guard does not read'],
    ['cmd /c del x', 'cmd runs a script or its input, which the guard does not read'],
    ['sh -c "$X"', 'sh -c runs a script the guard cannot resolve'],
    ['sh -c', 'sh -c runs a script the guard cannot resolve'],
    ['node -e 1', 'node runs an inline script'],
    ['python3 -c 1', 'python3 runs an inline script'],
    ['git log | node x.mjs', 'node reads its standard input as more than data'],
    ['node x.mjs < input.txt', 'node reads its standard input as more than data'],
    ['find . -exec bash {} \\;', 'bash runs a script or its input, which the guard does not read'],
    ['find . -exec eval {} +', 'eval runs text the guard does not read'],
    ['Remove-Item src', 'Remove-Item is a PowerShell command the guard does not read'],
    ['Format-Volume -DriveLetter D', 'Format-Volume is a PowerShell command the guard does not read'],
    ['ls; ni x', 'ni is a PowerShell command the guard does not read'],
    ['DEL x', 'DEL is a PowerShell command the guard does not read'],
    ['sh -c "sh -c \\"sh -c \\\\\\"sh -c \\\\\\\\\\\\\\"sh -c \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"ls\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"\\\\\\\\\\\\\\"\\\\\\"\\""', 'commands nested too deep to read'],
  ]
  for (const [command, why] of cases) assert.equal(shellOpacity(command), why, command)
  for (const command of [
    'git status', 'git log | grep fix | head -5', 'git diff | wc -l', 'sh', 'sh -c "ls src"', 'bash.exe -c ls', 'pwsh -c "Get-ChildItem"',
    'Get-Content a | Format-Table', 'git log | Select-String fix', 'x | Write-Output', 'git commit -F - < msg.txt',
    'node "$ROOT/src/cli/artifact.mjs" review-verdict < verdict.yaml', "node 'C:\\p\\src\\cli\\qg-verify.mjs' < log.txt", 'find . -name "*.ts" -exec grep -l x {} +',
  ]) {
    assert.equal(shellOpacity(command), null, command)
  }
  assert.equal(shellOpacity(undefined), null)
  assert.equal(shellOpacity(''), null)
  assert.equal(shellOpacity('ls', 5), 'commands nested too deep to read')
})

test('withoutDataHereDocs drops the body an input-only program reads, and keeps any other', () => {
  assert.equal(withoutDataHereDocs('cat <<EOF > out\nrm -rf src\nEOF\nls'), 'cat <<EOF > out\nEOF\nls')
  assert.equal(withoutDataHereDocs("git commit -F - <<'EOF'\nfix: x\nEOF"), "git commit -F - <<'EOF'\nEOF")
  assert.equal(withoutDataHereDocs('cat <<-EOF | grep x | wc -l\n\trm src\n\tEOF'), 'cat <<-EOF | grep x | wc -l\n\tEOF')
  assert.equal(withoutDataHereDocs('node "$R/src/cli/artifact.mjs" x \\\n  --out f <<"EOF"\nrm src\nEOF'), 'node "$R/src/cli/artifact.mjs" x \\\n  --out f <<"EOF"\nEOF', 'a continued line is one command')
  for (const command of [
    'bash <<EOF\nrm src\nEOF', 'cat <<EOF | sh\nrm src\nEOF', '(cat <<EOF\nrm src\nEOF\n)', 'node build.mjs <<EOF\nrm src\nEOF',
    'cat <<EOF\nrm src', 'cat <<<"rm src"', 'cat <<EOF | grep x | sh\nrm src\nEOF',
  ]) {
    assert.equal(withoutDataHereDocs(command), command, command)
  }
  assert.equal(withoutDataHereDocs(undefined), undefined)
  assert.equal(withoutDataHereDocs(''), '')
})

test('commandWritesWhere hands each target to the judge of its kind, resolved from the session directory', () => {
  const kinds = (command, cwd = '/repo') => {
    const seen = []
    const judge = (kind) => (path) => { seen.push(`${kind} ${path}`); return false }
    commandWritesWhere(command, { file: judge('file'), tree: judge('tree'), landing: judge('landing'), rewrite: judge('rewrite') }, { cwd, sample: '/x' })
    return seen
  }
  assert.deepEqual(kinds('echo x > a.txt'), ['file /repo/a.txt'])
  assert.deepEqual(kinds('rm -rf docs'), ['tree /repo/docs'])
  assert.deepEqual(kinds('cp a.txt docs'), ['file /repo/docs/a.txt', 'landing /repo/docs'])
  assert.deepEqual(kinds('git reset --hard'), ['rewrite /repo'])
  assert.deepEqual(kinds('git apply x.patch'), ['rewrite /repo'])
  assert.deepEqual(kinds('git -C sub stash pop'), ['rewrite /repo/sub'])
  assert.deepEqual(kinds('patch -p1 < x.patch'), ['rewrite /repo'])
  assert.deepEqual(kinds('patch -p1 -d sub < x.patch'), ['rewrite /repo/sub'])
  assert.deepEqual(kinds('patch a.txt x.patch'), ['file /repo/a.txt'])
  assert.deepEqual(kinds('patch -o out.txt a.txt x.patch'), ['file /repo/out.txt'])
  assert.deepEqual(kinds('tar -xf a.tar'), ['rewrite /repo'])
  assert.deepEqual(kinds('tar -xf a.tar -C out'), ['rewrite /repo/out'])
  assert.deepEqual(kinds('unzip a.zip -d out'), ['rewrite /repo/out'])
  assert.deepEqual(kinds('node tool.mjs --out report.json'), ['file /repo/report.json'])
  assert.deepEqual(kinds('git clean -fdx'), ['tree /repo'])
  assert.deepEqual(kinds('git checkout main'), ['tree /repo/main', 'rewrite /repo'], 'a branch, or a path')
  assert.deepEqual(kinds('cd $D && echo x > a.txt'), [`file \u0000/a.txt`])
  for (const command of ['echo x > /dev/null', 'echo x 2>nul', 'echo x > NUL', 'echo x > //./nul', "echo x > '\\\\.\\nul'", 'git apply --check x.patch', 'git stash list', 'git reset HEAD~1', 'tar -tf a.tar', 'git status']) {
    assert.deepEqual(kinds(command), [], command)
  }
  assert.deepEqual(kinds('echo x > src/nul'), ['file /repo/src/nul'], 'a file named nul is a file')
  assert.match(kinds('echo x > \\\\.\\nul').join(), /^file [^,]*$/, 'unquoted, a POSIX shell reads the backslashes as escapes: a file')
  assert.equal(commandWritesWhere('echo x > a', {}), false, 'no judge, no write')
  assert.equal(commandWritesWhere(undefined, { file: () => true }), false)
})

test('the strict workspace: the session directory and its ancestors hold src/ and tests/, a glob or an unread path may name them', () => {
  const strict = (command, cwd = '/repo') => commandWritesWorkspace(command, { cwd, strict: true })
  for (const command of ['rm -rf .', 'rm -rf /repo', 'rm -rf ..', 'rm -rf /', 'rm -rf *', 'git checkout .', 'echo x > s*/a', 'echo x > [st]rc/a', 'echo x > $D/a', 'mv /tmp/src .', 'cp -r /tmp/x/. .', 'git clean -fd']) {
    assert.equal(strict(command), true, command)
  }
  for (const command of ['rm -rf docs', 'echo x > docs/a.md', 'echo x > src.md', 'cp a.txt .', 'rm -rf /other/src-old', 'git status']) {
    assert.equal(strict(command), false, command)
  }
  assert.equal(strict('rm -rf .', undefined), true, 'without a session directory, . holds the workspace')
  assert.equal(strict('rm -rf docs', undefined), false)
  assert.equal(commandWritesWorkspace('rm -rf .', { cwd: '/repo' }), false, 'the loose reading names src/ and tests/ only')
})

test('path predicates: unresolved, glob, and a segment a glob can make', () => {
  assert.equal(isUnresolvedPath('\u0000/a'), true)
  assert.equal(isUnresolvedPath('/a'), false)
  assert.equal(isUnresolvedPath(undefined), false)
  assert.equal(isGlobPath('s*'), true)
  assert.equal(isGlobPath('a?'), true)
  assert.equal(isGlobPath('[s]rc'), true)
  assert.equal(isGlobPath('src'), false)
  assert.equal(isGlobPath(''), false)
  assert.equal(segmentCanBe('s*', 'src'), true)
  assert.equal(segmentCanBe('sr?', 'src'), true)
  assert.equal(segmentCanBe('src?', 'src'), false)
  assert.equal(segmentCanBe('SRC', 'src'), true)
  assert.equal(segmentCanBe('lib', 'src'), false)
})
