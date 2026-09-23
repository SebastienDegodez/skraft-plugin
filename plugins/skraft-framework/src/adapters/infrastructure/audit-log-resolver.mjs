import { readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

// The git directory holding `cwd`: a `.git` directory, or the one a `.git` file
// (worktree, submodule) points to. Null outside a repository. Never throws.
const gitDirOf = (cwd) => {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const candidate = join(dir, '.git')
    try {
      const info = statSync(candidate)
      if (info.isDirectory()) return candidate
      if (info.isFile()) {
        const pointer = readFileSync(candidate, 'utf8').match(/^gitdir:\s*(.+)\s*$/m)?.[1]
        if (pointer) return isAbsolute(pointer) ? pointer : resolve(dir, pointer)
      }
    } catch { /* not here — climb */ }
    if (dirname(dir) === dir) return null
  }
}

// One audit log per project, kept where it is never committed and survives plugin
// updates: SKRAFT_AUDIT_LOG, else the project's git directory, else the plugin's logs.
export const resolveAuditLogPath = ({ env = process.env, cwd = process.cwd(), pluginRoot }) => {
  if (env.SKRAFT_AUDIT_LOG) return env.SKRAFT_AUDIT_LOG
  const gitDir = gitDirOf(cwd)
  return gitDir ? join(gitDir, 'skraft', 'skill-audit.jsonl') : join(pluginRoot, 'logs', 'skill-audit.jsonl')
}
