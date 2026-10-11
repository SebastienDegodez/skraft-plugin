#!/usr/bin/env node
// validate-mikado.mjs — deterministic gate for a Mikado graph file (Mermaid `graph TD`).
//
// Inspired by the 8-pass validator in chaabani-anis/mikado-method (MIT License,
// https://github.com/chaabani-anis/mikado-method) — same validation discipline
// (parse, traceability, requires-reference validation, cycle detection, tree-direction
// ancestry, orphan detection, golden-master gate, true-leaf enumeration), reimplemented
// here to parse SKRAFT's Mermaid graph format instead of that repo's rail-notation
// text format. Node, no shell: the same on Linux, macOS and Windows.
//
// Usage: node validate-mikado.mjs [--no-git] <path-to-mikado-graph.md>
// Exit 0 = graph valid | Exit 1 = defects found, fix before continuing.
//
// --no-git: skip the tree-direction ancestry check (Pass 5), which needs real,
// resolvable git commits. Use it for fixtures/samples with fictional SHAs (e.g. the
// examples in references/graph-format.md). Never use it on a real graph — the git
// check is the traceability guarantee.
//
// Commit convention required by Pass 5: every graph-update commit (creating the file,
// recording a discovery) uses the message prefix `refactor(mikado-graph): <what>`.
//
// Run it after every graph-update commit, before every leaf commit, and before
// dispatching the next refactoring-worker.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HELP = `validate-mikado.mjs — deterministic gate for a Mikado graph file (Mermaid \`graph TD\`).

Usage: node validate-mikado.mjs [--no-git] <path-to-mikado-graph.md>
Exit 0 = graph valid | Exit 1 = defects found, fix before continuing.

--no-git: skip the tree-direction ancestry check (Pass 5), which needs real,
resolvable git commits. Use it for fixtures/samples with fictional SHAs.
Never use it on a real graph — the git check is the traceability guarantee.`

const git = (args) => spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

export function validateMikado(argv, { out = (line) => process.stdout.write(`${line}\n`), err = (line) => process.stderr.write(`${line}\n`) } = {}) {
	let noGit = false
	let file = ''
	for (const arg of argv) {
		if (arg === '--no-git') noGit = true
		else if (arg === '--help' || arg === '-h') { out(HELP); return 0 }
		else file = arg
	}
	if (!file || !existsSync(file) || !statSync(file).isFile()) {
		err(`ERROR: graph file not found: ${file}`)
		err('Usage: node validate-mikado.mjs [--no-git] <path-to-mikado-graph.md>')
		err('       node validate-mikado.mjs --help')
		return 1
	}

	let errors = 0
	let warnings = 0
	const logError = (message) => { err(`  [ERROR] ${message}`); errors += 1 }
	const logWarn = (message) => { out(`  [WARN]  ${message}`); warnings += 1 }
	const logOk = (message) => out(`  [OK]    ${message}`)

	const nodes = []          // { id, label } in file order
	const edges = []          // { from, to, kind } raw, unfiltered
	const classes = []        // { id, cls }
	const shas = []           // { id, sha }
	const text = readFileSync(file, 'utf8')

	out(`=== Mikado Graph Validation: ${file} ===`)
	out('')
	out('--- Pass 1: Parsing nodes, edges, classes ---')
	let goalId = ''
	let rootFound = false
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim()
		let match
		if ((match = trimmed.match(/^([A-Za-z0-9_]+)\(\((.*)\)\)$/))) {
			const [, id, label] = match
			if (/^goal:/i.test(label) || /[Gg]oal:/.test(label)) {
				rootFound = true
				goalId = id
				nodes.push({ id, label })
				logOk(`Goal node found: {${id}}`)
			}
			continue
		}
		if ((match = trimmed.match(/^([A-Za-z0-9_]+)\["(.*)"\]$/))) {
			const [, id, label] = match
			if (nodes.some((node) => node.id === id)) logError(`Duplicate node id: {${id}}`)
			nodes.push({ id, label })
			const sha = label.match(/discovered:\s*([A-Za-z0-9]{6,40})/)
			if (sha) shas.push({ id, sha: sha[1] })
			continue
		}
		if ((match = trimmed.match(/^([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)$/))) {
			edges.push({ from: match[1], to: match[2], kind: 'tree' })
			continue
		}
		if ((match = trimmed.match(/^([A-Za-z0-9_]+)\s*-\.requires\.->\s*([A-Za-z0-9_]+)$/))) {
			edges.push({ from: match[1], to: match[2], kind: 'requires' })
			continue
		}
		if ((match = trimmed.match(/^class\s+([A-Za-z0-9_,]+)\s+([A-Za-z0-9_]+)$/))) {
			const [, ids, cls] = match
			if (cls === 'new') continue // genesis diagram convention, not a graph-status class
			for (const id of ids.split(',')) classes.push({ id, cls })
		}
	}
	if (!rootFound) logError('No goal node found. Expected a node shaped G((Goal: <sentence>)).')
	const known = (id) => nodes.some((node) => node.id === id)
	out('')

	out("--- Pass 2: Traceability (discovered + error, unless anticipated) ---")
	for (const { id, label } of nodes) {
		if (id === goalId) continue
		const cls = classes.find((entry) => entry.id === id)?.cls
		if (cls === 'anticipated') {
			logOk(`{${id}} anticipated — traceability not required until confirmed by experiment`)
			continue
		}
		if (/discovered:/i.test(label) && /error:/i.test(label)) logOk(`{${id}} has discovered + error citation`)
		else logError(`{${id}} missing 'discovered:' and/or 'error:' in its label (or mark it anticipated)`)
	}
	out('')

	out('--- Pass 3: Requires-reference validation ---')
	const filtered = []
	let broken = false
	for (const edge of edges) {
		if (known(edge.from) && known(edge.to)) filtered.push(edge)
		else {
			logError(`${edge.kind} edge {${edge.from}} -> {${edge.to}}: unknown node id (not defined in this graph)`)
			broken = true
		}
	}
	if (!broken) logOk('All edge references resolve to defined nodes')
	out('')

	out('--- Pass 4: Cycle detection (tree + requires edges) ---')
	// Kahn's algorithm over the FILTERED edge set: an unresolved reference must never
	// masquerade as a false cycle.
	const indegree = new Map(nodes.map((node) => [node.id, 0]))
	for (const { to } of filtered) indegree.set(to, (indegree.get(to) ?? 0) + 1)
	const queue = [...indegree].filter(([, count]) => count === 0).map(([id]) => id)
	while (queue.length) {
		const node = queue.shift()
		for (const { from, to } of filtered) {
			if (from !== node) continue
			const count = (indegree.get(to) ?? 1) - 1
			indegree.set(to, count)
			if (count === 0) queue.push(to)
		}
	}
	const cyclic = [...indegree].filter(([, count]) => count > 0)
	for (const [id] of cyclic) logError(`Cycle detected involving {${id}}`)
	if (cyclic.length === 0) logOk('No cycles detected')
	out('')

	out('--- Pass 5: Tree direction (child discovered during/after parent) ---')
	if (noGit) logOk('Skipped (--no-git): ancestry checks require resolvable git commits')
	else {
		let checked = false
		const shaOf = (id) => shas.find((entry) => entry.id === id)?.sha
		for (const { from, to, kind } of filtered) {
			if (kind !== 'tree') continue
			const parent = shaOf(from)
			const child = shaOf(to)
			if (!parent || !child) continue // already flagged by Pass 2 (missing discovered:)
			checked = true
			if (git(['cat-file', '-e', child]).status !== 0) {
				logError(`{${to}} discovered-by ${child.slice(0, 7)}: commit not found in git history`)
				continue
			}
			const subject = (git(['log', '-1', '--format=%s', child]).stdout ?? '').trim()
			if (!/^refactor\(mikado-graph\):/.test(subject)) {
				logError(`{${to}} discovered-by ${child.slice(0, 7)}: commit message must start with 'refactor(mikado-graph): ' (got: "${subject}")`)
			}
			if (parent === child) logOk(`{${to}} (${child.slice(0, 7)}) same cycle as {${from}} — direction OK`)
			else if (git(['merge-base', '--is-ancestor', parent, child]).status === 0) {
				logOk(`{${to}} (${child.slice(0, 7)}) discovered after {${from}} (${parent.slice(0, 7)}) — direction OK`)
			} else {
				logError(`{${to}} (discovered-by: ${child.slice(0, 7)}) appears to have been discovered BEFORE its parent {${from}} (${parent.slice(0, 7)}). Children are prerequisites: they must be discovered during or after the parent's naive attempt.`)
			}
		}
		if (!checked) logOk('No tree edges with resolvable SHAs to check')
	}
	out('')

	out('--- Pass 6: Orphan detection (warning only) ---')
	const referenced = new Set(filtered.map((edge) => edge.to))
	let orphans = false
	for (const { id } of nodes) {
		if (id === goalId || referenced.has(id)) continue
		logWarn(`{${id}} appears unreferenced (not a target of any tree or requires edge)`)
		orphans = true
	}
	if (!orphans) logOk('No orphan nodes')
	out('')

	out('--- Pass 7: Golden master gate ---')
	if (/golden master/i.test(text) || text.includes('%% no-golden-master:')) {
		logOk("Golden master addressed (node present or '%% no-golden-master: <reason>' declared)")
	} else {
		logError("No golden master node and no '%% no-golden-master: <reason>' comment. Measure coverage on touched modules: add a Golden Master node if coverage is thin, or declare '%% no-golden-master: coverage X% on <module>' if it is already sufficient.")
	}
	out('')

	out('--- Pass 8: True leaf enumeration ---')
	const done = (id) => nodes.some((node) => node.id === id && node.label.includes('[x]'))
	let leaves = 0
	for (const { id, label } of nodes) {
		if (id === goalId || done(id)) continue
		if (filtered.some((edge) => edge.from === id && !done(edge.to))) continue
		leaves += 1
		logOk(`Leaf ready: {${id}} ${label.slice(0, 60)}`)
	}
	if (leaves === 0) logWarn('No true leaves ready (either the graph is done, or all remaining nodes still have pending children)')
	out('')

	out('=== Summary ===')
	out(`  Nodes parsed : ${nodes.length}`)
	out(`  Warnings     : ${warnings}`)
	if (errors === 0) {
		out('  Result       : VALID — graph is ready for the next leaf')
		return 0
	}
	out(`  Result       : INVALID — ${errors} error(s) found. Fix before continuing.`)
	return 1
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
	process.exitCode = validateMikado(process.argv.slice(2))
}
