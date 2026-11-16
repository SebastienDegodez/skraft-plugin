import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

// SKRAFT_INIT_CLI runs this suite against a copy bundled in a skill (skill-bundles test).
const CLI = process.env.SKRAFT_INIT_CLI ?? fileURLToPath(new URL('../../../plugins/skraft-framework/src/cli/skraft-init.mjs', import.meta.url))
const { runInit } = await import(pathToFileURL(CLI).href)

async function workingCopy(t, files) {
	const root = await mkdtemp(join(tmpdir(), 'skraft-init-'))
	t.after(() => rm(root, { recursive: true, force: true }))
	for (const [name, body] of Object.entries(files)) {
		await mkdir(dirname(join(root, name)), { recursive: true })
		await writeFile(join(root, name), body)
	}
	return { root, config: async () => JSON.parse(await readFile(join(root, 'skraft-config.json'), 'utf8')) }
}

const SHOP = {
	'api/Shop.sln': '',
	'api/src/Shop.Domain/Shop.Domain.csproj': '',
	'web/package.json': '{"dependencies":{"react":"19"}}',
	'web/node_modules/left-pad/package.json': '{}',
	'web/src/lib/package.json': '{}',
	'.github/package.json': '{}',
	'tools/scripts/report/pyproject.toml': '',
	'deep/a/b/c/pyproject.toml': '',
}

test('components: one per project found, named after its folder, written to skraft-config.json', async (t) => {
	const w = await workingCopy(t, SHOP)
	const result = await runInit(['components'], { cwd: w.root })
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	assert.deepEqual((await w.config()).components, [
		{ name: 'api', root: 'api', stack: 'dotnet' },
		{ name: 'report', root: 'tools/scripts/report', stack: 'python' },
		{ name: 'web', root: 'web', stack: 'react' },
	])
	assert.match(result.lines.join('\n'), /added: api \(dotnet, api\), report \(python, tools\/scripts\/report\), web \(react, web\)/)
})

test('components keeps what the file holds and adds only what is new', async (t) => {
	const w = await workingCopy(t, { ...SHOP, 'skraft-config.json': JSON.stringify({ teamOwner: 'shop', components: [{ name: 'backend', root: 'api', stack: 'dotnet', commands: { test: 'dotnet test' } }] }) })
	await runInit(['components'], { cwd: w.root })
	const config = await w.config()
	assert.equal(config.teamOwner, 'shop')
	assert.deepEqual(config.components.map(({ name }) => name), ['backend', 'report', 'web'])
	assert.deepEqual(config.components[0].commands, { test: 'dotnet test' })
	const again = await runInit(['components'], { cwd: w.root })
	assert.match(again.lines.join('\n'), /every project found is already listed \(3 components\)/)
})

test('mutation: the pipeline switch and the developer\'s command per component', async (t) => {
	const w = await workingCopy(t, SHOP)
	await runInit(['components'], { cwd: w.root })
	const result = await runInit(['mutation', '--pipeline', 'false', '--set', 'web=node scripts/mutation.mjs --since {baseSha}', '--set', 'api=dotnet tool run mutation'], { cwd: w.root })
	assert.equal(result.exitCode, 0, result.lines.join('\n'))
	const config = await w.config()
	assert.deepEqual(config.mutation, { pipeline: false })
	assert.equal(config.components.find(({ name }) => name === 'web').commands.mutation, 'node scripts/mutation.mjs --since {baseSha}')
	assert.equal(config.components.find(({ name }) => name === 'api').commands.mutation, 'dotnet tool run mutation')
	assert.match(result.lines.join('\n'), /mutation: not in the pipeline; the developer runs \/skraft-mutation/)
	assert.match((await runInit(['mutation', '--pipeline', 'true'], { cwd: w.root })).lines.join('\n'), /mutation: in the pipeline, G6 runs on every story/)
	assert.deepEqual((await w.config()).mutation, { pipeline: true })
})

test('a setting the file cannot take writes nothing and says why (exit 2)', async (t) => {
	const w = await workingCopy(t, SHOP)
	await runInit(['components'], { cwd: w.root })
	const before = await w.config()
	for (const argv of [['mutation', '--pipeline', 'maybe'], ['mutation', '--pipeline', 'true', '--set', 'nope=x'], ['mutation', '--pipeline', 'true', '--set', 'web'], ['other'], []]) {
		const result = await runInit(argv, { cwd: w.root })
		assert.equal(result.exitCode, 2, argv.join(' '))
	}
	assert.deepEqual(await w.config(), before)
	await writeFile(join(w.root, 'skraft-config.json'), '{ not json')
	assert.match((await runInit(['components'], { cwd: w.root })).lines.join('\n'), /skraft-config.json is not valid JSON/)
})
