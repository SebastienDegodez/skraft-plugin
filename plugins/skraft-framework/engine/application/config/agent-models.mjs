import { assignFamily, assignRefuter, dispatchModelOf } from '../../domain/config/model-assignment.mjs'

/**
 * @typedef {import('../../domain/config/skraft-config.mjs').Settings} Settings
 * @typedef {import('../../domain/config/model-assignment.mjs').AgentType} AgentType
 * @typedef {import('../../domain/config/model-assignment.mjs').Assignment} Assignment
 * @typedef {{ agent: string, type: AgentType, named: string | null }} Wanted
 *   named: the family the workflow names for it (`model=`, `@<family>`, `refuter=`).
 */

/**
 * The family an agent runs on. What the workflow names counts only in a workflow the
 * repository ejected; the plugin's own leaves the choice to the configuration.
 * @param {Settings} settings @param {Wanted} wanted @returns {Assignment}
 */
export const assignmentOf = (settings, { agent, type, named }) => assignFamily({ agent, type, workflowFamily: ejected(settings, named) }, settings)

/**
 * The refuter's family, from the families of the lenses it checks unless a rule names one.
 * @param {Settings} settings @param {Wanted} wanted @param {Array<string | null>} checked @returns {Assignment}
 */
export const refuterAssignmentOf = (settings, { agent, type, named }, checked) => assignRefuter({ agent, type, workflowFamily: ejected(settings, named) }, checked, settings)

/**
 * What a dispatch on that family says about its model and effort.
 * @param {Settings} settings @param {{ agent: string, type: AgentType }} ref @param {string | null} family
 */
export const modelOf = (settings, ref, family) => dispatchModelOf(ref, family, settings)

/** @param {Settings} settings @param {string | null} named */
const ejected = ({ workflow }, named) => (workflow === null ? null : named)
