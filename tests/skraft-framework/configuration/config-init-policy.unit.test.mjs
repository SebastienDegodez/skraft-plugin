import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	addComponents, componentName, detectStack, familyOf, setMutation,
} from '../../../plugins/skraft-framework/src/domain/config-init-policy.mjs'

const folder = (files, dirs = [], texts = {}) => ({ files, dirs, read: (name) => texts[name] ?? null })

test('a folder\'s stack comes from its markers, first found wins', () => {
	assert.equal(detectStack(folder(['Shop.sln'])), 'dotnet')
	assert.equal(detectStack(folder(['Shop.Api.csproj'])), 'dotnet')
	assert.equal(detectStack(folder(['pom.xml'])), 'java')
	assert.equal(detectStack(folder(['build.gradle.kts'])), 'java')
	assert.equal(detectStack(folder(['pyproject.toml'])), 'python')
	assert.equal(detectStack(folder(['requirements.txt'])), 'python')
	assert.equal(detectStack(folder(['package.json'], [], { 'package.json': '{"dependencies":{"react":"19"}}' })), 'react')
	assert.equal(detectStack(folder(['package.json'], [], { 'package.json': '{"devDependencies":{"typescript":"5"}}' })), 'typescript')
	assert.equal(detectStack(folder(['package.json'], [], { 'package.json': '{"devDependencies":{"vitest":"4"}}' })), 'typescript')
	assert.equal(detectStack(folder(['package.json'], [], { 'package.json': '{}' })), 'javascript')
	assert.equal(detectStack(folder(['package.json'], [], { 'package.json': 'not json' })), 'javascript')
	assert.equal(detectStack(folder(['package.json'])), 'javascript')
	assert.equal(detectStack(folder(['Shop.sln', 'package.json'])), 'dotnet')
	assert.equal(detectStack(folder(['README.md'], ['src'])), null)
})

test('JavaScript stacks share one family; the others are their own', () => {
	assert.deepEqual(['react', 'typescript', 'javascript', 'dotnet', 'python'].map(familyOf), ['js', 'js', 'js', 'dotnet', 'python'])
})

test('a component is named after its folder, in kebab-case', () => {
	assert.equal(componentName('PaymentApi'), 'payment-api')
	assert.equal(componentName('web_front'), 'web-front')
	assert.equal(componentName('--'), 'app')
})

test('init adds the projects not listed yet, after the listed ones, and changes nothing else', () => {
	const raw = { baseBranch: 'main', teamOwner: 'x', components: [{ name: 'api', root: 'api', stack: 'dotnet', commands: { test: 'dotnet test' } }] }
	const { config, added } = addComponents(raw, [{ root: 'api', stack: 'dotnet' }, { root: 'web', stack: 'react' }, { root: 'tools/Api', stack: 'python' }], 'shop')
	assert.deepEqual(added, [{ name: 'web', root: 'web', stack: 'react' }, { name: 'api-2', root: 'tools/Api', stack: 'python' }])
	assert.deepEqual(config, { ...raw, components: [...raw.components, ...added] })
	assert.deepEqual(raw.components.length, 1)
})

test('the repository root is named after the working copy', () => {
	assert.deepEqual(addComponents({}, [{ root: '.', stack: 'python' }], 'Payment').added, [{ name: 'payment', root: '.', stack: 'python' }])
})

test('mutation settings: the pipeline switch and each component\'s command, nothing else touched', () => {
	const raw = { mutation: { other: 1 }, components: [{ name: 'api', root: 'api', commands: { test: 'dotnet test' } }, { name: 'web', root: 'web' }] }
	const { config, problems } = setMutation(raw, { pipeline: false, commands: [{ component: 'web', command: ' node scripts/mutation.mjs ' }] })
	assert.deepEqual(problems, [])
	assert.deepEqual(config, {
		mutation: { other: 1, pipeline: false },
		components: [{ name: 'api', root: 'api', commands: { test: 'dotnet test' } }, { name: 'web', root: 'web', commands: { mutation: 'node scripts/mutation.mjs' } }],
	})
	assert.equal(raw.mutation.pipeline, undefined)
	assert.deepEqual(setMutation({ components: [] }, { pipeline: true, commands: [] }).config, { components: [], mutation: { pipeline: true } })
})

test('a mutation setting the file cannot take is refused, and nothing is written', () => {
	const raw = { components: [{ name: 'api', root: 'api' }] }
	assert.deepEqual(setMutation(raw, { pipeline: 'yes', commands: [] }).problems, ['pipeline is true or false'])
	assert.deepEqual(setMutation(raw, { pipeline: true, commands: [{ component: 'web', command: 'x' }] }).problems, ['web is not a component of skraft-config.json; run init components first'])
	assert.deepEqual(setMutation(raw, { pipeline: true, commands: [{ component: 'api', command: ' ' }] }).problems, ['api: the mutation command is empty'])
	assert.equal(setMutation(raw, { pipeline: true, commands: [{ component: 'api', command: ' ' }] }).config, null)
	assert.deepEqual(setMutation({ components: 'x' }, { pipeline: true, commands: [] }).problems, ['components must be a list'])
})

test('every marker counts, and only as the file\'s extension or exact name', () => {
	assert.equal(detectStack(folder(['setup.py'])), 'python')
	assert.equal(detectStack(folder(['setup.cfg'])), 'python')
	assert.equal(detectStack(folder(['build.gradle'])), 'java')
	assert.equal(detectStack(folder(['Shop.slnx'])), 'dotnet')
	assert.equal(detectStack(folder(['Lib.fsproj'])), 'dotnet')
	assert.equal(detectStack(folder(['Shop.sln.bak', 'Lib.csproj.user'])), null)
	assert.equal(componentName('a--b__c'), 'a-b-c')
})

test('names stay unique through every collision, and unreadable entries are tolerated', () => {
	const { added } = addComponents({ components: [null, { name: 'api', root: 'x' }, { name: 'api-2', root: 'y' }] }, [{ root: 'z/api', stack: 'dotnet' }], 'shop')
	assert.deepEqual(added, [{ name: 'api-3', root: 'z/api', stack: 'dotnet' }])
	assert.deepEqual(addComponents(undefined, [{ root: '.', stack: 'python' }], 'pay').added, [{ name: 'pay', root: '.', stack: 'python' }])
})

test('a mutation setting keeps no foreign mutation value and refuses a command that is not text', () => {
	assert.deepEqual(setMutation({ mutation: 'off' }, { pipeline: true, commands: [] }).config, { mutation: { pipeline: true }, components: [] })
	assert.deepEqual(setMutation({ components: [{ name: 'api' }] }, { pipeline: true, commands: [{ component: 'api', command: 3 }] }).problems, ['api: the mutation command is empty'])
	assert.deepEqual(setMutation({}, { pipeline: false, commands: [] }).problems, [])
})
