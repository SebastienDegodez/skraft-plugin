import { CopilotClient } from '@github/copilot-sdk'
import { computeMetrics } from '@microsoft/vally'
import { CopilotAdapter } from '@microsoft/vally/trajectory'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createAgentExecutor } from './executor.mjs'

const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const approved = { kind: 'approve-once' }
const rejected = (feedback) => ({ kind: 'reject', feedback })
const localCommands = new Set([
	'cat', 'dotnet', 'echo', 'find', 'git', 'grep', 'head', 'ls', 'mkdir', 'node', 'npm',
	'printf', 'pwd', 'shasum', 'sha256sum', 'tail', 'tee', 'touch',
])
const mutationAdapterScript = /^bash\s+scripts\/(?:configure-mutation|mutation-core|mutation-boundary)\.sh(?:\s|$)/
const forbiddenShell = /(?:^|\s)(?:restore|add\s+package|tool\s+(?:install|update)|nuget\s+push|git\s+(?:clean|reset\s+--hard))(?:\s|$)/i
const commandName = ({ identifier = '' }) => identifier.trim().split(/\s+/, 1)[0]
// A device node carries no repository evidence, so it stays reachable even
// though it sits outside the prepared workspace.
const neutralAbsolutePath = /^\/dev\//

const insideWorkspace = (workDir, candidate) => {
	if (!workDir || !candidate) return false
	const target = isAbsolute(candidate) ? resolve(candidate) : resolve(workDir, candidate)
	const path = relative(resolve(workDir), target)
	return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

const readableRootsOf = (context) => {
	const roots = context?.readableRoots?.length ? context.readableRoots : [context?.workDir]
	return roots.filter(Boolean)
}

const requestedPaths = (request) => [
	request.fileName,
	request.path,
	...(request.paths ?? []),
	...(request.possiblePaths ?? []),
].filter((value) => typeof value === 'string' && value.length > 0)

// An allowlisted command is not evidence of a bounded command: `find /elsewhere`
// and `cd /elsewhere && git log` both name an absolute path the caller never
// declared. Reading the repository under evaluation would contaminate the trial,
// so an absolute path outside the workspace disqualifies the whole invocation.
// Only a token that starts with a slash counts — a relative path such as
// `.copilot-tracking/evidence/result.json` is not an absolute path.
const absolutePathTokens = (text) => [...text.matchAll(/(?:^|[\s'"`=(<>|&;])(\/[^\s'"`;|&()<>]*)/g)]
	.map(([, candidate]) => candidate)

const escapesWorkspace = (workDir, text) => absolutePathTokens(text)
	.filter((candidate) => !neutralAbsolutePath.test(candidate))
	.some((candidate) => !insideWorkspace(workDir, candidate))

const deliveryWriteAllowed = (context) => context?.stimulus?.tags?.permissions === 'workspace-write'

export const pilotPermissionHandler = (request, context) => {
	if (request.kind === 'read') {
		const roots = readableRootsOf(context)
		const paths = requestedPaths(request)
		return paths.length > 0 && paths.every((path) => roots.some((root) => insideWorkspace(root, path)))
			? approved
			: rejected('Reads are limited to the prepared evaluation workspace and its staged skills.')
	}
	if (!deliveryWriteAllowed(context)) return rejected('The routing pilot permits read-only workspace access.')

	if (request.kind === 'write') {
		return insideWorkspace(context.workDir, request.fileName)
			? approved
			: rejected('Delivery writes must stay inside the prepared evaluation workspace.')
	}

	if (request.kind === 'shell') {
		const commands = request.commandSegments?.length ? request.commandSegments : (request.commands ?? [])
		const paths = request.possiblePaths ?? []
		const urls = request.possibleUrls ?? []
		const commandText = request.fullCommandText ?? ''
		const localOnly = urls.length === 0 && !request.requestSandboxBypass
		const knownCommands = commands.length > 0 && commands.every((command) => {
			const name = commandName(command)
			return localCommands.has(name) || (name === 'bash' && mutationAdapterScript.test(command.fullCommandText ?? command.identifier ?? ''))
		})
		const workspacePaths = paths.every((path) => insideWorkspace(context.workDir, path))
			&& !escapesWorkspace(context.workDir, commandText)
		const operationAllowed = !forbiddenShell.test(commandText)
		return localOnly && knownCommands && workspacePaths && operationAllowed
			? approved
			: rejected('Delivery shell access is limited to local build/test/git commands inside the prepared workspace; restore and package installation are disabled.')
	}

	return rejected('The evaluation executor did not grant this capability.')
}

export const createRegisterExecutors = ({ repoRoot, createClient, permissionHandler, computeMetrics: metrics }) => (registry) => {
	registry.register(createAgentExecutor({
		repoRoot,
		createClient,
		permissionHandler,
		adapterFactory: () => new CopilotAdapter(),
		computeMetrics: metrics,
	}))
}

const registerDefaultExecutor = createRegisterExecutors({
	repoRoot: defaultRepoRoot,
	createClient: (options) => new CopilotClient({ mode: 'empty', logLevel: 'error', ...options }),
	permissionHandler: pilotPermissionHandler,
	computeMetrics,
})

export const registerExecutors = (registry) => registerDefaultExecutor(registry)
