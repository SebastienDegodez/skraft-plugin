import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	MANUAL_EVIDENCE, MUTATION_BAR, RESULT_VARIABLE, inPipeline, mutationComponents, mutationVerdict, readResult, reusableRun, withBase,
} from '../../../plugins/skraft-framework/src/domain/mutation-gate-policy.mjs'

const component = (patch = {}) => ({ name: 'api', root: 'api', stack: 'dotnet', commands: { mutation: 'node mutation.mjs' }, ...patch })

test('every scope is held to 80%, and the result file comes through SKRAFT_MUTATION_RESULT', () => {
	assert.equal(MUTATION_BAR, 80)
	assert.equal(RESULT_VARIABLE, 'SKRAFT_MUTATION_RESULT')
})

test('only components that declare commands.mutation are run, folders and commands normalized', () => {
	const { components, problems } = mutationComponents({
		components: [
			component({ root: '.\\api\\', commands: { mutation: '  node mutation.mjs  ' } }),
			component({ name: 'web', root: undefined }),
			component({ name: 'docs', root: 'docs', commands: { test: 'true' } }),
			null, 'x', { name: 'n', commands: null },
		],
	})
	assert.deepEqual(problems, [])
	assert.deepEqual(components, [
		{ name: 'api', root: 'api', command: 'node mutation.mjs' },
		{ name: 'web', root: '.', command: 'node mutation.mjs' },
	])
})

test('a config without components or without any mutation command runs nothing', () => {
	assert.deepEqual(mutationComponents({}), { components: [], problems: [] })
	assert.deepEqual(mutationComponents(null), { components: [], problems: [] })
	assert.deepEqual(mutationComponents({ components: [component({ commands: {} })] }).components, [])
})

test('a mutation command the gate cannot place is a problem naming the entry, never a silent skip', () => {
	const problems = (patch) => mutationComponents({ components: [component(patch)] }).problems
	assert.deepEqual(mutationComponents({ components: 'x' }).problems, ['components must be a list'])
	assert.deepEqual(problems({ root: '../elsewhere' }), ['api: root must be a folder inside the repository'])
	assert.deepEqual(problems({ root: '/abs' }), ['api: root must be a folder inside the repository'])
	assert.deepEqual(problems({ root: 'C:/x' }), ['api: root must be a folder inside the repository'])
	assert.deepEqual(problems({ commands: { mutation: '  ' } }), ['api: commands.mutation must be a command'])
	assert.deepEqual(problems({ name: undefined }), ['components[0]: name is required'])
	assert.deepEqual(mutationComponents({ components: [component(), component()] }).problems, ['api: declared twice'])
	assert.deepEqual(problems({ root: '.' }), [])
	assert.deepEqual(mutationComponents({ components: [component({ root: 'apps/api' })] }).components[0].root, 'apps/api')
})

test('{baseSha} takes the base revision; a command that needs one without it is refused', () => {
	assert.equal(withBase('dotnet stryker --since:{baseSha}', 'abc'), 'dotnet stryker --since:abc')
	assert.equal(withBase('npx stryker run', undefined), 'npx stryker run')
	assert.throws(() => withBase('stryker --since {baseSha}', undefined), /--since/)
})

const result = (scopes) => JSON.stringify({ scopes })
const scope = (name, score, survivors = []) => ({ name, score, survivors })
const S = 'src/Domain/Order.cs:12 Equality -> age > 18'

test('a Clean Architecture result carries core and boundary, a single project one global score, each with its survivors', () => {
	assert.deepEqual(readResult(result([scope('boundary', 85.7, ['src/Api/A.cs:3']), scope('core', 97.6, [S])])), {
		ok: true,
		scopes: [
			{ name: 'core', score: 97.6, survivors: [{ file: 'src/Domain/Order.cs', line: 12, detail: 'Equality -> age > 18' }] },
			{ name: 'boundary', score: 85.7, survivors: [{ file: 'src/Api/A.cs', line: 3, detail: null }] },
		],
	})
	assert.deepEqual(readResult(result([scope('global', 82)])), { ok: true, scopes: [{ name: 'global', score: 82, survivors: [] }] })
	assert.deepEqual(readResult(result([scope('global', 0)])).scopes[0].score, 0)
	assert.deepEqual(readResult(result([scope('global', 100)])).scopes[0].score, 100)
})

test('a team may leave survivors out: the scope then reports none, distinct from an empty list', () => {
	assert.deepEqual(readResult(result([{ name: 'global', score: 90 }])), { ok: true, scopes: [{ name: 'global', score: 90, survivors: null }] })
})

test('a survivor is one "file:line detail" line, the file inside the component', () => {
	const read = (line) => readResult(result([scope('global', 90, [line])]))
	assert.deepEqual(read('.\\src\\a.ts:1').scopes[0].survivors, [{ file: 'src/a.ts', line: 1, detail: null }])
	assert.deepEqual(read('src/a b.ts:7   ConditionalExpression -> true  ').scopes[0].survivors, [{ file: 'src/a b.ts', line: 7, detail: 'ConditionalExpression -> true' }])
	for (const wrong of ['src/a.ts', 'src/a.ts:0', 'src/a.ts:x', ':3', '/abs/a.ts:1', 'C:\\a.ts:1', '../a.ts:1', '', 3, null]) {
		assert.equal(read(wrong).reason, 'global lists a survivor that is not "file:line detail" with the file inside the component', String(wrong))
	}
	assert.equal(readResult(result([{ name: 'global', score: 90, survivors: 'x' }])).reason, 'global survivors is not a list')
	assert.equal(readResult(result([scope('global', 100, [S])])).reason, 'global scores 100% yet lists 1 survivor(s)')
})

test('any other result is refused with its reason', () => {
	const reason = (text) => {
		const reading = readResult(text)
		assert.equal(reading.ok, false, text)
		return reading.reason
	}
	assert.match(reason(''), /empty/)
	assert.match(reason('{'), /JSON/)
	assert.match(reason('[]'), /scopes/)
	assert.match(reason('{"scopes": {}}'), /scopes/)
	assert.equal(reason(result([])), 'scopes (none); expected core and boundary, or global')
	assert.equal(reason(result([scope('core', 1), scope('ui', 1)])), 'scopes core, ui; expected core and boundary, or global')
	assert.match(reason(result([scope('core', 90)])), /core and boundary, or global/)
	assert.match(reason(result([scope('core', 90), scope('global', 90)])), /core and boundary, or global/)
	assert.match(reason(result([scope('core', 90), scope('core', 90)])), /core and boundary, or global/)
	assert.match(reason(result([null])), /name and a score/)
	assert.match(reason(result([scope('global', '90')])), /name and a score/)
	assert.match(reason(result([{ name: 'global', survivors: [] }])), /name and a score/)
	assert.match(reason(result([scope('global', 101)])), /between 0 and 100/)
	assert.match(reason(result([scope('global', -1)])), /between 0 and 100/)
})

const run = (name, exitCode, scopes) => ({ name, exitCode, reading: { ok: true, scopes: scopes.map((s) => ({ survivors: [], ...s })) } })

test('the gate passes when every scope of every component meets 80%, and hands every survivor on repository-relative', () => {
	const verdict = mutationVerdict([
		{ ...run('api', 0, [{ name: 'core', score: 80, survivors: [{ file: 'src/Domain/Order.cs', line: 12, detail: 'Equality -> age > 18' }] }, { name: 'boundary', score: 91.2 }]), root: 'api' },
		{ ...run('web', 0, [{ name: 'global', score: 85, survivors: null }]), root: '.' },
	])
	assert.equal(verdict.passed, true)
	assert.deepEqual(verdict.scores, [
		{ component: 'api', scope: 'core', score: 80, passed: true, survivorsReported: true },
		{ component: 'api', scope: 'boundary', score: 91.2, passed: true, survivorsReported: true },
		{ component: 'web', scope: 'global', score: 85, passed: true, survivorsReported: false },
	])
	assert.deepEqual(verdict.survivors, [{ component: 'api', scope: 'core', file: 'api/src/Domain/Order.cs', line: 12, detail: 'Equality -> age > 18' }])
	assert.deepEqual(verdict.problems, [])
})

test('a scope below 80%, a failed command or an unreadable result fails the gate', () => {
	const low = mutationVerdict([run('api', 0, [{ name: 'core', score: 79.99 }, { name: 'boundary', score: 95 }])])
	assert.equal(low.passed, false)
	assert.deepEqual(low.problems, ['api: core 79.99% is below 80%'])
	assert.deepEqual(low.scores.map(({ passed }) => passed), [false, true])
	assert.deepEqual(mutationVerdict([run('api', 2, [{ name: 'global', score: 99 }])]).problems, ['api: the mutation command exited 2'])
	assert.deepEqual(mutationVerdict([{ name: 'api', exitCode: 1, reading: { ok: false, reason: 'is missing' } }]).problems, ['api: the mutation command exited 1', 'api: the mutation result is missing'])
})

test('mutation runs in the pipeline unless the team set mutation.pipeline to false', () => {
	assert.equal(inPipeline({}), true)
	assert.equal(inPipeline(null), true)
	assert.equal(inPipeline({ mutation: {} }), true)
	assert.equal(inPipeline({ mutation: { pipeline: true } }), true)
	assert.equal(inPipeline({ mutation: { pipeline: false } }), false)
	assert.equal(inPipeline({ mutation: false }), true)
	assert.equal(MANUAL_EVIDENCE, '.copilot-tracking/mutation')
})

test('a developer run stands for G6 only when it judged HEAD on a clean working copy', () => {
	const run = { revision: 'abc', clean: true, exit_code: 0 }
	assert.equal(reusableRun(run, 'abc'), true)
	assert.equal(reusableRun({ ...run, exit_code: 1 }, 'abc'), true)
	assert.equal(reusableRun(run, 'def'), false)
	assert.equal(reusableRun({ ...run, clean: false }, 'abc'), false)
	assert.equal(reusableRun({ ...run, exit_code: 2 }, 'abc'), false)
	assert.equal(reusableRun({ ...run, exit_code: 3 }, 'abc'), false)
	assert.equal(reusableRun({ revision: 'abc', exit_code: 0 }, 'abc'), false)
	assert.equal(reusableRun(null, 'abc'), false)
})
