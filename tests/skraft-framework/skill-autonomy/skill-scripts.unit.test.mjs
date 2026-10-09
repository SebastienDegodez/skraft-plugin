import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { capture, parseCaptureArgs } from '../../../plugins/skraft-framework/skills/quality-gates-dotnet/scripts/capture.mjs'
import { snapshot } from '../../../plugins/skraft-framework/skills/quality-gates-dotnet/scripts/snapshot.mjs'

const skills = fileURLToPath(new URL('../../../plugins/skraft-framework/skills/', import.meta.url))

async function scratch(t) {
	const dir = await mkdtemp(join(tmpdir(), 'skill-scripts-'))
	t.after(() => rm(dir, { recursive: true, force: true }))
	return dir
}

test('capture deposits merged output, exit code and its hash, and returns the command code', async (t) => {
	const dir = await scratch(t)
	const result = await capture({ evidence: join(dir, 'ev'), name: 'qg-tests', command: process.execPath, args: ['-e', 'console.log("out"); console.error("err"); process.exit(3)'] })
	assert.equal(result.code, 3)
	const stdout = await readFile(join(dir, 'ev/qg-tests.stdout'))
	assert.match(stdout.toString(), /out/)
	assert.match(stdout.toString(), /err/)
	assert.equal((await readFile(join(dir, 'ev/qg-tests.exit'), 'utf8')).trim(), '3')
	assert.equal((await readFile(join(dir, 'ev/qg-tests.stdout.sha256'), 'utf8')).trim(), createHash('sha256').update(stdout).digest('hex'))
})

test('capture records a command that cannot start as exit 127', async (t) => {
	const dir = await scratch(t)
	const result = await capture({ evidence: dir, name: 'qg-build', command: 'no-such-command-skraft', args: [] })
	assert.equal(result.code, 127)
	assert.equal((await readFile(join(dir, 'qg-build.exit'), 'utf8')).trim(), '127')
})

test('capture arguments need an evidence directory, a plain name and a command', () => {
	assert.deepEqual(parseCaptureArgs(['--evidence', 'ev', '--name', 'qg-red-1', '--', 'dotnet', 'test']), { evidence: 'ev', name: 'qg-red-1', command: 'dotnet', args: ['test'] })
	assert.throws(() => parseCaptureArgs(['--evidence', 'ev', '--name', '../x', '--', 'dotnet']))
	assert.throws(() => parseCaptureArgs(['--evidence', 'ev', '--name', 'qg']))
	assert.throws(() => parseCaptureArgs(['--name', 'qg', '--', 'dotnet']))
})

test('snapshot writes the exact bytes of a file at a revision', async (t) => {
	const dir = await scratch(t)
	execFileSync('git', ['init', '-q', dir])
	await writeFile(join(dir, 'Tests.cs'), 'first\r\nline é\n')
	// The blob keeps its CRLF whatever the runner's core.autocrlf: snapshot must return it unchanged.
	execFileSync('git', ['-C', dir, '-c', 'core.autocrlf=false', 'add', '.'])
	execFileSync('git', ['-C', dir, '-c', 'user.name=T', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'red'], { env: { ...process.env, HUSKY: '0' } })
	await writeFile(join(dir, 'Tests.cs'), 'changed\n')
	const path = snapshot({ evidence: join(dir, 'ev'), name: 'red-1-Tests.cs', file: 'Tests.cs', root: dir })
	assert.deepEqual(await readFile(path), Buffer.from('first\r\nline é\n'))
	assert.throws(() => snapshot({ evidence: dir, name: '../escape', file: 'Tests.cs', root: dir }))
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
