// Pure rules: which files are a subject's AI content, and which subjects a set
// of changed file paths puts at risk.
//
// A pull request evaluates a skill or an agent suite only when its AI content
// changed: the skill directory and the companion skills mounted beside it, the
// agent descriptors a suite exercises (both agent trees, and the repository's
// own agents), the subject's eval spec folder, and every file the spec stages
// from outside that folder. Tooling and code — the runner, the adapters, the
// executor, eng/lib, the workflow, package manifests, eval-models.json, engine
// code — select nothing: a change there is checked by its own tests, not by
// paying for a real-model evaluation of every subject.

const posix = (path) => String(path ?? '').split('\\').join('/')

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const skillTree = (name) => new RegExp(`^plugins/[^/]+/skills/${escape(name)}/`)

const specFolder = ({ kind, name }) => new RegExp(`^tests/${kind === 'agent' ? 'agents' : 'skills'}/${escape(name)}/`)

const stagedTree = (path) => new RegExp(`^${escape(posix(path).replace(/\/+$/, ''))}(?:/|$)`)

// A descriptor is named after its agent id in every tree: `<id>.agent.md` under
// com.github.copilot and .github/agents, `<id>.md` under com.anthropic.claude-code.
const descriptors = (id) => [
  new RegExp(`^plugins/[^/]+/com\\.github\\.copilot/agents/(?:.+/)?${escape(id)}\\.agent\\.md$`),
  new RegExp(`^plugins/[^/]+/com\\.anthropic\\.claude-code/agents/(?:.+/)?${escape(id)}\\.md$`),
  new RegExp(`^\\.github/agents/${escape(id)}\\.agent\\.md$`),
]

// A suite whose spec could not say which agents it exercises is put at risk by
// any descriptor: running it is the cost of not knowing.
const ANY_DESCRIPTOR = [
  /^plugins\/[^/]+\/(?:com\.github\.copilot|com\.anthropic\.claude-code)\/agents\//,
  /^\.github\/agents\//,
]

const agentSources = (agents) => (Array.isArray(agents) ? agents.flatMap(descriptors) : ANY_DESCRIPTOR)

/**
 * The path patterns of a subject's AI content.
 *
 * @param {{ kind: 'skill' | 'agent', name: string }} subject
 * @param {{ companions?: string[], staged?: string[], agents?: string[] | null }} inputs
 *   `agents` is the list of agent ids a suite exercises; null or absent when the
 *   spec could not be read, in which case every descriptor counts.
 * @returns {RegExp[]}
 */
export function subjectContent(subject, { companions = [], staged = [], agents } = {}) {
  const own = subject.kind === 'agent' ? agentSources(agents) : [subject.name, ...companions].map(skillTree)
  return [specFolder(subject), ...own, ...staged.map(stagedTree)]
}

/**
 * Which subjects a set of changed file paths puts at risk.
 *
 * @param {string[]} changedPaths repo-relative paths, e.g. from `git diff --name-only`
 * @param {Array<{ kind: 'skill' | 'agent', name: string, companions?: string[], staged?: string[], agents?: string[] | null }>} subjects
 *   every subject that carries an eval spec, with what its spec reads
 * @returns {{ skills: string[], agents: string[] }} sorted names
 */
export function changedSubjects(changedPaths, subjects = []) {
  const paths = (changedPaths ?? []).map(posix)
  const touched = subjects.filter((subject) => {
    const content = subjectContent(subject, subject)
    return paths.some((path) => content.some((pattern) => pattern.test(path)))
  })
  const names = (kind) => [...new Set(touched.filter((subject) => subject.kind === kind).map(({ name }) => name))].sort()
  return { skills: names('skill'), agents: names('agent') }
}

const tagIds = (value) => (Array.isArray(value) ? value : [value]).filter((id) => typeof id === 'string' && id)

const collectAgents = (node, found) => {
  if (Array.isArray(node)) node.forEach((child) => collectAgents(child, found))
  else if (node && typeof node === 'object') {
    if (node.tags && typeof node.tags === 'object') found.push(...tagIds(node.tags.agent), ...tagIds(node.tags.subagents))
    Object.values(node).forEach((child) => collectAgents(child, found))
  }
  return found
}

/**
 * Every agent id a suite's stimuli name through `tags.agent` and
 * `tags.subagents` — the descriptors the executor registers for it.
 *
 * @param {unknown} spec the parsed eval spec
 * @returns {string[]} sorted, unique
 */
export function exercisedAgents(spec) {
  return [...new Set(collectAgents(spec, []))].sort()
}
