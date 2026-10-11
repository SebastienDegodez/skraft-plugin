/**
 * RunJournalStore — the lines of `<slug>/events.jsonl`, in file order.
 *
 * @typedef {{
 *   lines: (slug: string) => Promise<string[]>,
 *   append: (slug: string, line: string) => Promise<void>,
 * }} RunJournalStore
 *   lines: the non-empty lines, without their line ending; [] when the file is absent.
 *   append: adds one line and its line ending at the end of the file, creating it.
 */
export {}
