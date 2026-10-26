/**
 * JournalKeys — the secret keys that sign the journals, kept outside every working copy
 * (`~/.skraft/journal-keys/<id>.key`), where no agent's write scope reaches and no commit takes
 * them.
 *
 * @typedef {{
 *   create: () => Promise<{ id: string, key: string }>,
 *   read: (id: string) => Promise<string | null>,
 * }} JournalKeys
 *   create: a new random key, stored under a new id of 32 lowercase hex digits; key is
 *   lowercase hex. read: the key stored under that id, null when this machine holds none.
 */
export {}
