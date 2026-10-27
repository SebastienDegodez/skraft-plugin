// The simulated Copilot extension SDK: defineWorkflow and joinSession as the extension entry
// hands them to register. It records each join and each session.log, and can be told to fail
// the way the host does (a definition it rejects, a join it refuses because of the tool).

export const SENTINEL = 'skraft-sentinel-7f3a'

/**
 * @param {{ defineFails?: boolean | string, refuseTools?: boolean, refuseAll?: boolean, session?: object }} [options]
 *   defineFails: defineWorkflow throws, for the workflow of that name only when it names one; refuseTools: a join that carries a tool is refused;
 *   refuseAll: every join is refused; session: more of the joined session (rpc, ui, capabilities)
 */
export const simulatedSdk = ({ defineFails = false, refuseTools = false, refuseAll = false, session: more = {} } = {}) => {
  const joins = []
  const logs = []
  const session = { ...more, log: async (message, options) => { logs.push({ message, level: options?.level ?? 'info' }) } }
  const defineWorkflow = (definition) => {
    if (defineFails === true || defineFails === definition.meta.name) throw new Error(`meta.phases is required ${SENTINEL}`)
    return { meta: definition.meta, run: definition.run }
  }
  const joinSession = async (config) => {
    joins.push(config)
    if (refuseAll || (refuseTools && (config.tools ?? []).length > 0)) throw new Error(`Invalid tool name ${SENTINEL}`)
    return session
  }
  return { defineWorkflow, joinSession, joins, logs, session }
}

/** What each join registered: the workflow names and the tool names. */
export const registered = (joins) => joins.map((config) => ({
  workflows: (config.workflows ?? []).map((workflow) => workflow.meta.name),
  tools: (config.tools ?? []).map((tool) => tool.name),
}))
