import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const cli = fileURLToPath(new URL('../../../plugins/skraft-framework/skills/prune-tests/scripts/mutant-matrix.mjs', import.meta.url))
const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
const names = (tests) => tests.map((t) => t.name)

test('list on a full-matrix Stryker report sorts every test into exactly one redundancy list', () => {
	const result = run('list', '--report', fixture('stryker-full.json'), '--json')
	assert.equal(result.status, 0, result.stderr)
	assert.equal(result.stderr, '')
	const out = JSON.parse(result.stdout)
	assert.equal(out.format, 'stryker')
	assert.deepEqual(names(out.coversNothing), ['loads the module'])
	assert.deepEqual(names(out.killsNothing), ['formats the label'])
	assert.deepEqual(names(out.sharedKillsOnly), ['charges full price below ten', 'reads the default rate'])
	assert.deepEqual(out.survived, ['src/price.js:5 StringLiteral'])
	assert.deepEqual(out.noCoverage, ['src/price.js:9 BlockStatement'])
	const killsAlone = out.tests.filter((t) => t.killedAlone > 0)
	assert.deepEqual(names(killsAlone), ['discounts from ten items'])
	for (const t of out.tests) {
		const buckets = [out.coversNothing, out.killsNothing, out.sharedKillsOnly, killsAlone].filter((list) => names(list).includes(t.name))
		assert.equal(buckets.length, 1, `${t.name} sits in ${buckets.length} lists`)
	}
	const kept = out.tests.find((t) => t.name === 'discounts from ten items')
	assert.deepEqual([kept.covered, kept.killed, kept.killedAlone], [3, 3, 1])
	assert.deepEqual(out.tests.find((t) => t.name === 'reads the default rate').covered, 1, 'a killer of a static mutant covers it')
})

test('list --tests keeps only the tests whose file starts with one of the prefixes', () => {
	const only = JSON.parse(run('list', '--report', fixture('stryker-full.json'), '--json', '--tests', 'test/price').stdout)
	assert.deepEqual(names(only.sharedKillsOnly), ['charges full price below ten'])
	assert.equal(only.tests.length, 4)
	const both = JSON.parse(run('list', '--report', fixture('stryker-full.json'), '--json', '--tests', 'test/rate', '--tests', 'test/nothing,test/price').stdout)
	assert.equal(both.tests.length, 5)
	const pit = JSON.parse(run('list', '--report', fixture('pit-full.xml'), '--json', '--tests', 'shop.PriceTest.[method').stdout)
	assert.deepEqual(names(pit.tests), ['shop.PriceTest.[method:discountsFromTen()]'])
	assert.deepEqual(pit.killsNothing, [])
})

test('list prints a readable report without --json', () => {
	const result = run('list', '--report', fixture('stryker-full.json'))
	assert.equal(result.status, 0, result.stderr)
	assert.match(result.stdout, /Tests covering no mutant \(1\):\n {2}loads the module \[test\/price\.test\.js\]/)
	assert.match(result.stdout, /Tests killing no mutant \(1\):\n {2}formats the label/)
	assert.match(result.stdout, /Tests whose kills are all shared \(2\):\n {2}charges full price below ten/)
	assert.match(result.stdout, /No-coverage mutants \(1\):\n {2}src\/price\.js:9 BlockStatement/)
})

test('list on a full-matrix PIT report treats each parameterized invocation as a test and says covers-nothing is invisible', () => {
	const result = run('list', '--report', fixture('pit-full.xml'), '--json')
	assert.equal(result.status, 0, result.stderr)
	const out = JSON.parse(result.stdout)
	assert.equal(out.format, 'pit')
	assert.equal(out.coversNothing, null)
	assert.match(out.notes.join('\n'), /PIT.*cannot see tests that cover no mutant/)
	assert.deepEqual(names(out.killsNothing), ['shop.PriceTest.[test-template:rounds(int)]/[test-template-invocation:#2]'])
	assert.deepEqual(names(out.sharedKillsOnly), ['shop.PriceTest.[test-template:rounds(int)]/[test-template-invocation:#1]'])
	assert.deepEqual(out.survived, ['Price.java:20 NegateConditionalsMutator (shop.Price.label)'])
	assert.deepEqual(out.noCoverage, ['Price.java:30 PrimitiveReturnsMutator (shop.Price.legacy)'])
})

for (const [name, reason] of [
	['stryker-bail.json', /full matrix.*disableBail/],
	['stryker-coverage-off.json', /coveredBy.*coverageAnalysis perTest/],
	['pit-bail.xml', /full matrix.*fullMutationMatrix/],
]) {
	test(`list refuses ${name}, a report made without the full matrix`, () => {
		const result = run('list', '--report', fixture(name))
		assert.equal(result.status, 2)
		assert.equal(result.stdout, '')
		assert.match(result.stderr, reason)
		assert.equal(result.stderr.trim().split('\n').length, 1)
	})
}

test('list only warns when a report without config names one killer per mutant', () => {
	const result = run('list', '--report', fixture('stryker-one-killer.json'))
	assert.equal(result.status, 0, result.stderr)
	assert.match(result.stderr, /^Warning: .*one killer/)
	assert.match(result.stdout, /^Report: stryker/)
})

test('a malformed report exits 2, never the lost-kill code', () => {
	const listed = run('list', '--report', fixture('stryker-malformed.json'))
	assert.equal(listed.status, 2)
	assert.notEqual(listed.stderr, '')
	assert.equal(run('compare', '--before', fixture('stryker-malformed.json'), '--after', fixture('stryker-full.json')).status, 2)
})

test('list refuses a missing or unknown report', () => {
	assert.equal(run('list', '--report', fixture('absent.json')).status, 2)
	assert.equal(run('list', '--report', cli).status, 2)
	assert.equal(run('list').status, 2)
})

test('compare passes when every mutant killed before is still killed after', () => {
	const result = run('compare', '--before', fixture('stryker-full.json'), '--after', fixture('stryker-after-kept.json'))
	assert.equal(result.status, 0, result.stdout + result.stderr)
	assert.match(result.stdout, /Tests: 5 before, 1 after/)
	assert.match(result.stdout, /Killed mutants: 3 before, 3 after/)
})

test('compare fails and names every kill lost', () => {
	const result = run('compare', '--before', fixture('stryker-full.json'), '--after', fixture('stryker-after-lost.json'))
	assert.equal(result.status, 1)
	assert.match(result.stdout, /Tests: 5 before, 4 after/)
	assert.match(result.stdout, /lost: src\/price\.js:2:7 EqualityOperator "qty > 10" \(Survived\)/)
	assert.doesNotMatch(result.stdout, /ConditionalExpression/)
})

test('compare keys PIT mutants by class, method, line, mutator and indexes', () => {
	const kept = run('compare', '--before', fixture('pit-full.xml'), '--after', fixture('pit-full.xml'))
	assert.equal(kept.status, 0, kept.stdout + kept.stderr)
	const lost = run('compare', '--before', fixture('pit-full.xml'), '--after', fixture('pit-after-lost.xml'))
	assert.equal(lost.status, 1)
	assert.match(lost.stdout, /lost: shop\.Price\.total:14 MathMutator #9/)
})

test('compare refuses reports of two different runners', () => {
	const result = run('compare', '--before', fixture('stryker-full.json'), '--after', fixture('pit-full.xml'))
	assert.equal(result.status, 2)
})
