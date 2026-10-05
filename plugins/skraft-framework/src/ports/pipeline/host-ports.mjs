// Ports of the run-pipeline use case: what a host (Claude Code mod, Copilot dynamic
// workflow, a test) must provide. Contracts only — no code. Every adapter lives in
// src/adapters/hosts/ and stays thin: it translates, it never decides.
//
// The use case and everything it imports load with no Node API, so a Claude Code mod
// (which runs in a sandbox with no require, no fs, no process) can import it as is.

/**
 * @typedef {object} PipelineConfig  skraft-framework.config.json, parsed.
 * @property {string[]} phaseOrder
 * @property {Record<string, {specialist: string, reviewer: string|null}>} phaseAgents
 * @property {Record<string, string>} agentAliases
 * @property {Record<string, {inputs?: string[], outputs?: string[]}>} agentArtifacts
 * @property {Record<string, string[]>} agentContext
 */

/**
 * @typedef {object} StateReader   Existing contract (src/ports/infrastructure/state-reader.mjs).
 * @property {(slug: string) => Promise<object>} read  rejects with err.code 'ENOENT' when absent
 *
 * @typedef {object} StateWriter   Existing contract (src/ports/infrastructure/state-writer.mjs).
 * @property {(slug: string, state: object) => Promise<{ok: boolean}>} write
 */

/**
 * @typedef {object} TrackingFiles  The project's tracking directory ({trackingRoot}/{slug}/).
 * @property {(slug: string, relPath: string) => Promise<boolean>} exists
 * @property {(slug: string, relPath: string) => Promise<string>} read     rejects when absent
 * @property {(slug: string) => Promise<string[]>} list                    every file, tracking-relative, `/`-separated
 * @property {(slug: string, relPath: string, text: string) => Promise<void>} write  decisions only, never state.json
 */

/**
 * @typedef {object} RepositoryFiles  The session repository (docs/adr/...).
 * @property {(relPath: string) => Promise<string|null>} read  null when absent
 */

/**
 * @typedef {object} Git
 * @property {() => Promise<string|null>} headSha
 */

/**
 * @typedef {object} AgentDispatch
 * @property {string} agent   canonical name ("Skraft - Software Engineer"); the adapter maps it to the host's id
 * @property {string} phase
 * @property {'specialist'|'reviewer'} role
 * @property {string} label   unique per dispatch (Copilot memoizes identical calls)
 * @property {string} prompt
 *
 * @typedef {object} Agents
 * @property {(dispatch: AgentDispatch) => Promise<{ok: boolean, text: string}>} run
 *   resolves once the subagent finished; ok:false when it errored or answered nothing
 */

/**
 * @typedef {object} Commands  Deterministic tools the code runs itself (qg-verify, structural scan).
 * @property {(argv: string[], opts?: {timeoutMs?: number}) => Promise<{exitCode: number, stdout: string, stderr: string}>} run
 *   cwd is the session repository; argv[0] 'node' means the host's Node
 */

/**
 * @typedef {object} Checkpoint
 * @property {string} key       stable: the same question asked again after a resume has the same key
 * @property {string} question
 * @property {string[]} options
 *
 * @typedef {object} Interaction  Human checkpoints.
 * @property {(checkpoint: Checkpoint) => Promise<string|null>} decide
 *   the human's answer, or null when nobody can answer now (the run stops as awaiting-human,
 *   and a later run asks again under the same key)
 */

/**
 * @typedef {object} Progress
 * @property {(title: string) => void} phase
 * @property {(message: string) => void} log
 */

/**
 * @typedef {object} HostPorts
 * @property {PipelineConfig} config
 * @property {string} pluginRoot              absolute plugin directory (for `node <root>/src/cli/...`)
 * @property {(slug: string) => string} trackingPrefix  repository-relative tracking dir, ending in '/'
 * @property {StateReader} stateReader
 * @property {StateWriter} stateWriter
 * @property {TrackingFiles} trackingFiles
 * @property {RepositoryFiles} repositoryFiles
 * @property {Git} git
 * @property {Agents} agents
 * @property {Commands} commands
 * @property {Interaction} interaction
 * @property {Progress} progress
 * @property {{today: () => string, now: () => string}} clock  today: YYYY-MM-DD, now: ISO-8601
 */

export {}
