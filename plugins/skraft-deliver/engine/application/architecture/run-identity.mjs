import { openJournal } from '../journal/run-journal.mjs'

export const runIdentity = async (deps, scope) => {
  for (let index = 1; index <= 1000; index += 1) {
    const slug = index === 1 ? scope : `${scope}-run-${index}`
    const opened = await openJournal(deps, slug)
    if (!opened.ok) return opened
    if (!opened.journal.events.some((event) => event.type === 'run.finished')) return { ok: true, slug, existing: opened.journal.events.length > 0 }
  }
  return { ok: false, code: 'run-limit', reason: 'This scope has reached its 1000-run limit.' }
}
