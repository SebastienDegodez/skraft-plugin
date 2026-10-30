import { LOCAL_CONFIG_FILE } from '../../domain/config/skraft-config.mjs'
import { ignoring } from '../../domain/config/git-ignore.mjs'

const GIT_IGNORE = '.gitignore'

/**
 * Lists the developer's own layer, skraft-config.local.json, in the working copy's `.gitignore`,
 * once: it is never committed.
 * @param {Pick<import('../ports/workspace.mjs').Workspace, 'read' | 'write'>} workspace
 */
export const ignoreLocalConfig = async (workspace) => {
  const text = ignoring(await workspace.read(GIT_IGNORE), LOCAL_CONFIG_FILE)
  if (text !== null) await workspace.write(GIT_IGNORE, text)
}
