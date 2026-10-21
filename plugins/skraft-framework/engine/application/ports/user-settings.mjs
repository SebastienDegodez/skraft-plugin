/**
 * UserSettings — the developer's own configuration for every working copy,
 * `~/.skraft/config.json`, which the Workspace port cannot reach.
 *
 * @typedef {{ read: () => Promise<string | null> }} UserSettings
 *   read: the file's text, null when absent.
 */
export {}
