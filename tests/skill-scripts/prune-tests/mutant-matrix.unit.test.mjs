import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyse, compareReports, fullMatrixProblem, fullMatrixWarning, parseReport } from '../../../plugins/skraft-framework/skills/prune-tests/scripts/mutant-matrix.mjs'

const stryker = (mutants, testFiles) => JSON.stringify({ schemaVersion: '1.0', files: { 'a.js': { mutants } }, ...(testFiles ? { testFiles } : {}) })
const mutant = (id, status, killedBy, coveredBy, line = 1) => ({ id, mutatorName: 'M', replacement: 'r', location: { start: { line, column: 1 } }, status, killedBy, coveredBy })
const pit = (inner) => `<?xml version="1.0"?>\n<mutations>\n<mutation detected="true" status="KILLED"><sourceFile>A.java</sourceFile><mutatedClass>A</mutatedClass><mutatedMethod>f</mutatedMethod><lineNumber>3</lineNumber><mutator>x.M</mutator><indexes><index>1</index></indexes>${inner}<description>d &lt;x&gt;</description></mutation>\n</mutations>`

test('a PIT report whose killed mutants carry no <killingTests> element is refused', () => {
	assert.match(fullMatrixProblem(parseReport(pit(''))), /no <killingTests>/)
	assert.equal(fullMatrixProblem(parseReport(pit('<killingTests>T.a</killingTests><succeedingTests/>'))), null)
})

test('a Stryker report carrying its run config is refused unless bail is off and coverage is per test', () => {
	const ok = [mutant('1', 'Killed', ['t1'], ['t1'])]
	const withConfig = (config) => parseReport(JSON.stringify({ files: { 'a.js': { mutants: ok } }, config }))
	assert.equal(fullMatrixProblem(withConfig({ disableBail: true, coverageAnalysis: 'perTest' })), null)
	assert.match(fullMatrixProblem(withConfig({ disableBail: true, coverageAnalysis: 'off' })), /coverageAnalysis perTest/)
	assert.match(fullMatrixProblem(withConfig({ disableBail: true, coverageAnalysis: 'all' })), /coverageAnalysis perTest/)
	assert.match(fullMatrixProblem(withConfig({ coverageAnalysis: 'perTest' })), /disableBail/)
})

test('without config, a survivor lacking coveredBy is refused but a static mutant is not', () => {
	const survivor = { ...mutant('1', 'Survived', [], []), coveredBy: undefined }
	assert.match(fullMatrixProblem(parseReport(stryker([survivor]))), /coveredBy/)
	const staticKill = { ...mutant('1', 'Killed', ['t1'], []), coveredBy: undefined, static: true }
	assert.equal(fullMatrixProblem(parseReport(stryker([staticKill]))), null)
})

test('PIT counts as killed only KILLED, TIMED_OUT and MEMORY_ERROR, whatever detected says', () => {
	const report = parseReport(pit('<killingTests/><succeedingTests/>').replace('status="KILLED"', 'status="RUN_ERROR"'))
	assert.equal(report.mutants[0].detected, false)
	const nonViable = parseReport(pit('<killingTests/>').replace('detected="true" status="KILLED"', 'detected="false" status="TIMED_OUT"'))
	assert.equal(nonViable.mutants[0].detected, true)
})

test('a Stryker report whose killed mutants list no killer is refused', () => {
	const report = parseReport(stryker([{ ...mutant('1', 'Killed', [], ['t1']), killedBy: undefined }]))
	assert.match(fullMatrixProblem(report), /no killedBy/)
})

test('single killers are accepted when no killed mutant is covered by more than one test', () => {
	const report = parseReport(stryker([mutant('1', 'Killed', ['t1'], ['t1'])]))
	assert.equal(fullMatrixProblem(report), null)
	assert.equal(fullMatrixWarning(report), null)
})

test('without config, one killer per mutant among several covering tests is a warning, not a refusal', () => {
	const report = parseReport(stryker([mutant('1', 'Killed', ['t1'], ['t1', 't2'])]))
	assert.equal(fullMatrixProblem(report), null)
	assert.match(fullMatrixWarning(report), /one killer/)
})

test('without testFiles, Stryker ids stand for names and covers-nothing is not listed', () => {
	const result = analyse(parseReport(stryker([mutant('1', 'Killed', ['t1'], ['t1', 't2'], 1), mutant('2', 'Killed', ['t1', 't2'], ['t1', 't2'], 2)])))
	assert.equal(result.coversNothing, null)
	assert.match(result.notes[0], /no testFiles/)
	assert.deepEqual(result.sharedKillsOnly.map((t) => t.name), ['t2'])
})

test('compare reports a mutant that disappeared even when nothing else changed', () => {
	const before = parseReport(stryker([mutant('1', 'Killed', ['t1'], ['t1'], 1), mutant('2', 'NoCoverage', [], [], 2)]))
	const after = parseReport(stryker([mutant('1', 'Killed', ['t1'], ['t1'], 1)]))
	const result = compareReports(before, after)
	assert.equal(result.ok, false)
	assert.deepEqual(result.gone, ['a.js:2:1 M "r"'])
	assert.deepEqual(result.lost, [])
})

test('PIT text entities are decoded inside keys', () => {
	const [m] = parseReport(pit('<killingTests>T.a</killingTests>')).mutants
	assert.match(m.key, /d <x>$/)
})
