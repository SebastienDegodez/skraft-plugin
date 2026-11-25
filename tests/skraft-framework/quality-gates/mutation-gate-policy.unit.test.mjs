import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	MUTATION_BAR, PIPELINE_NOT_RUN, RESULT_VARIABLE, fullRunWarning, mutationRuns, mutationVerdict, readResult, withBase,
} from '../../../plugins/skraft-framework/src/domain/mutation-gate-policy.mjs'

test('every scope is held to 80%, and the result file comes through SKRAFT_MUTATION_RESULT', () => {
	assert.equal(MUTATION_BAR, 80)
	assert.equal(RESULT_VARIABLE, 'SKRAFT_MUTATION_RESULT')
})

test('each --run gives a component, the folder its command runs in and the command, normalized', () => {
	const { components, problems } = mutationRuns(['api@.\\api\\=  node mutation.mjs  ', 'web=npx stryker run --incremental', 'docs@=a=b'])
	assert.deepEqual(problems, [])
	assert.deepEqual(components, [
		{ name: 'api', root: 'api', command: 'node mutation.mjs' },
		{ name: 'web', root: '.', command: 'npx stryker run --incremental' },
		{ name: 'docs', root: '.', command: 'a=b' },
	])
	assert.deepEqual(mutationRuns([]), { components: [], problems: [] })
})

test('a run the gate cannot place is a problem naming it, never a silent skip', () => {
	const problems = (spec) => mutationRuns([spec]).problems
	assert.deepEqual(problems('api@../elsewhere=x'), ['api: root must be a folder inside the repository'])
	assert.deepEqual(problems('api@/abs=x'), ['api: root must be a folder inside the repository'])
	assert.deepEqual(problems('api@C:/x=x'), ['api: root must be a folder inside the repository'])
	assert.deepEqual(problems('api=  '), ['api: the mutation command is empty'])
	assert.deepEqual(problems('node mutation.mjs'), ['--run node mutation.mjs: expected <name>[@<root>]=<command>'])
	assert.deepEqual(problems(' @api=x'), ['--run  @api=x: the component name is required'])
	assert.deepEqual(mutationRuns(['api=x', 'api=y']).problems, ['api: given twice'])
	assert.deepEqual(mutationRuns(['api@apps/api=x']).components[0].root, 'apps/api')
})

test('a command with no base or incremental option is a full run, and is warned', () => {
	const warn = (command) => fullRunWarning({ name: 'api', command })
	assert.match(warn('dotnet stryker'), /^warning: api runs a full mutation \(no --since, \{baseSha\}, delta or incremental option\)/)
	for (const command of ['dotnet stryker --since:{baseSha}', 'dotnet stryker --since main', 'npx stryker run --incremental', 'mvn pitest:mutationCoverage -DwithHistory', 'npm run mutation:delta', 'node m.mjs --changed']) {
		assert.equal(warn(command), null, command)
	}
})

test('DELIVER never runs G6: its rationale sends the developer to /skraft-mutation', () => {
	assert.match(PIPELINE_NOT_RUN, /^G6 not run: .*outside the pipeline.*\/skraft-mutation/)
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
