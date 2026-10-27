/**
 * Workspace — the files of the working copy and of its neighbours, by paths relative to the
 * working copy (`skraft-config.json`, `services/api`, `../payment-web`), `/`-separated.
 *
 * @typedef {{ name: string, kind: 'file' | 'dir' }} WorkspaceEntry
 * @typedef {{
 *   read: (path: string) => Promise<string | null>,
 *   write: (path: string, text: string) => Promise<void>,
 *   replace: (path: string, text: string) => Promise<void>,
 *   list: (path: string) => Promise<WorkspaceEntry[] | null>,
 * }} Workspace
 *   read: null when absent. replace: the file's new text in one rename over it, so a reader or
 *   a crash finds the old text or the new, never part of it. list: the folder's entries, null when it is not a folder; rejects
 *   when it is one the machine cannot list.
 * @typedef {Pick<Workspace, 'read'>} ConfigSource
 *   What reads `skraft-config.json` and nothing else needs.
 */
export {}
