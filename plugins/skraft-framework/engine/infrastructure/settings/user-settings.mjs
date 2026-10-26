/**
 * The UserSettings port over a host's file functions: `.skraft/config.json` in the developer's
 * home folder.
 * @param {{ files: Pick<import('../tracking/tracking-store.mjs').FileFunctions, 'read' | 'join'>, home: string }} options
 * @returns {import('../../application/ports/user-settings.mjs').UserSettings}
 */
export const createUserSettings = ({ files, home }) => Object.freeze({
  read: () => files.read(files.join(home, '.skraft', 'config.json')),
})
