import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

// SKRAFT_MUTATION_GATE_CLI runs this suite against a copy bundled in a skill (skill-bundles test).
const CLI = process.env.SKRAFT_MUTATION_GATE_CLI ?? fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/mutation-gate.mjs', import.meta.url))
const { runMutationGate } = await import(pathToFileURL(CLI).href)

// A stand-in for the developer's mutation script, run from the component root: reads
// ../scenario.json, writes its scopes to $SKRAFT_MUTATION_RESULT as given (nothing for `-`), may
// touch a source, exits with its code. Arguments are echoed.
const TOOL = `import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
const { scopes, exit = 0, touch, raw } = JSON.parse(readFileSync('../scenario.json', 'utf8'))
console.log('fake tool ran with', process.argv.slice(2).join(' '))
console.log('survived: src/order.js:5 Equality')
if (raw !== undefined) writeFileSync(process.env.SKRAFT_MUTATION_RESULT, raw)
else if (scopes !== '-') writeFileSync(process.env.SKRAFT_MUTATION_RESULT, JSON.stringify({ scopes }))
if (touch) appendFileSync(touch, '// mutated\\n')
process.exit(exit)
`

const TOOL_COMMAND = 'node ../tool.mjs'

// scenario: what the tool does; config: skraft-config.json, absent when undefined.
async function repository(t, { scenario, config }) {
	const root = await mkdtemp(join(tmpdir(), 'qg-mutation-'))
	t.after(() => rm(root, { recursive: true, force: true }))
	const put = async (name, body) => {
		await mkdir(dirname(join(root, name)), { recursive: true })
		await writeFile(join(root, name), body)
	}
	await put('tool.mjs', TOOL)
	await put('web/src/order.js', 'export const total = (a) => a > 100\n')
	await put('.gitignore', 'evidence/\nscenario.json\n')
	if (scenario !== undefined) await put('scenario.json', JSON.stringify(scenario))
	if (config !== undefined) await put('skraft-config.json', JSON.stringify(config))
	execFileSync('git', ['init', '-q', root])
	execFileSync('git', ['-C', root, 'add', '.'])
	execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'])
	return { root, read: (name) => readFile(join(root, name), 'utf8'), put }
}

const web = ({ command = TOOL_COMMAND, ...patch } = {}) => ({ components: [{ name: 'web', root: 'web', stack: 'javascript', commands: { mutation: command }, ...patch }] })
const gate = (root, extra = {}) => runMutationGate({ root, evidence: 'evidence', ...extra })

test('a declared command runs with SKRAFT_MUTATION_RESULT and passes when core and boundary meet 80%', async (t) => {
	const r = await repository(t, { config: web(), scenario: { scopes: [{ name: 'core', score: 80, survivors: ['src/order.js:1 EqualityOperator -> a >= 100'] }, { name: 'boundary', score: 92.5, survivors: ['src/order.js:1'] }] } })
	const result = await gate(r.root)
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	const stdout = await r.read('evidence/qg-mutation.stdout')
	assert.match(stdout, /^survived: web\/src\/order.js:1 EqualityOperator -> a >= 100 \(web core\)$/m)
	assert.match(stdout, /^survived: web\/src\/order.js:1 \(web boundary\)$/m)
	assert.match(stdout, /web core: 80.00% meets 80%/)
	assert.match(stdout, /web boundary: 92.50% meets 80%/)
	assert.match(stdout, /mutation scores meet 80% \(web core 80.00%, web boundary 92.50%\)/)
	assert.equal((await r.read('evidence/qg-mutation.exit')).trim(), '0')
	assert.match(await r.read('evidence/qg-mutation/web.log'), /survived: src\/order.js:5 Equality/)
	assert.deepEqual(JSON.parse(await r.read('evidence/qg-mutation/web.result.json')).scopes.map(({ name }) => name), ['core', 'boundary'])
	const manifest = JSON.parse(await r.read('evidence/qg-mutation/manifest.json'))
	assert.equal(manifest.bar, 80)
	assert.equal(manifest.components[0].command, TOOL_COMMAND)
	assert.deepEqual(manifest.components[0].result.map(({ name, score }) => ({ name, score })), [{ name: 'core', score: 80 }, { name: 'boundary', score: 92.5 }])
	assert.equal(manifest.verdict.survivors.length, 2)
})

test('a single project reports one global score; a team that leaves survivors out is told so', async (t) => {
	const r = await repository(t, { config: web(), scenario: { scopes: [{ name: 'global', score: 85 }] } })
	const result = await gate(r.root)
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	assert.match(result.lines.join('\n'), /^web global: 85.00% meets 80% \(survivors not reported\)$/m)
	assert.doesNotMatch(result.lines.join('\n'), /survived:/)
})

test('a scope below 80% fails the gate and lists the survivors to kill', async (t) => {
	const r = await repository(t, { config: web(), scenario: { scopes: [{ name: 'core', score: 75, survivors: ['src/order.js:1 ConditionalExpression -> true'] }, { name: 'boundary', score: 90, survivors: [] }] } })
	const result = await gate(r.root)
	assert.equal(result.exitCode, 1)
	assert.match(result.lines.join('\n'), /survived: web\/src\/order.js:1 ConditionalExpression -> true \(web core\)/)
	assert.match(result.lines.join('\n'), /web: core 75% is below 80%/)
	assert.equal((await r.read('evidence/qg-mutation.exit')).trim(), '1')
})

test('without any mutation command the gate does not run: exit 3, and it says the developer owns it', async (t) => {
	for (const config of [undefined, { components: [{ name: 'web', root: 'web', commands: { test: 'npm test' } }] }]) {
		const r = await repository(t, { config })
		const result = await gate(r.root)
		assert.equal(result.exitCode, 3)
		assert.match(await r.read('evidence/qg-mutation.stdout'), /G6 not run: no component declares commands.mutation in skraft-config.json/)
		assert.match(await r.read('evidence/qg-mutation.stdout'), /developer's responsibility/)
		assert.equal((await r.read('evidence/qg-mutation.exit')).trim(), '3')
	}
})

test('a command that writes no result, or a malformed one, fails the gate', async (t) => {
	const r = await repository(t, { config: web(), scenario: { scopes: '-' } })
	const missing = await gate(r.root)
	assert.equal(missing.exitCode, 1)
	assert.match(missing.lines.join('\n'), /web: the mutation result is missing: the command wrote nothing to \$SKRAFT_MUTATION_RESULT/)
	await writeFile(join(r.root, 'scenario.json'), JSON.stringify({ raw: JSON.stringify({ scopes: [{ name: 'core', score: 99, survivors: [] }] }) }))
	assert.match((await gate(r.root)).lines.join('\n'), /expected core and boundary, or global/)
	await writeFile(join(r.root, 'scenario.json'), JSON.stringify({ raw: JSON.stringify({ scopes: [{ name: 'global', score: 99, survivors: [{ file: 'a' }] }] }) }))
	assert.match((await gate(r.root)).lines.join('\n'), /web: the mutation result global lists a survivor that is not "file:line detail"/)
})

test('a stale result never passes: each run starts from an empty evidence folder', async (t) => {
	const r = await repository(t, { config: web(), scenario: { scopes: [{ name: 'global', score: 99 }] } })
	assert.equal((await gate(r.root)).exitCode, 0)
	await writeFile(join(r.root, 'scenario.json'), JSON.stringify({ scopes: '-' }))
	assert.equal((await gate(r.root)).exitCode, 1)
})

test('a command that exits non-zero fails the gate even with passing scores', async (t) => {
	const r = await repository(t, { config: web(), scenario: { scopes: [{ name: 'global', score: 99 }], exit: 4 } })
	const result = await gate(r.root)
	assert.equal(result.exitCode, 1)
	assert.match(result.lines.join('\n'), /web: the mutation command exited 4/)
})

test('a tool that leaves a tracked source modified fails the gate', async (t) => {
	const r = await repository(t, { config: web(), scenario: { scopes: [{ name: 'global', score: 99 }], touch: 'src/order.js' } })
	const result = await gate(r.root)
	assert.equal(result.exitCode, 1)
	assert.match(result.lines.join('\n'), /left tracked files modified: web\/src\/order.js/)
})

test('{baseSha} takes --since; without it the gate is blocked (exit 2)', async (t) => {
	const r = await repository(t, { config: web({ command: `${TOOL_COMMAND} {baseSha}` }), scenario: { scopes: [{ name: 'global', score: 99 }] } })
	const blocked = await gate(r.root)
	assert.equal(blocked.exitCode, 2)
	assert.match(blocked.lines.join('\n'), /--since/)
	const result = await gate(r.root, { since: 'HEAD' })
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	const base = execFileSync('git', ['-C', r.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
	assert.match(await r.read('evidence/qg-mutation/web.log'), new RegExp(`fake tool ran with ${base}`))
})

test('an invalid mutation entry blocks the gate (exit 2) and still deposits its evidence', async (t) => {
	const r = await repository(t, { config: web({ root: '../out' }), scenario: { scopes: [{ name: 'global', score: 99 }] } })
	const result = await gate(r.root)
	assert.equal(result.exitCode, 2)
	assert.match(result.lines.join('\n'), /root must be a folder inside the repository/)
	assert.equal(existsSync(join(r.root, 'evidence/qg-mutation.exit')), true)
})

// mutation.pipeline false: the developer runs /skraft-mutation into .copilot-tracking/mutation;
// DELIVER's --pipeline run reuses it when it judged HEAD on a clean working copy.
const outside = (patch = {}) => ({ ...web(patch), mutation: { pipeline: false } })
const manual = (root) => runMutationGate({ root, evidence: '.copilot-tracking/mutation' })
const deliver = (root) => runMutationGate({ root, evidence: 'evidence', pipeline: true })

test('outside the pipeline, DELIVER does not run G6 until the developer ran /skraft-mutation on HEAD', async (t) => {
	const r = await repository(t, { config: outside(), scenario: { scopes: [{ name: 'global', score: 91, survivors: [] }] } })
	await writeFile(join(r.root, '.gitignore'), 'evidence/\nscenario.json\n.copilot-tracking/\n')
	execFileSync('git', ['-C', r.root, '-c', 'user.name=T', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qam', 'ignore'])
	const before = await deliver(r.root)
	assert.equal(before.exitCode, 3)
	assert.match(before.lines.join('\n'), /mutation runs outside the pipeline .* Run \/skraft-mutation, then deliver again/s)
	assert.doesNotMatch(await r.read('evidence/qg-mutation/web.log').catch(() => 'no log'), /fake tool ran/)

	assert.equal((await manual(r.root)).exitCode, 0)
	const reused = await deliver(r.root)
	assert.equal(reused.exitCode, 0, reused.lines.join('\n'))
	assert.match(reused.lines[0], /G6 reuses the developer's \/skraft-mutation run on HEAD [0-9a-f]{40}/)
	assert.equal(await r.read('evidence/qg-mutation.stdout'), await r.read('.copilot-tracking/mutation/qg-mutation.stdout'))
	assert.equal(await r.read('evidence/qg-mutation.stdout.sha256'), await r.read('.copilot-tracking/mutation/qg-mutation.stdout.sha256'))
	assert.equal((await r.read('evidence/qg-mutation.exit')).trim(), '0')

	await writeFile(join(r.root, 'web/src/order.js'), 'export const total = (a) => a > 99\n')
	execFileSync('git', ['-C', r.root, '-c', 'user.name=T', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qam', 'work'])
	assert.equal((await deliver(r.root)).exitCode, 3, 'a run on an older HEAD stands for nothing')
})

test('a developer run on a modified working copy is not reused', async (t) => {
	const r = await repository(t, { config: outside(), scenario: { scopes: [{ name: 'global', score: 91, survivors: [] }] } })
	await writeFile(join(r.root, 'web/src/order.js'), 'export const total = (a) => a > 1\n')
	assert.equal((await manual(r.root)).exitCode, 0)
	assert.equal(JSON.parse(await r.read('.copilot-tracking/mutation/qg-mutation/manifest.json')).clean, false)
	assert.equal((await deliver(r.root)).exitCode, 3)
})

test('a failed developer run on HEAD fails G6 in DELIVER', async (t) => {
	const r = await repository(t, { config: outside(), scenario: { scopes: [{ name: 'global', score: 40, survivors: ['src/order.js:1 x'] }] } })
	assert.equal((await manual(r.root)).exitCode, 1)
	const result = await deliver(r.root)
	assert.equal(result.exitCode, 1)
	assert.match(result.lines.join('\n'), /survived: web\/src\/order.js:1 x/)
})

test('in the pipeline (the default), --pipeline runs the command as any run does', async (t) => {
	const r = await repository(t, { config: { ...web(), mutation: { pipeline: true } }, scenario: { scopes: [{ name: 'global', score: 91, survivors: [] }] } })
	const result = await deliver(r.root)
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	assert.match(await r.read('evidence/qg-mutation/web.log'), /fake tool ran/)
	assert.equal(JSON.parse(await r.read('evidence/qg-mutation/manifest.json')).clean, true)
})
