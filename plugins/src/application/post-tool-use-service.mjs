// PostToolUse tracer (G3). Journals every SKILL.md file read to the audit JSONL.
// Fail-open: a logging error must never deny the tool use.

const SKILL_MD_PATH_RE = /([a-z0-9][a-z0-9-]*)\/SKILL\.md$/

const extractSkillName = (filePath) => {
  const match = typeof filePath === 'string' ? filePath.match(SKILL_MD_PATH_RE) : null
  return match ? match[1] : null
}

export const createPostToolUseService = ({ auditWriter, clock }) => ({
  handle: async ({ toolName, toolInput } = {}) => {
    try {
      if (toolName !== 'Read') return undefined

      const filePath = toolInput?.filePath ?? toolInput?.file_path
      const skill = extractSkillName(filePath)
      if (!skill) return undefined

      await auditWriter.write({
        event: 'SkillRead',
        skill,
        filePath,
        readAt: clock.now()
      })
    } catch { /* fail-open: logging errors must never interrupt tool use */ }
    return undefined
  }
})
