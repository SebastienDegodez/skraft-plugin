import { LOCAL_CONFIG_FILE, REPL_PACKAGES } from '../../domain/config/skraft-config.mjs'
import { ignoring } from '../../domain/config/git-ignore.mjs'

const GIT_IGNORE = '.gitignore'

/**
 * Lists the developer's own layer, skraft-design-config.local.json, in the working copy's `.gitignore`,
 * once: it is never committed.
 * @param {Pick<import('../ports/workspace.mjs').Workspace, 'read' | 'write'>} workspace
 */
export const ignoreLocalConfig = async (workspace) => {
  const text = ignoring(await workspace.read(GIT_IGNORE), LOCAL_CONFIG_FILE)
  if (text !== null) await workspace.write(GIT_IGNORE, text)
}

/**
 * Lists the packages the developer installs for the project's REPL library, `.repl/node_modules/`,
 * in the working copy's `.gitignore`, once: `.repl/package.json` and its lockfile are committed,
 * the installed packages never.
 * @param {Pick<import('../ports/workspace.mjs').Workspace, 'read' | 'write'>} workspace
 */
export const ignoreReplPackages = async (workspace) => {
  const text = ignoring(await workspace.read(GIT_IGNORE), '.repl/node_modules/', REPL_PACKAGES)
  if (text !== null) await workspace.write(GIT_IGNORE, text)
}
