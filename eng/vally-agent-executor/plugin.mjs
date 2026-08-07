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
const forbiddenShell = /(?:^|\s)(?:restore|add\s+package|tool\s+(?:install|update)|nuget\s+push|git\s+(?:clean|reset\s+--hard))(?:\s|$)/i
const commandName = ({ identifier = '' }) => identifier.trim().split(/\s+/, 1)[0]

const insideWorkspace = (workDir, candidate) => {
	if (!workDir || !candidate) return false
	const target = isAbsolute(candidate) ? resolve(candidate) : resolve(workDir, candidate)
	const path = relative(resolve(workDir), target)
	return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

const deliveryWriteAllowed = (context) => context?.stimulus?.tags?.permissions === 'workspace-write'

export const pilotPermissionHandler = (request, context) => {
	if (request.kind === 'read') return approved
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
		const localOnly = urls.length === 0 && !request.requestSandboxBypass
		const knownCommands = commands.length > 0 && commands.every((command) => localCommands.has(commandName(command)))
		const workspacePaths = paths.every((path) => insideWorkspace(context.workDir, path))
		const operationAllowed = !forbiddenShell.test(request.fullCommandText ?? '')
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
