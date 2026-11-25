import { normalizeRelative } from '../config/relative-path.mjs'

/**
 * Findings of different lenses that point at the same line with the same severity go together:
 * the refuter checks them in one call, each on its own (two claims at one line may differ), and
 * the next brief lists those that count once. A line is `path:line`,
 * its path normalized as the patch's paths are (`./src\Checkout.cs:12` is `src/Checkout.cs:12`);
 * a finding without one stands alone.
 *
 * @typedef {import('./answers.mjs').Finding} Finding
 * @typedef {{ lens: string, finding: Finding }} Member
 */

const LINE = /^(.+?):(\d+)(?:\D.*)?$/

/**
 * @template {Member} M
 * @param {M[]} members in lens order
 * @returns {M[][]} in the order of their first member
 */
export const groupFindings = (members) => {
  /** @type {Array<{ key: string | null, members: M[] }>} */
  const groups = []
  for (const member of members) {
    const key = keyOf(member.finding)
    const group = groups.find((other) => key !== null && other.key === key && !other.members.some(({ lens }) => lens === member.lens))
    if (group === undefined) groups.push({ key, members: [member] })
    else group.members.push(member)
  }
  return groups.map((group) => group.members)
}

/** @param {Finding} finding */
const keyOf = ({ location, severity }) => {
  const line = LINE.exec(location)
  return line === null ? null : `${normalizeRelative(line[1])}:${line[2]} ${severity}`
}

/**
 * What one refuter checks: the groups whose lenses are the same, merged, so each lens's findings go
 * in one call and its documents are read once, not once per finding (#669). A group of several
 * lenses at one line stays with those lenses.
 * @template {Member} M @param {M[][]} groups in the order of groupFindings @returns {M[][]} in the order of their first group
 */
export const refuterBatches = (groups) => {
  /** @type {Map<string, M[]>} */
  const batches = new Map()
  for (const members of groups) {
    const key = [...new Set(members.map(({ lens }) => lens))].sort().join(' ')
    batches.set(key, [...(batches.get(key) ?? []), ...members])
  }
  return [...batches.values()]
}

/** How a brief cites the members of a group: `consistency F1, architecture-compliance F2`. @param {Member[]} members */
export const citationOf = (members) => members.map(({ lens, finding }) => `${lens} ${finding.id}`).join(', ')
