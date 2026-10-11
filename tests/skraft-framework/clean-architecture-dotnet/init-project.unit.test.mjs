import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { initProject } from '../../../plugins/skraft-framework/skills/clean-architecture-dotnet/scripts/init-project.mjs'

const FAKE = fileURLToPath(new URL('./fake-dotnet.fixture.mjs', import.meta.url))

async function scaffold(t, name) {
	const dir = await mkdtemp(join(tmpdir(), 'init-project-'))
	const log = join(dir, 'dotnet.log')
	t.after(() => rm(dir, { recursive: true, force: true }))
	const previous = { SKRAFT_DOTNET: process.env.SKRAFT_DOTNET, FAKE_DOTNET_LOG: process.env.FAKE_DOTNET_LOG }
	Object.assign(process.env, { SKRAFT_DOTNET: FAKE, FAKE_DOTNET_LOG: log })
	t.after(() => {
		for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : (process.env[key] = value)
	})
	initProject(name, { cwd: dir, log: () => {} })
	return { dir, calls: readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) }
}

test('each layer references only its inner neighbour', async (t) => {
	const { calls } = await scaffold(t, 'Ordering')
	const references = calls.filter((call) => call[0] === 'add' && call[2] === 'reference').map((call) => [call[1], call[3]])
	assert.deepEqual(references.slice(0, 3), [
		['src/Ordering.Application/Ordering.Application.csproj', 'src/Ordering.Domain/Ordering.Domain.csproj'],
		['src/Ordering.Infrastructure/Ordering.Infrastructure.csproj', 'src/Ordering.Application/Ordering.Application.csproj'],
		['src/Ordering.Api/Ordering.Api.csproj', 'src/Ordering.Infrastructure/Ordering.Infrastructure.csproj'],
	])
	assert.deepEqual(calls.at(-1), ['build'])
})

test('the unit test project gets no mocking library', async (t) => {
	const { calls } = await scaffold(t, 'Ordering')
	const packages = calls.filter((call) => call[2] === 'package').map((call) => `${call[1]} ${call[3]}`)
	assert.equal(packages.some((line) => /UnitTests/.test(line)), false)
	assert.ok(packages.includes('tests/Ordering.IntegrationTests/Ordering.IntegrationTests.csproj NetArchTest.Rules'))
})

test('templates are written with the project name and Class1.cs is removed', async (t) => {
	const { dir } = await scaffold(t, 'Ordering')
	const tests = readFileSync(join(dir, 'tests/Ordering.IntegrationTests/ArchitectureTests.cs'), 'utf8')
	assert.doesNotMatch(tests, /\[ProjectName\]/)
	assert.match(tests, /Ordering/)
	assert.ok(existsSync(join(dir, 'src/Ordering.Domain/IDomainMarker.cs')))
	assert.equal(existsSync(join(dir, 'src/Ordering.Domain/Class1.cs')), false)
})

test('a name that is not a C# identifier is refused before any dotnet call', () => {
	assert.throws(() => initProject('my project', { log: () => {} }), /C# identifier/)
})
