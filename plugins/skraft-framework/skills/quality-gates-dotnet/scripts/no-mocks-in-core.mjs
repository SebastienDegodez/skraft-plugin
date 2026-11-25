#!/usr/bin/env node
// test.no-mocks-core — no mocking framework in the Domain/Application core or in its unit tests.
// Scans every *.Domain and *.Application project (any depth: nested bounded contexts
// included) and the *.Domain.*Tests, *.Application.*Tests and *.UnitTests projects;
// integration tests are out of scope (in-process doubles are allowed there).
// Prints one "path:line:text" per hit (empty on pass); with --log, records the gate in the
// story's evidence log (gate-log.mjs). No stdout, exit or hash file is kept.
// Exit: 0 pass | 1 hits found | 2 usage or layout error
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { absoluteDir, isEntry, main, parseArguments, usageError } from './dotnet-toolchain.mjs'
import { logTarget, recordGate } from './gate-log.mjs'

const USAGE = 'Usage: no-mocks-in-core.mjs --root <dir> [--log <evidence dir>/qg-<story>.json]'
const PRUNED = new Set(['bin', 'obj', 'node_modules', '.git'])
const CORE = (name) => /\.(Domain|Application)$/.test(name)
const SCANNED = (name) => CORE(name) || /\.(Domain|Application)\..*Tests$/.test(name) || /\.UnitTests$/.test(name)
const PATTERN = /using\s+(Moq|FakeItEasy|NSubstitute|AutoFixture\.AutoMoq)\s*;|(^|[^A-Za-z0-9_])new\s+Mock<|Substitute\.For<|A\.Fake</
const byteOrder = (left, right) => (left < right ? -1 : left > right ? 1 : 0)

function projectDirs(root, accept) {
	const found = []
	const walk = (dir, relative) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (!entry.isDirectory() || PRUNED.has(entry.name)) continue
			const path = relative ? `${relative}/${entry.name}` : entry.name
			if (accept(entry.name)) found.push(path)
			walk(join(dir, entry.name), path)
		}
	}
	walk(root, '')
	return found.sort(byteOrder)
}

function sources(root, dir) {
	const files = []
	const walk = (relative) => {
		const entries = readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) => byteOrder(a.name, b.name))
		for (const entry of entries) {
			const path = `${relative}/${entry.name}`
			if (entry.isDirectory()) { if (entry.name !== 'bin' && entry.name !== 'obj') walk(path) } else if (entry.name.endsWith('.cs')) files.push(path)
		}
	}
	walk(dir)
	return files
}

// Returns { code, hits }: 0 pass, 1 hits found.
export function scanNoMocks(root) {
	if (projectDirs(root, CORE).length === 0) throw usageError(`no *.Domain or *.Application project under ${root}`)
	const hits = []
	for (const dir of projectDirs(root, SCANNED)) {
		for (const file of sources(root, dir)) {
			readFileSync(join(root, file), 'utf8').split(/\r?\n/).forEach((line, index) => {
				if (PATTERN.test(line)) hits.push(`${file}:${index + 1}:${line}`)
			})
		}
	}
	return { code: hits.length ? 1 : 0, hits }
}

export function recordNoMocks(root, log, { code, hits }) {
	const output = code === 0 ? 'no mocking symbol in the core' : `${hits.join('\n')}\n${hits.length} mocking hit(s) in the core`
	recordGate({ root, log, ids: ['test.no-mocks-core'], code, output, command: 'node no-mocks-in-core.mjs' })
}

export function runNoMocks(argv) {
	const input = parseArguments(argv, { values: ['root', 'log'], usage: USAGE })
	if (!input.root) throw usageError(USAGE)
	const root = absoluteDir(input.root)
	if (!root) throw usageError('repository root not found')
	if (input.log) logTarget(root, input.log)
	const result = scanNoMocks(root)
	if (result.hits.length) process.stdout.write(`${result.hits.join('\n')}\n`)
	if (input.log) recordNoMocks(root, input.log, result)
	return result.code
}

if (isEntry(import.meta.url)) await main(() => runNoMocks(process.argv.slice(2)))
