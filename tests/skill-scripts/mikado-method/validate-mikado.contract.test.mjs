// One contract for the two twins of the Mikado graph validator: every case runs against
// validate-mikado.sh (POSIX sh) and validate-mikado.ps1 (PowerShell 7, and Windows
// PowerShell 5.1 on Windows), with the same expectations, on Linux, macOS and Windows.
// An interpreter that is missing is skipped on a developer machine and fails under CI,
// where every one of them must run.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const scripts = fileURLToPath(new URL('../../../plugins/skraft-brownfield/skills/mikado-method/scripts/', import.meta.url))

const answers = (cmd, args) => {
	const probe = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
	return !probe.error && probe.status === 0
}
const installed = (cmd, probe) => (answers(cmd, probe) ? cmd : undefined)
const powershellArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(scripts, 'validate-mikado.ps1')]

const TWINS = [
	{ name: 'sh', cmd: installed('sh', ['-c', 'exit 0']), args: [join(scripts, 'validate-mikado.sh')] },
	{ name: 'pwsh', cmd: installed('pwsh', ['-NoProfile', '-Command', 'exit 0']), args: powershellArgs },
	// Windows PowerShell 5.1 ships with Windows and is what a developer without PowerShell 7 runs.
	...(process.platform === 'win32'
		? [{ name: 'powershell', cmd: installed('powershell', ['-NoProfile', '-Command', 'exit 0']), args: powershellArgs }]
		: []),
]

const graph = (body, eol = '\n') => ['```mermaid', 'graph TD', '  G((Goal: Admin services deploy alone))', ...body, '```', ''].join(eol)
const VALID_BODY = [
	'  classDef observed fill:#2e7d32,stroke:#66bb6a',
	'  P1["[ ] {P1} Golden Master on AdminService<br/>discovered: a1b2c3d<br/>error: n/a (coverage seed)"]',
	'  P2["[ ] {P2} Extract AdminRepository (src/Admin.cs:40)<br/>discovered: a1b2c3d<br/>error: src/Admin.cs:40: CS0246"]',
	'  P3["[x] {P3} Split connection string<br/>discovered: a1b2c3d<br/>error: src/Db.cs:5: coupling"]',
	'  P4["<seam for notification gateway, not yet attempted>"]',
	'  G --> P1',
	'  G --> P2',
	'  P2 --> P3',
	'  P2 -.requires.-> P4',
	'  class P1,P2,P3 observed',
	'  class P4 anticipated',
	'  class P4 observed',
]

async function workspace(t, prefix = 'mikado-') {
	const dir = await mkdtemp(join(tmpdir(), prefix))
	t.after(() => rm(dir, { recursive: true, force: true }))
	return dir
}

function run(twin, args, cwd) {
	const result = spawnSync(twin.cmd, [...twin.args, ...args], { cwd, encoding: 'utf8' })
	assert.equal(result.error, undefined, `${twin.name} did not start`)
	return { code: result.status, out: result.stdout, err: result.stderr }
}

async function check(t, twin, text, { args = ['--no-git'], name = 'graph.md', dir } = {}) {
	const cwd = dir ?? await workspace(t)
	const file = join(cwd, name)
	await writeFile(file, text)
	return run(twin, [...args, file], cwd)
}

for (const twin of TWINS) {
	const skip = !twin.cmd && !process.env.CI && `${twin.name} is not installed on this machine`
	const contract = (title, fn) => test(`validate-mikado (${twin.name}): ${title}`, { skip }, (t) => {
		assert.ok(twin.cmd, `${twin.name} must be installed where CI runs this contract`)
		return fn(t)
	})

	contract('a traced, acyclic graph with a golden master is valid and lists its true leaves', async (t) => {
		const result = await check(t, twin, graph(VALID_BODY))
		assert.equal(result.code, 0, result.err)
		assert.equal(result.err, '')
		assert.match(result.out, /Goal node found: \{G\}/)
		assert.match(result.out, /\{P4\} anticipated/)
		assert.match(result.out, /Skipped \(--no-git\)/)
		assert.match(result.out, /Leaf ready: \{P1\} \[ \] \{P1\} Golden Master on AdminService/)
		assert.match(result.out, /Leaf ready: \{P4\}/)
		assert.doesNotMatch(result.out, /Leaf ready: \{P2\}/)
		assert.doesNotMatch(result.out, /Leaf ready: \{P3\}/)
		assert.match(result.out, /Nodes parsed : 5/)
		assert.match(result.out, /Warnings {5}: 0/)
		assert.match(result.out, /Result {7}: VALID/)
	})

	contract('a Windows checkout with CRLF line endings, in a folder with spaces, validates the same', async (t) => {
		const dir = await workspace(t, 'mikado folder ')
		const result = await check(t, twin, graph(VALID_BODY, '\r\n'), { dir, name: 'graph with spaces.md' })
		assert.equal(result.code, 0, result.err)
		assert.match(result.out, /Leaf ready: \{P1\}/)
		assert.match(result.out, /Result {7}: VALID/)
	})

	contract('a missing goal, an untraced node, an unknown reference and a cycle each fail', async (t) => {
		const result = await check(t, twin, ['```mermaid', 'graph TD', '  P1["[ ] {P1} a<br/>discovered: abc1234<br/>error: x.cs:1: boom"]', '  P2["[ ] {P2} b"]',
			'  P1 --> P2', '  P2 --> P1', '  P2 -.requires.-> P9', '%% no-golden-master: coverage 95% on Admin', '```'].join('\n'))
		assert.equal(result.code, 1)
		assert.match(result.err, /No goal node found/)
		assert.match(result.err, /\{P2\} missing 'discovered:' and\/or 'error:'/)
		assert.match(result.err, /requires edge \{P2\} -> \{P9\}: unknown node id/)
		assert.match(result.err, /Cycle detected involving \{P1\}/)
		assert.match(result.err, /Cycle detected involving \{P2\}/)
		assert.doesNotMatch(result.err, /\{P1\} missing/)
		assert.match(result.out, /No true leaves ready/)
		assert.match(result.out, /Result {7}: INVALID - 5 error\(s\) found/)
	})

	contract('a duplicate node id, an orphan and a missing golden master are reported', async (t) => {
		const result = await check(t, twin, graph(['  P1["[ ] {P1} a<br/>discovered: abc1234<br/>error: x.cs:1: boom"]', '  P1["again"]', '  P5["[ ] {P5} loose<br/>discovered: abc1234<br/>error: y.cs:2: boom"]', '  G --> P1']))
		assert.equal(result.code, 1)
		assert.match(result.err, /Duplicate node id: \{P1\}/)
		assert.match(result.err, /No golden master node/)
		assert.match(result.out, /\[WARN\] {2}\{P5\} appears unreferenced/)
		assert.match(result.out, /Warnings {5}: 1/)
	})

	contract('node ids differing only by case name two nodes', async (t) => {
		const result = await check(t, twin, graph([...VALID_BODY, '  p1["[ ] {p1} lower case twin<br/>discovered: a1b2c3d<br/>error: z.cs:3: boom"]', '  P2 --> p1']))
		assert.equal(result.code, 0, result.err)
		assert.doesNotMatch(result.err, /Duplicate node id/)
		assert.match(result.out, /Leaf ready: \{p1\}/)
		assert.match(result.out, /Nodes parsed : 6/)
	})

	contract('a missing graph file is refused with the usage', async (t) => {
		const dir = await workspace(t)
		const result = run(twin, [join(dir, 'absent.md')], dir)
		assert.equal(result.code, 1)
		assert.match(result.err, /ERROR: graph file not found: .*absent\.md/)
		assert.match(result.err, /Usage: /)
	})

	contract('with git, a child must be discovered in a mikado-graph commit at or after its parent', async (t) => {
		const dir = await workspace(t, 'mikado-git-')
		const git = (...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=T', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim()
		git('init', '-q')
		await writeFile(join(dir, 'a.txt'), '1')
		git('add', '.')
		git('commit', '-qm', 'refactor(mikado-graph): seed the graph')
		const parent = git('rev-parse', 'HEAD')
		await writeFile(join(dir, 'a.txt'), '2')
		git('commit', '-qam', 'chore: unrelated wording')
		const child = git('rev-parse', 'HEAD')
		const text = graph([
			`  P1["[ ] {P1} Golden Master<br/>discovered: ${parent}<br/>error: n/a"]`,
			`  P2["[ ] {P2} child<br/>discovered: ${child}<br/>error: a.cs:1: boom"]`,
			`  P3["[ ] {P3} before its parent<br/>discovered: ${parent}<br/>error: b.cs:1: boom"]`,
			'  P4["[ ] {P4} unknown commit<br/>discovered: 0123456789abcdef<br/>error: c.cs:1: boom"]',
			'  G --> P1', '  P1 --> P2', '  P2 --> P3', '  P1 --> P4',
		])
		const result = await check(t, twin, text, { args: [], dir })
		assert.equal(result.code, 1)
		assert.match(result.err, new RegExp(`\\{P2\\} discovered-by ${child.slice(0, 7)}: commit message must start with 'refactor\\(mikado-graph\\): ' \\(got: "chore: unrelated wording"\\)`))
		assert.match(result.out, new RegExp(`\\{P2\\} \\(${child.slice(0, 7)}\\) discovered after \\{P1\\} \\(${parent.slice(0, 7)}\\)`))
		assert.match(result.err, /\{P3\} \(discovered-by: [0-9a-f]{7}\) appears to have been discovered BEFORE its parent \{P2\}/)
		assert.match(result.err, /\{P4\} discovered-by 0123456: commit not found in git history/)
		assert.doesNotMatch(result.err, /\{P3\} discovered-by [0-9a-f]{7}: commit message/)
	})
}
