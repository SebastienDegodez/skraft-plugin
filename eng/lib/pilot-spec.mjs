// Narrowing an eval spec down to a pilot.
//
// A paired run costs two arms plus judge work on every stimulus, so committing
// the full portfolio before knowing whether the skill moves anything is the most
// expensive way to learn it does not. A pilot runs the frozen spec against the
// one or two stimuli expected to discriminate most, at full depth, and answers
// that question for a fraction of the budget.
//
// Vally 0.12.0 has no stimulus filter, so the pilot is a filtered copy of the
// spec. Resolve YAML aliases before filtering: a kept stimulus may refer to an
// anchor defined by a stimulus that the pilot drops.

import { parse, stringify } from 'yaml'

const STIMULUS_LINE = /^([ \t]{2,})-[ \t]+name:[ \t]*(.+?)[ \t]*$/

/**
 * Split a spec into its header and one entry per stimulus block.
 * A block runs from its `- name:` line to the line before the next one.
 *
 * Retained for the baseline cache's textual block keys. Pilot selection uses
 * parsed YAML values instead, so dropping a block cannot orphan an alias.
 *
 * @param {string} content raw eval.yaml content
 * @returns {{ header: string[], blocks: { name: string, lines: string[] }[] }}
 */
export function parseBlocks(content) {
  const lines = content.split('\n')
  const header = []
  const blocks = []

  for (const line of lines) {
    const match = STIMULUS_LINE.exec(line)
    if (match) blocks.push({ name: stripQuotes(match[2]), lines: [line] })
    else if (blocks.length > 0) blocks[blocks.length - 1].lines.push(line)
    else header.push(line)
  }

  return { header, blocks }
}

export function stripQuotes(value) {
  const quoted = /^(['"])(.*)\1$/.exec(value)
  return quoted ? quoted[2] : value
}

/**
 * Filter a spec down to the stimuli whose names contain one of `selectors`,
 * optionally overriding `defaults.runs` so the pilot keeps full depth on the
 * stimuli it does keep.
 *
 * Matching is case-insensitive and substring-based so a caller can name a
 * scenario without reproducing its exact wording. A selector that matches
 * nothing throws: silently running an empty pilot would spend the budget of a
 * baseline arm and prove nothing.
 *
 * @param {string} content raw eval.yaml content
 * @param {string[]} selectors stimulus name fragments to keep
 * @param {number} [runs] replacement for `defaults.runs`
 * @returns {{ spec: string, kept: string[] }}
 */
export function pilotSpec(content, selectors, runs) {
  const document = parse(content)
  const stimuli = document?.stimuli
  if (!Array.isArray(stimuli) || stimuli.length === 0) throw new Error('spec declares no stimuli')

  const wanted = selectors.map((selector) => selector.trim().toLowerCase()).filter(Boolean)
  if (wanted.length === 0) throw new Error('no stimulus selector given')

  for (const selector of wanted) {
    if (!stimuli.some((stimulus) => stimulus.name.toLowerCase().includes(selector))) {
      throw new Error(`no stimulus matches "${selector}" (spec has: ${stimuli.map((stimulus) => stimulus.name).join(', ')})`)
    }
  }

  const kept = stimuli.filter((stimulus) => wanted.some((selector) => stimulus.name.toLowerCase().includes(selector)))
  const pilot = { ...document, stimuli: kept }
  if (runs !== undefined) pilot.defaults = { ...document.defaults, runs }

  return {
    // Materialize shared values rather than introducing cross-stimulus aliases
    // into a pilot that the baseline-cache path may narrow again.
    spec: stringify(pilot, { aliasDuplicateObjects: false }),
    kept: kept.map((stimulus) => stimulus.name),
  }
}
