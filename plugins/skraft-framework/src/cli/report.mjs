#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createStateService } from '../application/state-service.mjs'
import { renderReport } from '../application/render-report.mjs'
import { preparePublication, decidePublication, recordPublication } from '../application/report-publication-handoff.mjs'
import { validateReportingPreferences } from '../domain/reporting-preferences.mjs'
import { normalizeMcpTarget, sameMcpScope, validateMcpPacket } from '../domain/report-mcp-policy.mjs'
import { validateReportData } from '../domain/reporting-presentation.mjs'
import { createReportFiles } from '../adapters/infrastructure/report-files.mjs'
import { resolveTrackingRoot } from '../adapters/infrastructure/tracking-root-resolver.mjs'

const commands = {
	setup: ['slug', 'data'], render: ['slug', 'data', 'out'],
	status: ['slug'], prepare: ['slug', 'story', 'kind', 'body', 'destination'],
	decide: ['slug', 'data'], record: ['slug', 'data'],
	abandon: ['slug', 'reason'],
}
const help = { commands, usage: 'report.mjs <command> --<option> <value>',
	publication: 'Local host-MCP handoff only; no network, MCP client, PR creation or branch push. Readback is a host attestation, not an independent fetch',
	abandonment: 'After explicit human confirmation, abandon --slug --reason archives the unresolved local attempt before clearing it. Remote outcome remains unknown; no remote cancellation or deletion occurs. Receipts are preserved',
	concurrency: 'One outstanding packet per plan; one host writer must own prepare through record. Local locks cover short commands only, never host calls; no cross-machine or remote conditional-write guarantee' }

function parse(argv) {
	if (argv.length === 1 && argv[0] === '--help') return { help: true }
	const [command, ...rest] = argv
	if (!Object.hasOwn(commands, command)) throw new Error('Unknown command; use --help for usage')
	if (rest.length === 1 && rest[0] === '--help') return { help: true }
	const options = {}
	for (let i = 0; i < rest.length; i += 2) {
		const flag = rest[i]
		const name = flag.startsWith('--') ? flag.slice(2) : ''
		if (!commands[command].includes(name)) throw new Error(`Unknown option: ${flag}`)
		if (Object.hasOwn(options, name)) throw new Error(`Duplicate option: ${flag}`)
		const value = rest[i + 1]
		if (!value || value.startsWith('--')) throw new Error(`Missing required value for ${flag}`)
		options[name] = value
	}
	for (const name of commands[command]) {
		if (!Object.hasOwn(options, name)) throw new Error(`Required option: --${name}`)
	}
	if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(options.slug)) throw new Error('Invalid project slug; traversal is forbidden')
	if (command === 'abandon' && !options.reason.trim()) throw new Error('Abandon reason must not be blank')
	if (command === 'prepare') {
		if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.story)) throw new Error('Invalid report story identifier')
		if (!['forecast', 'outcome'].includes(options.kind)) throw new Error('Report kind must be forecast or outcome')
		if (!['pr', 'issue'].includes(options.destination)) throw new Error('Destination must be pr or issue')
	}
	return { command, options }
}

function unwrap(result) {
	if (!result.ok) {
		const error = new Error(result.error.reason || 'Existing initialized state is required')
		error.code = result.error.code
		throw error
	}
	return result.value
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const hashText = (text) => createHash('sha256').update(text).digest('hex')

function readOptional(files, path) {
	try { return files.readJson(path) } catch (error) {
		if (error.code === 'ENOENT') return undefined
		throw error
	}
}

const selected = (preferences, destination) => destination === 'pr'
	? preferences.destinations.pr : preferences.destinations.issue !== 'none'
const configuredTarget = (preferences, destination) => normalizeMcpTarget(preferences, destination,
	destination === 'pr' ? preferences.prNumber : preferences.issueNumber)

function scopedReceipt(receipt, preferences, story, kind) {
	if (receipt?.story !== story || receipt?.kind !== kind) return undefined
	const targets = {}
	for (const destination of ['pr', 'issue']) {
		const entry = receipt.targets?.[destination]
		if (!entry || !selected(preferences, destination)) continue
		const number = destination === 'pr' ? preferences.prNumber : preferences.issueNumber
		if (number !== null && sameMcpScope(entry.target, configuredTarget(preferences, destination))) {
			targets[destination] = entry
		}
	}
	return { story, kind, targets }
}

function assertCurrentPacket(packet, preferences, previousReceipt, currentBranch) {
	validateMcpPacket(packet, hashText)
	if (!selected(preferences, packet.destination) || packet.branch !== preferences.branch ||
		!sameMcpScope(packet.target, configuredTarget(preferences, packet.destination))) {
		throw new Error('Configured target or branch scope changed since prepare')
	}
	if (preferences.branch && currentBranch !== packet.branch) throw new Error('Current branch differs from prepared scope')
	// Revalidate pointer dependencies from saved Markdown, never reread or render sources.
	const current = preparePublication({ preferences, story: packet.story, kind: packet.kind,
		destination: packet.destination, body: packet.body.slice(packet.marker.length + 2),
		currentBranch, previousReceipt }, { hashText })
	if (current.status !== 'ready' || current.body !== packet.body) {
		throw new Error('Prepared body or pointer target scope is stale; reconcile pending attempt')
	}
}

async function publicationCommand(command, options, { files, tracking, reportingPath, service }) {
	const release = tracking.acquirePublicationLock(resolve(reportingPath, '.publish.lock'))
	try {
		const pendingPath = resolve(reportingPath, 'pending.json')
		const pending = readOptional(tracking, pendingPath)
		const save = (path, value) => tracking.writeAtomic(path, JSON.stringify(value, null, 2) + '\n')
		if (command === 'abandon') {
			if (!pending?.packet) throw new Error('No pending publication attempt to abandon')
			const archive = { ...pending, status: 'abandoned', reason: options.reason,
				warning: 'Remote outcome remains unresolved or unknown; local abandonment does not cancel or delete remote publication' }
			save(resolve(reportingPath, 'abandoned', `${randomUUID()}.json`), archive)
			tracking.remove(pendingPath)
			return archive
		}
		const state = unwrap(await service.get(options.slug))
		const preferences = state?.userPreferences?.reporting
		if (!preferences) throw new Error('Reporting preferences missing; setup confirmed consent first')
		unwrap(validateReportingPreferences(preferences))
		const currentBranch = preferences.branch ? git(['symbolic-ref', '--quiet', '--short', 'HEAD']) : undefined
		const identityPath = (story, kind) => tracking.pathFor(resolve(reportingPath, kind, `${story}.json`))
		const previous = (story, kind) => scopedReceipt(readOptional(tracking, identityPath(story, kind)), preferences, story, kind)

		if (command === 'prepare') {
			if (pending?.packet?.status === 'ready' &&
				(pending.packet.story !== options.story || pending.packet.kind !== options.kind ||
				pending.packet.destination !== options.destination)) {
				throw new Error('Outstanding pending attempt must complete before another destination or report identity')
			}
			const packet = preparePublication({ ...options, preferences, currentBranch,
				body: files.readText(options.body), previousReceipt: previous(options.story, options.kind) }, { hashText })
			if (pending?.packet?.status === 'ready') {
				if (!isDeepStrictEqual(packet, pending.packet)) throw new Error('Outstanding pending packet cannot be replaced; reconcile attempt first')
				return pending.packet
			}
			save(pendingPath, { packet })
			return packet
		}

		if (!pending?.packet) throw new Error('No pending publication packet; prepare first')
		const { packet, decision } = pending
		validateMcpPacket(packet, hashText)
		// Saved identifiers are validated before constructing per-identity paths.
		if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(packet.story)) throw new Error('Invalid saved packet story')
		const receiptPath = identityPath(packet.story, packet.kind)
		const previousReceipt = previous(packet.story, packet.kind)
		assertCurrentPacket(packet, preferences, previousReceipt, currentBranch)
		const observation = files.readJson(options.data)
		if (!observation || typeof observation !== 'object' || Array.isArray(observation) ||
			Object.hasOwn(observation, 'packet') || Object.hasOwn(observation, 'decision')) {
			throw new Error('Expected normalized observation object, not replacement packet or decision')
		}
		if (command === 'decide') {
			const priorDecision = decision?.action === 'update' ? decision : pending.previousAuthorizedDecision
			const next = decidePublication(packet, observation, { hashText, priorDecision })
			const previousAuthorizedDecision = next.action === 'update' ? next
				: ['pending', 'unchanged'].includes(next.action) ? priorDecision : undefined
			save(pendingPath, { packet, decision: next,
				...(previousAuthorizedDecision ? { previousAuthorizedDecision } : {}) })
			return next
		}
		if (!decision) throw new Error('Persisted decision required; decide before record')
		const recorded = recordPublication(packet, decision, observation, { hashText })
		const receipt = { ...recorded, targets: { ...previousReceipt?.targets, ...recorded.targets } }
		save(receiptPath, receipt)
		save(resolve(reportingPath, 'publication.json'), receipt)
		tracking.remove(pendingPath)
		return receipt
	} finally {
		release()
	}
}

async function run() {
	const parsed = parse(process.argv.slice(2))
	if (parsed.help) return help
	const { command, options } = parsed
	const { slug } = options
	const repoRoot = git(['rev-parse', '--show-toplevel'])
	const files = createReportFiles(repoRoot)
	const trackingRoot = resolveTrackingRoot({ cwd: repoRoot })
	// Default layout cannot escape the repository. Explicit roots authorize their
	// own realpath boundary, but never authorize report sources outside the repo.
	const tracking = process.env.SKRAFT_TRACKING_ROOT
		? createReportFiles(resolve(trackingRoot))
		: files
	const statePath = tracking.pathFor(resolve(trackingRoot, slug, 'state.json'))
	const reportingPath = resolve(trackingRoot, slug, 'reporting')
	const service = createStateService({
		stateReader: { read: async () => tracking.readJson(statePath) },
		stateWriter: { write: async (_slug, state) => {
			tracking.writeAtomic(statePath, JSON.stringify(state, null, 2) + '\n')
			return { ok: true, value: undefined }
		} },
	})
	if (command === 'setup') {
		const release = tracking.acquirePublicationLock(resolve(reportingPath, '.publish.lock'))
		try {
			unwrap(await service.configureReporting(slug, files.readJson(options.data)))
			return { configured: true, slug }
		} finally {
			release()
		}
	}
	if (command === 'status') {
		const receipt = readOptional(tracking, resolve(reportingPath, 'publication.json'))
		const pending = readOptional(tracking, resolve(reportingPath, 'pending.json'))
		if (!pending) return receipt ?? { status: 'idle' }
		const state = unwrap(await service.get(slug))
		const preferences = state?.userPreferences?.reporting
		unwrap(validateReportingPreferences(preferences))
		const previousReceipt = receipt && scopedReceipt(receipt, preferences, receipt.story, receipt.kind)
		let scopeChanged = false
		if (pending.packet?.status === 'ready') {
			const { packet } = pending
			try {
				scopeChanged = !selected(preferences, packet.destination) || packet.branch !== preferences.branch ||
					!sameMcpScope(packet.target, configuredTarget(preferences, packet.destination))
			} catch { scopeChanged = true }
		}
		return { ...pending, ...(previousReceipt ? { previousReceipt } : {}), ...(scopeChanged ? { scopeChanged: true } : {}) }
	}
	if (command !== 'render') return publicationCommand(command, options, { files, tracking, reportingPath, service })

	const state = unwrap(await service.get(slug))
	const preferences = state?.userPreferences?.reporting

	if (command === 'render') {
		if (preferences) unwrap(validateReportingPreferences(preferences))
		const input = files.readJson(options.data)
		const data = { ...input, maxMedia: preferences?.maxMedia ?? input.maxMedia ?? 0 }
		validateReportData(data)
		// Check even refs the renderer does not read in this report kind, including
		// local-only media. Missing files remain the renderer's UNVERIFIED concern.
		const refs = ['testPlanRef', 'qualityEvidenceRef', 'reviewRef', 'changeLogRef']
			.map((field) => data[field])
			.concat(data.criteria.map((item) => item.evidence), data.media.map((item) => item.path))
		for (const ref of refs) if (ref !== undefined) files.pathFor(ref, { reference: true })
		files.pathFor(options.out)
		const markdown = renderReport(data, {
			readText: (ref) => files.readText(ref, { reference: true }),
			hashText,
		})
		files.writeAtomic(options.out, markdown)
		return { rendered: true, kind: data.kind, story: data.story, path: options.out }
	}
}

run().then((result) => process.stdout.write(JSON.stringify(result) + '\n')).catch((error) => {
	process.stderr.write(JSON.stringify({ code: String(error.code ?? 'REPORT_ERROR'), reason: error.message }) + '\n')
	process.exitCode = 1
})