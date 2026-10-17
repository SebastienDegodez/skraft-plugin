/**
 * Workspace — the files of the working copy and of its neighbours, by paths relative to the
 * working copy (`skraft-config.json`, `services/api`, `../payment-web`), `/`-separated.
 *
 * @typedef {{ name: string, kind: 'file' | 'dir' }} WorkspaceEntry
 * @typedef {{
 *   read: (path: string) => Promise<string | null>,
 *   write: (path: string, text: string) => Promise<void>,
 *   list: (path: string) => Promise<WorkspaceEntry[] | null>,
 * }} Workspace
 *   read: null when absent. list: the folder's entries, null when it is not a folder.
 * @typedef {Pick<Workspace, 'read'>} ConfigSource
 *   What reads `skraft-config.json` and nothing else needs.
 */
export {}
