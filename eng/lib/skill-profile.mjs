// Pure measurements over a skill and its evaluation spec.
//
// The heuristics mirror the reference agent-skill marketplaces (dotnet/skills,
// microcks/microcks-agent-skills) so the SKRAFT dashboard stays comparable to
// theirs: roughly four characters per token, tiers by estimated size.

/**
 * Size profile of a SKILL.md.
 *
 * Only what the dashboard shows, plus the activation guidance the catalogue scan
 * warns about. A skill's cost is its context; that is what a reader needs.
 *
 * @param {string} content full file content, front matter included
 * @param {string} body file content with the front matter stripped
 */
export function profileSkill(content, body) {
  const estimatedTokens = Math.ceil(content.length / 4)
  return {
    estimatedTokens,
    lineCount: content.split(/\r?\n/).length,
    tier: skillTier(estimatedTokens),
    hasWhenToUse: /^#{1,4}\s+when\s+to\s+use/im.test(body),
  }
}

/** Context-budget tier of a skill, from its estimated token count. */
export function skillTier(estimatedTokens) {
  if (estimatedTokens < 400) return 'compact'
  if (estimatedTokens <= 2500) return 'detailed'
  if (estimatedTokens <= 5000) return 'standard'
  return 'comprehensive'
}

/**
 * How much model budget a Vally eval spec plans to spend.
 * Counts stimuli and trials without a YAML dependency: the specs this repository
 * authors keep one `- name:` per stimulus under a top-level `stimuli:` key.
 * @param {string} content raw eval.yaml content
 */
export function summariseEvalSpec(content) {
  const stimuli = [...content.matchAll(/^[ \t]{2,}-[ \t]+name:[ \t]*\S/gm)].length
  const runs = Number(/^[ \t]*runs:[ \t]*(\d+)/m.exec(content)?.[1] ?? 1)
  return { stimuli, runs, trials: stimuli * runs }
}
