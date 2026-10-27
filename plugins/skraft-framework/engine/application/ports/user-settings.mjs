/**
 * UserSettings — the developer's own configuration for every working copy,
 * `~/.skraft/config.json`, which the Workspace port cannot reach.
 *
 * @typedef {{ read: () => Promise<string | null>, write: (text: string) => Promise<void> }} UserSettings
 *   read: the file's text, null when absent. write: replaces it, creating its folder.
 */
export {}
