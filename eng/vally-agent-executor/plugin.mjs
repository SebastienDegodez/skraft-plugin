import { CopilotClient } from '@github/copilot-sdk'
import { computeMetrics } from '@microsoft/vally'
import { CopilotAdapter } from '@microsoft/vally/trajectory'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createAgentExecutor } from './executor.mjs'

const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const pilotPermissionHandler = (request) => request.kind === 'read'
	? { kind: 'approve-once' }
	: { kind: 'reject', feedback: 'The routing pilot permits read-only workspace access.' }

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
