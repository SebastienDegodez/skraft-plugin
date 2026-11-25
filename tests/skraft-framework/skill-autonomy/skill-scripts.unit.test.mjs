import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { capture, parseCaptureArgs } from '../../../plugins/skraft-framework/skills/quality-gates-dotnet/scripts/capture.mjs'
import { recordNotApplicable, recordScreenshots, restamp, summaryOf } from '../../../plugins/skraft-framework/skills/quality-gates-dotnet/scripts/gate-log.mjs'

const skills = fileURLToPath(new URL('../../../plugins/skraft-framework/skills/', import.meta.url))

async function scratch(t) {
	const dir = await mkdtemp(join(tmpdir(), 'skill-scripts-'))
	t.after(() => rm(dir, { recursive: true, force: true }))
	return dir
}

// A repository whose evidence directory Git ignores, as the contract requires.
async function repository(t) {
	const dir = await scratch(t)
	const git = (...args) => execFileSync('git', ['-C', dir, '-c', 'user.email=e@x', '-c', 'user.name=E', ...args], { encoding: 'utf8' })
	writeFileSync(join(dir, '.gitignore'), '.copilot-tracking/skraft-plans/*/evidence/\n')
	git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', 'chore(s): base')
	return { dir, head: git('rev-parse', 'HEAD').trim() }
}
const LOG = '.copilot-tracking/skraft-plans/p/evidence/d/story/qg-story.json'

test('capture records the gates a command attests in the log, from its exit code, and keeps no other file', async (t) => {
	const { dir, head } = await repository(t)
	const result = await capture({ log: LOG, gates: ['test.acceptance', 'test.unit'], cwd: dir, command: process.execPath, args: ['-e', 'console.log("out"); console.error("err"); process.exit(3)'] })
	assert.equal(result.code, 3)
	assert.match(result.tail, /out/)
	assert.match(result.tail, /err/)
	assert.deepEqual(readdirSync(join(dir, '.copilot-tracking/skraft-plans/p/evidence/d/story')), ['qg-story.json'])
	const log = JSON.parse(await readFile(join(dir, LOG), 'utf8'))
	assert.deepEqual([log.$schema, log.story, log.repo_root_rev, log.tech_adapter], ['quality-gates-evidence/v7', 'story', head, 'quality-gates-dotnet'])
	assert.deepEqual(log.gates.map(({ id, status, summary }) => [id, status, summary]), [['test.acceptance', 'fail', 'err'], ['test.unit', 'fail', 'err']])
	await capture({ log: LOG, gates: ['test.unit'], cwd: dir, command: process.execPath, args: ['-e', 'console.log("ok")'] })
	const next = JSON.parse(await readFile(join(dir, LOG), 'utf8'))
	assert.deepEqual(next.gates.map(({ id, status }) => [id, status]), [['test.acceptance', 'fail'], ['test.unit', 'pass']])
})

test('capture records a command that cannot start as exit 127', async (t) => {
	const { dir } = await repository(t)
	const result = await capture({ log: LOG, gates: ['build.compile'], cwd: dir, command: 'no-such-command-skraft', args: [] })
	assert.equal(result.code, 127)
	assert.equal(JSON.parse(await readFile(join(dir, LOG), 'utf8')).gates[0].status, 'fail')
})

test('capture refuses a log Git does not ignore, before running anything', async (t) => {
	const { dir } = await repository(t)
	await assert.rejects(() => capture({ log: 'tracked/qg-story.json', gates: ['build.compile'], cwd: dir, command: process.execPath, args: ['-e', 'require("fs").writeFileSync("ran", "")'] }), /not ignored by Git/)
	assert.equal(existsSync(join(dir, 'ran')), false)
})

test('gate-log restamps a reworded HEAD, and refuses once the code changed', async (t) => {
	const { dir } = await repository(t)
	const git = (...args) => execFileSync('git', ['-C', dir, '-c', 'user.email=e@x', '-c', 'user.name=E', ...args], { encoding: 'utf8' }).trim()
	writeFileSync(join(dir, 'a.txt'), 'a\n'); git('add', '.'); git('commit', '-q', '-m', 'wip')
	await capture({ log: LOG, gates: ['build.compile'], cwd: dir, command: process.execPath, args: ['-e', ''] })
	git('commit', '-q', '--amend', '-s', '-m', 'feat(s): a')
	assert.equal(restamp({ root: dir, log: LOG }).repo_root_rev, git('rev-parse', 'HEAD'))
	writeFileSync(join(dir, 'a.txt'), 'b\n'); git('commit', '-q', '-s', '-am', 'feat(s): b')
	assert.throws(() => restamp({ root: dir, log: LOG }), /the code changed since the gates ran/)
})

test('capture arguments need a log, the gates and a command', () => {
	assert.deepEqual(parseCaptureArgs(['--log', 'ev/qg-s.json', '--gate', 'test.acceptance,test.unit', '--', 'dotnet', 'test']), { log: 'ev/qg-s.json', gate: 'test.acceptance,test.unit', gates: ['test.acceptance', 'test.unit'], command: 'dotnet', args: ['test'] })
	assert.throws(() => parseCaptureArgs(['--log', 'ev/qg-s.json', '--gate', 'test.unit']))
	assert.throws(() => parseCaptureArgs(['--gate', 'test.unit', '--', 'dotnet']))
	assert.throws(() => parseCaptureArgs(['--evidence', 'ev', '--name', 'qg', '--', 'dotnet']))
})

test('gate-log records screenshots and a not-applicable gate with its rationale', async (t) => {
	const { dir } = await repository(t)
	writeFileSync(join(dir, 'home.png'), 'PNG bytes')
	recordScreenshots({ root: dir, log: LOG, pictures: ['home.png'] })
	recordNotApplicable({ root: dir, log: LOG, id: 'test.no-mocks-core', rationale: 'no core in a pure UI story' })
	const log = JSON.parse(await readFile(join(dir, LOG), 'utf8'))
	assert.deepEqual(log.gates.map(({ id, status }) => [id, status]), [['evidence.screenshots', 'pass'], ['test.no-mocks-core', 'not_applicable']])
	assert.deepEqual(log.gates[0].screenshots, [{ ref: 'evidence/d/story/screenshots/home.png', sha256: createHash('sha256').update('PNG bytes').digest('hex') }])
	assert.throws(() => recordNotApplicable({ root: dir, log: LOG, id: 'test.unit', rationale: ' ' }), /--rationale is required/)
	assert.equal(summaryOf('a\n\n  last line  \n'), 'last line')
	assert.equal(summaryOf('x'.repeat(300)).length, 200)
})

test('every skill runs its own scripts from its own folder', () => {
	for (const skill of readdirSync(skills)) {
		const folder = join(skills, skill)
		const docs = ['SKILL.md', ...(existsSync(join(folder, 'references')) ? readdirSync(join(folder, 'references')).map((name) => `references/${name}`) : [])]
		for (const doc of docs) {
			if (!doc.endsWith('.md') || !existsSync(join(folder, doc))) continue
			const text = readFileSync(join(folder, doc), 'utf8')
			assert.doesNotMatch(text, /\$SKRAFT_PLUGIN_ROOT\/skills\//, `${skill}/${doc} reaches a skill script through the plugin root`)
			for (const [, script] of text.matchAll(/<skill>\/scripts\/([\w.-]+)/g)) {
				assert.ok(existsSync(join(folder, 'scripts', script)), `${skill}/${doc} runs scripts/${script}, which this skill does not ship`)
			}
		}
	}
})
