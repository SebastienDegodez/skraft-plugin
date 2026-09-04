import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

const RULES_DIRECTORY = 'com.github.copilot/rules'
const posix = (value) => String(value ?? '').split('\\').join('/')

const pluginRelativeRulePath = (declaredPath) => {
  const normalized = posix(declaredPath)
  const marker = `${RULES_DIRECTORY}/`
  const markerIndex = normalized.indexOf(marker)
  if (markerIndex < 0 || isAbsolute(normalized)) {
    throw new Error(`Instruction path is outside ${RULES_DIRECTORY}: ${declaredPath}`)
  }
  return normalized.slice(markerIndex)
}

const assertInside = (root, path) => {
  const rel = relative(root, path)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Instruction path escapes ${RULES_DIRECTORY}`)
  }
}

export const createInstructionFileReader = ({ pluginRoot }) => {
  const rulesRoot = resolve(pluginRoot, RULES_DIRECTORY)
  return {
    read: async (declaredPath) => {
      const path = resolve(pluginRoot, pluginRelativeRulePath(declaredPath))
      assertInside(rulesRoot, path)
      return readFile(path, 'utf8')
    },
  }
}
