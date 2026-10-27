// The simulated Copilot extension SDK: defineWorkflow, joinSession, createCanvas and CanvasError
// as the extension entry hands them to register. It records each join and each session.log, and
// can be told to fail the way the host does (a definition it rejects, a join it refuses because
// of the tool or of the canvas).

export const SENTINEL = 'skraft-sentinel-7f3a'

/** The SDK's CanvasError: a code and a message. */
export class CanvasError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/**
 * @param {{ defineFails?: boolean | string, refuseTools?: boolean, refuseCanvases?: boolean, refuseAll?: boolean, canvasFails?: boolean, session?: object }} [options]
 *   defineFails: defineWorkflow throws, for the workflow of that name only when it names one; refuseTools: a join that carries a tool is refused;
 *   refuseCanvases: a join that carries a canvas is refused; refuseAll: every join is refused;
 *   canvasFails: createCanvas throws; session: more of the joined session (rpc, ui, capabilities)
 */
export const simulatedSdk = ({ defineFails = false, refuseTools = false, refuseCanvases = false, refuseAll = false, canvasFails = false, session: more = {} } = {}) => {
  const joins = []
  const logs = []
  const session = { ...more, log: async (message, options) => { logs.push({ message, level: options?.level ?? 'info' }) } }
  const defineWorkflow = (definition) => {
    if (defineFails === true || defineFails === definition.meta.name) throw new Error(`meta.phases is required ${SENTINEL}`)
    return { meta: definition.meta, run: definition.run }
  }
  const createCanvas = (options) => {
    if (canvasFails) throw new Error(`canvas id is required ${SENTINEL}`)
    return options
  }
  const joinSession = async (config) => {
    joins.push(config)
    if (refuseAll || (refuseTools && (config.tools ?? []).length > 0)) throw new Error(`Invalid tool name ${SENTINEL}`)
    if (refuseCanvases && (config.canvases ?? []).length > 0) throw new Error(`Canvas declaration rejected ${SENTINEL}`)
    return session
  }
  return { defineWorkflow, joinSession, createCanvas, CanvasError, joins, logs, session }
}

/** What each join registered: the workflow names, the tool names and the canvas ids. */
export const registered = (joins) => joins.map((config) => ({
  workflows: (config.workflows ?? []).map((workflow) => workflow.meta.name),
  tools: (config.tools ?? []).map((tool) => tool.name),
  canvases: (config.canvases ?? []).map((canvas) => canvas.id),
}))
