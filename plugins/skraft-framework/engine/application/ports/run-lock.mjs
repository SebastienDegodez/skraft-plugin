/**
 * RunLock — `<slug>/.lock` of the tracking folder: the lease of the session driving that
 * pipeline. Every write is all or nothing against another session doing the same.
 *
 * @typedef {{
 *   owner: string,
 *   read: (slug: string) => Promise<string | null>,
 *   create: (slug: string, text: string) => Promise<boolean>,
 *   replace: (slug: string, seen: string, text: string | null) => Promise<boolean>,
 *   renew: (slug: string, seen: string, text: string) => Promise<boolean>,
 * }} RunLock
 *   owner: this session's id, letters, digits and hyphens, different for every session.
 *   read: the file's text, null when there is none. create: writes the file only when there is
 *   none (exclusive create); false when one exists. replace: puts text in place of the file
 *   (null removes it) only while it still holds seen, byte for byte; false when it holds
 *   something else or is gone; the file is absent for a moment meanwhile. renew: puts text in
 *   place of the file while it holds seen, as one atomic rename over it: the file is never
 *   absent, so a session that starts meanwhile cannot create one; false when it holds
 *   something else or is gone.
 */
export {}
