/**
 * The UserSettings port over a host's file functions: `.skraft-design/config.json` in the developer's
 * home folder.
 * @param {{ files: Pick<import('../tracking/tracking-store.mjs').FileFunctions, 'read' | 'write' | 'join'>, home: string }} options
 * @returns {import('../../application/ports/user-settings.mjs').UserSettings}
 */
export const createUserSettings = ({ files, home }) => Object.freeze({
  read: () => files.read(files.join(home, '.skraft-design', 'config.json')),
  write: (text) => files.write(files.join(home, '.skraft-design', 'config.json'), text),
})
