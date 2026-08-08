// Pure mapping: which skill(s) a set of changed file paths touches.
//
// A PR should only pay the model-call cost of evaluating the skill(s) it
// actually changed. `plugins/skraft-framework/skills/<skill>/**` is the skill's
// own tree; `tests/skills/<skill>/**` is its eval spec. Either one changing
// means the skill's behaviour or its contract moved.

const SKILL_PATH_PATTERN = /^(?:plugins\/skraft-framework\/skills|tests\/skills)\/([^/]+)\//

/**
 * @param {string[]} changedPaths repo-relative paths, e.g. from `git diff --name-only`
 * @returns {string[]} unique skill directory names, sorted
 */
export function changedSkills(changedPaths) {
  const names = new Set()
  for (const path of changedPaths ?? []) {
    const posix = String(path ?? '').split('\\').join('/')
    const match = SKILL_PATH_PATTERN.exec(posix)
    if (match) names.add(match[1])
  }
  return [...names].sort()
}
