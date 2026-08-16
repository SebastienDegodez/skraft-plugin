// Pure mapping: which evaluation subject(s) a set of changed file paths touches.
//
// A PR should only pay the model-call cost of evaluating what it actually
// changed. `plugins/skraft-framework/skills/<skill>/**` is a skill's own tree;
// `tests/skills/<skill>/**` is its eval spec; `tests/agents/<suite>/**` is an
// agent suite. Either side changing means the subject's behaviour or its
// contract moved.

const SKILL_PATH_PATTERN = /^(?:plugins\/skraft-framework\/skills|tests\/skills)\/([^/]+)\//

const AGENT_SUITE_PATTERN = /^tests\/agents\/([^/]+)\//

const AGENT_SOURCE_PATTERN = /^plugins\/skraft-framework\/agents\//

const posix = (path) => String(path ?? '').split('\\').join('/')

/**
 * @param {string[]} changedPaths repo-relative paths, e.g. from `git diff --name-only`
 * @returns {string[]} unique skill directory names, sorted
 */
export function changedSkills(changedPaths) {
  const names = new Set()
  for (const path of changedPaths ?? []) {
    const match = SKILL_PATH_PATTERN.exec(posix(path))
    if (match) names.add(match[1])
  }
  return [...names].sort()
}

/**
 * Which agent suite(s) a set of changed file paths puts at risk.
 *
 * A suite's own tree changing means its contract moved. An agent descriptor
 * changing is different: no path maps a descriptor to the suites that exercise
 * it — a suite names its agent through a `tags.agent` inside the spec — so any
 * descriptor change puts every suite at risk and all of them are re-run.
 *
 * @param {string[]} changedPaths repo-relative paths
 * @param {{ suites?: string[] }} options every agent suite the repository ships
 * @returns {string[]} unique suite directory names, sorted
 */
export function changedAgentSuites(changedPaths, { suites = [] } = {}) {
  const names = new Set()
  for (const path of changedPaths ?? []) {
    const posixPath = posix(path)
    if (AGENT_SOURCE_PATTERN.test(posixPath)) return [...suites].sort()
    const match = AGENT_SUITE_PATTERN.exec(posixPath)
    if (match) names.add(match[1])
  }
  return [...names].sort()
}
