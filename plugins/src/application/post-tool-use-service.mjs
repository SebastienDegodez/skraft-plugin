// PostToolUse tracer (G3). Journals every SKILL.md file read to the audit JSONL.
// Fail-open: a logging error must never deny the tool use.
import { allow } from '../adapters/api/hooks/decision.mjs'

const SKILL_MD_PATH_RE =
  /(?:plugins\/skills|\.agents\/skills|\.github\/skills|\.copilot\/skills)\/([^/]+)\/SKILL\.md$/i

// Equivalent mutants (not testable beyond try-catch observable boundary):
//   - ConditionalExpression: `typeof path === 'string'` → defensive guard; try-catch makes it equivalent
//   - OptionalChaining: `toolInput?.path` → defensive guard; try-catch makes it equivalent
const extractSkillName = (path) => {
  const match = typeof path === 'string' ? path.match(SKILL_MD_PATH_RE) : null
  return match ? match[1] : null
}

export const createPostToolUseService = ({ auditWriter, clock }) => ({
  handle: async ({ agentName, toolInput } = {}) => {
    try {
      const path = toolInput?.path
      const skillName = extractSkillName(path)
      if (skillName) {
        await auditWriter.write({
          eventType: 'SkillRead',
          agentName,
          skillName,
          path,
          timestamp: clock.now()
        })
      }
    } catch { /* fail-open: logging errors must never interrupt tool use */ }
    return allow()
  }
})
