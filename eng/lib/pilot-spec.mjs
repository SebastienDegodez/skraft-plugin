// Narrowing an eval spec down to a pilot.
//
// A paired run costs two arms plus judge work on every stimulus, so committing
// the full portfolio before knowing whether the skill moves anything is the most
// expensive way to learn it does not. A pilot runs the frozen spec against the
// one or two stimuli expected to discriminate most, at full depth, and answers
// that question for a fraction of the budget.
//
// Vally 0.12.0 has no stimulus filter, so the pilot is a filtered copy of the
// spec. Filtering is line-based on purpose: `eng/` reads these specs without a
// YAML dependency, and the specs this repository authors keep one `- name:` per
// stimulus under a top-level `stimuli:` key.

const STIMULUS_LINE = /^([ \t]{2,})-[ \t]+name:[ \t]*(.+?)[ \t]*$/
const RUNS_LINE = /^([ \t]*)runs:[ \t]*\d+[ \t]*$/

/**
 * Split a spec into its header and one entry per stimulus block.
 * A block runs from its `- name:` line to the line before the next one.
 * @param {string} content raw eval.yaml content
 */
function parseBlocks(content) {
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

function stripQuotes(value) {
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
  const { header, blocks } = parseBlocks(content)
  if (blocks.length === 0) throw new Error('spec declares no stimuli')

  const wanted = selectors.map((selector) => selector.trim().toLowerCase()).filter(Boolean)
  if (wanted.length === 0) throw new Error('no stimulus selector given')

  for (const selector of wanted) {
    if (!blocks.some((block) => block.name.toLowerCase().includes(selector))) {
      throw new Error(`no stimulus matches "${selector}" (spec has: ${blocks.map((block) => block.name).join(', ')})`)
    }
  }

  const kept = blocks.filter((block) => wanted.some((selector) => block.name.toLowerCase().includes(selector)))
  const head = runs === undefined ? header : header.map((line) => line.replace(RUNS_LINE, `$1runs: ${runs}`))

  return {
    spec: [...head, ...kept.flatMap((block) => block.lines)].join('\n'),
    kept: kept.map((block) => block.name),
  }
}
