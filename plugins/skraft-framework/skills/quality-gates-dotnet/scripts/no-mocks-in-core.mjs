#!/usr/bin/env node
// G7 — no mocking framework in the Domain/Application core or in its unit tests.
// Scans every *.Domain and *.Application project (any depth: nested bounded contexts
// included) and the *.Domain.*Tests, *.Application.*Tests and *.UnitTests projects;
// integration tests are out of scope (in-process doubles are allowed there).
// Evidence: qg-mocks.stdout (one "path:line:text" per hit, empty on pass), .exit, .sha256.
// Exit: 0 pass | 1 hits found | 2 usage or layout error
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { absoluteDir, fromRoot, isEntry, main, parseArguments, sha256File, usageError } from './dotnet-toolchain.mjs'

const USAGE = 'Usage: no-mocks-in-core.mjs --root <dir> --evidence <dir>'
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

export function runNoMocks(argv) {
	const input = parseArguments(argv, { values: ['root', 'evidence'], usage: USAGE })
	if (!input.root || !input.evidence) throw usageError(USAGE)
	const root = absoluteDir(input.root)
	if (!root) throw usageError('repository root not found')
	const evidence = fromRoot(root, input.evidence)
	mkdirSync(evidence, { recursive: true })
	if (projectDirs(root, CORE).length === 0) throw usageError(`no *.Domain or *.Application project under ${root}`)

	const hits = []
	for (const dir of projectDirs(root, SCANNED)) {
		for (const file of sources(root, dir)) {
			readFileSync(join(root, file), 'utf8').split(/\r?\n/).forEach((line, index) => {
				if (PATTERN.test(line)) hits.push(`${file}:${index + 1}:${line}`)
			})
		}
	}
	const stdout = join(evidence, 'qg-mocks.stdout')
	writeFileSync(stdout, hits.length ? `${hits.join('\n')}\n` : '')
	const status = hits.length ? 1 : 0
	writeFileSync(join(evidence, 'qg-mocks.exit'), `${status}\n`)
	writeFileSync(join(evidence, 'qg-mocks.stdout.sha256'), `${sha256File(stdout)}\n`)
	return status
}

if (isEntry(import.meta.url)) await main(() => runNoMocks(process.argv.slice(2)))
