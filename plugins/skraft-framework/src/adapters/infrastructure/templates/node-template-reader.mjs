import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// TemplateReader (ports/infrastructure/template-reader.mjs) on the local file system.
export const createNodeTemplateReader = ({ pluginRoot }) => Object.freeze({
  read: (path) => readFile(join(pluginRoot, path), 'utf8'),
})
