import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { iterPages, loadBook } from '../../../../scripts/lib/book.mjs'

// TEMPORARY (WP0 to WP1b): the pages not converted yet. A converted page links to them in their
// final form (a relative file link); until they are moved here, this plugin makes those links
// resolve to a placeholder route so the build can keep `onBrokenLinks: 'throw'`.
// Delete this folder, its two entries in docusaurus.config.js and src/components/PendingPage in WP1b.
const docsDir = fileURLToPath(new URL('../../docs/', import.meta.url))
const bookPath = fileURLToPath(new URL('../../book.yml', import.meta.url))

const docIdOf = (page) => page.en.replace(/^en\//, '').replace(/\.mdx?$/, '')
const onDisk = (id) => ['.md', '.mdx'].some((extension) => existsSync(`${docsDir}${id}${extension}`))

/** Doc ids declared in book.yml (without the dashboard page) that have no file yet. */
export const pendingDocIds = () => {
  const declared = [...iterPages(loadBook(bookPath))].map(({ page }) => docIdOf(page)).filter((id) => id !== 'dashboard/index')
  return new Set(declared.filter((id) => !onDisk(id)))
}
