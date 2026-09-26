// Pure domain: skill-loading policy helpers. No IO.

// Returns the SkillEntry[] the agent must load, derived from config.agentSkills.
// Each entry: { name: string, policy: 'verify' | 'eager' }
export const mandatorySkillsFor = (agentName, config) => {
  const skills = config?.agentSkills?.[agentName] ?? []
  return skills.map((s) => (typeof s === 'string' ? { name: s, policy: 'verify' } : s))
}

// Returns true when the skill entry has policy 'eager'.
export const isEagerSkill = (skill) => skill?.policy === 'eager'

// Returns required skill names that are absent from readSkills.
export const missingSkills = (readSkills, requiredNames) => {
  const readSet = new Set(readSkills)
  return requiredNames.filter((s) => !readSet.has(s))
}

// A read of a skill's entrypoint: …/skills/{name}/SKILL.md, nothing after it.
const SKILL_FILE_RE = /(?:^|[/\\])skills[/\\]([a-z0-9][a-z0-9-]*)[/\\]SKILL\.md$/
const SKILL_TOOLS = new Set(['skill'])
const READ_TOOLS = new Set(['read', 'view', 'read_file', 'readfile'])

const isObject = (value) => value !== null && typeof value === 'object'

// Transcript entries: a JSON array (inline transcript) or JSONL (harness file).
// Unparseable lines are skipped — they carry no tool call.
const entriesOf = (content) => {
  if (typeof content !== 'string' || content.trim() === '') return []
  try {
    const whole = JSON.parse(content)
    return Array.isArray(whole) ? whole : [whole]
  } catch {
    return content.split('\n').flatMap((line) => {
      try { return line.trim() ? [JSON.parse(line)] : [] } catch { return [] }
    })
  }
}

// Every tool call in an entry, whatever the harness shape: Claude's
// { type: 'tool_use', name, input } blocks, or { toolName|name, arguments|input } events.
// Tool results and text are never tool calls, so a mention there counts for nothing.
const toolCallsOf = (value, calls = []) => {
  if (Array.isArray(value)) {
    for (const item of value) toolCallsOf(item, calls)
    return calls
  }
  if (!isObject(value) || value.type === 'tool_result') return calls
  const name = value.type === 'tool_use' ? value.name : (value.toolName ?? (value.arguments ? value.name : undefined))
  const input = value.type === 'tool_use' ? value.input : (value.arguments ?? value.input)
  if (typeof name === 'string' && isObject(input)) calls.push({ name: name.toLowerCase(), input })
  for (const child of Object.values(value)) toolCallsOf(child, calls)
  return calls
}

const skillLoadedBy = ({ name, input }) => {
  if (SKILL_TOOLS.has(name)) {
    const skill = input.skill ?? input.name ?? input.command
    return typeof skill === 'string' && skill.length > 0 ? skill.split(':').pop() : null
  }
  if (READ_TOOLS.has(name)) {
    const path = input.file_path ?? input.filePath ?? input.path
    const match = typeof path === 'string' ? path.match(SKILL_FILE_RE) : null
    return match ? match[1] : null
  }
  return null
}

// Names of the skills a transcript shows loaded through a tool call — the Skill tool or a
// read of the skill's SKILL.md. A skill named in a prompt, in text or in a tool result
// was not loaded.
export const extractLoadedSkills = (content) => {
  const found = new Set()
  for (const call of toolCallsOf(entriesOf(content))) {
    const skill = skillLoadedBy(call)
    if (skill) found.add(skill)
  }
  return [...found]
}
