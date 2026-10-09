import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { validateMikado } from '../../../plugins/skraft-framework/skills/mikado-method/scripts/validate-mikado.mjs'

const graph = (body) => ['```mermaid', 'graph TD', '  G((Goal: Admin services deploy alone))', ...body, '```', ''].join('\n')
const VALID = graph([
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
])

async function check(t, text, args = ['--no-git']) {
	const dir = await mkdtemp(join(tmpdir(), 'mikado-'))
	t.after(() => rm(dir, { recursive: true, force: true }))
	const file = join(dir, 'graph.md')
	await writeFile(file, text)
	const out = []
	const err = []
	const code = validateMikado([...args, file], { out: (line) => out.push(line), err: (line) => err.push(line) })
	return { code, out: out.join('\n'), err: err.join('\n'), dir, file }
}

test('a traced, acyclic graph with a golden master is valid and lists its true leaves', async (t) => {
	const result = await check(t, VALID)
	assert.equal(result.code, 0, result.err)
	assert.match(result.out, /Leaf ready: \{P1\}/)
	assert.match(result.out, /Leaf ready: \{P4\}/)
	assert.doesNotMatch(result.out, /Leaf ready: \{P2\}/)
	assert.match(result.out, /Result {7}: VALID/)
})

test('a missing goal, an untraced node, an unknown reference and a cycle each fail', async (t) => {
	const result = await check(t, ['```mermaid', 'graph TD', '  P1["[ ] {P1} a<br/>discovered: abc1234<br/>error: x.cs:1: boom"]', '  P2["[ ] {P2} b"]',
		'  P1 --> P2', '  P2 --> P1', '  P2 -.requires.-> P9', '%% no-golden-master: coverage 95% on Admin', '```'].join('\n'))
	assert.equal(result.code, 1)
	assert.match(result.err, /No goal node found/)
	assert.match(result.err, /\{P2\} missing 'discovered:'/)
	assert.match(result.err, /requires edge \{P2\} -> \{P9\}: unknown node id/)
	assert.match(result.err, /Cycle detected involving \{P1\}/)
})

test('a duplicate node id and a missing golden master fail', async (t) => {
	const result = await check(t, graph(['  P1["[ ] {P1} a<br/>discovered: abc1234<br/>error: x.cs:1: boom"]', '  P1["again"]', '  G --> P1'])
		.replace('Golden', ''))
	assert.equal(result.code, 1)
	assert.match(result.err, /Duplicate node id: \{P1\}/)
	assert.match(result.err, /No golden master node/)
})

test('with git, a child must be discovered in a mikado-graph commit at or after its parent', async (t) => {
	const dir = await mkdtemp(join(tmpdir(), 'mikado-git-'))
	t.after(() => rm(dir, { recursive: true, force: true }))
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
		'  G --> P1', '  P1 --> P2',
	])
	const cwd = process.cwd()
	process.chdir(dir)
	try {
		const result = await check(t, text, [])
		assert.equal(result.code, 1)
		assert.match(result.err, /commit message must start with 'refactor\(mikado-graph\): '/)
		assert.match(result.out, /discovered after \{P1\}/)
	} finally {
		process.chdir(cwd)
	}
})
