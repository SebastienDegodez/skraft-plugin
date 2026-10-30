import { markdownOf } from './html-markdown.mjs'

/**
 * A work item of Azure Boards as the story a run starts from: the same reading whichever way
 * the work item was fetched (the host's MCP server or az), as REST answers it.
 *
 * @typedef {import('../../application/ports/code-host.mjs').IssueReading} IssueReading
 */

/** The work item types a run starts from: the story types of the Agile, Scrum, CMMI and Basic processes, and Bug. */
export const STORY_TYPES = Object.freeze(['User Story', 'Product Backlog Item', 'Requirement', 'Issue', 'Bug'])

const DESCRIPTION ='System.Description'
const CRITERIA = 'Microsoft.VSTS.Common.AcceptanceCriteria'

export const NO_DESCRIPTION = 'The work item has no description (System.Description is empty).'
/**
 * The longest field read, in characters. A longer one is replaced by a fixed line, never cut: a
 * story cut in the middle would mislead its agents, and the line sends them to the work item.
 */
const MAX_FIELD_LENGTH = 200_000
export const TOO_LONG_DESCRIPTION = `The work item's description is longer than ${MAX_FIELD_LENGTH} characters, so skraft did not read it: read System.Description on the work item.`
export const TOO_LONG_CRITERIA = `The work item's acceptance criteria are longer than ${MAX_FIELD_LENGTH} characters, so skraft did not read them: read Microsoft.VSTS.Common.AcceptanceCriteria on the work item.`
export const NO_CRITERIA = 'The work item has no acceptance criteria: Microsoft.VSTS.Common.AcceptanceCriteria is empty, or its work item type does not have it.'

/**
 * @param {{ number: number, organization: string, project: string }} wanted the work item asked for, on the remote's organization and project
 * @param {any} item the work item as REST answers it: `id` and `fields`
 * @returns {IssueReading | null} null when the answer is not a work item skraft can read
 */
export const workItemReading = ({ number, organization, project }, item) => {
  const fields = item?.fields
  if (item?.id !== number || typeof fields !== 'object' || fields === null) return null
  const refused = refusalOf(fields, project)
  if (refused !== null) return refused
  if (!isReadable(fields)) return null
  const url = `${organization}/${encodeURIComponent(project)}/_workitems/edit/${number}`
  return { read: 'issue', issue: { number, title: fields['System.Title'], url, body: bodyOf(fields[DESCRIPTION], fields[CRITERIA]) } }
}

/**
 * A work item that says it is no story, or says it is of another project than the remote's: a
 * field the answer lacks refuses nothing (the answer is unreadable, which falls back).
 * @param {Record<string, unknown>} fields @param {string} project @returns {IssueReading | null}
 */
const refusalOf = (fields, project) => {
  const type = fields['System.WorkItemType']
  if (typeof type === 'string' && !STORY_TYPES.includes(type)) return { read: 'not-a-story' }
  const teamProject = fields['System.TeamProject']
  return typeof teamProject === 'string' && !inProject({ fields }, project) ? { read: 'other-project', project } : null
}

/** Whether the work item is of that project, whatever its case (not measured: docs/v2/host-verification.md). @param {any} item the work item as REST answers it @param {string} project */
export const inProject = (item, project) => String(item?.fields?.['System.TeamProject']).toLowerCase() === project.toLowerCase()

/** A story type, a project and a title, and a description and criteria that are text or none. @param {Record<string, unknown>} fields */
const isReadable = (fields) => typeof fields['System.WorkItemType'] === 'string' && typeof fields['System.TeamProject'] === 'string' && typeof fields['System.Title'] === 'string' && isTextOrNone(fields[DESCRIPTION]) && isTextOrNone(fields[CRITERIA])

/** @param {unknown} text */
const isTextOrNone = (text) => text === undefined || text === null || typeof text === 'string'

/** The description, then the acceptance criteria, each in Markdown, a fixed line for one that is missing or too long. @param {string | null | undefined} description @param {string | null | undefined} criteria */
const bodyOf = (description, criteria) => `${markdownOrElse(description, { missing: NO_DESCRIPTION, tooLong: TOO_LONG_DESCRIPTION })}\n\n## Acceptance criteria\n\n${markdownOrElse(criteria, { missing: NO_CRITERIA, tooLong: TOO_LONG_CRITERIA })}`

/** @param {string | null | undefined} text @param {{ missing: string, tooLong: string }} lines */
const markdownOrElse = (text, { missing, tooLong }) => {
  if ((text ?? '').length > MAX_FIELD_LENGTH) return tooLong
  const markdown = markdownOf(text ?? '')
  return markdown.trim() === '' ? missing : markdown
}
