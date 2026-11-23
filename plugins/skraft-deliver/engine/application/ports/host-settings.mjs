/**
 * HostSettings — what the hosts set for their agents outside skraft's configuration, which can
 * win over or lose to what skraft assigns.
 *
 * @typedef {{ claudeCodeEffort: string | null, copilotAgents: string[] }} HostAgentSettings
 *   claudeCodeEffort: `CLAUDE_CODE_EFFORT_LEVEL`, null when unset; copilotAgents: the agents
 *   `subagents.agents` of `~/.copilot/settings.json` names, as the file spells them (`skraft:<id>`
 *   or `<id>`), none when the file is absent or unreadable.
 * @typedef {{ read: () => Promise<HostAgentSettings> }} HostSettings
 */
export {}
