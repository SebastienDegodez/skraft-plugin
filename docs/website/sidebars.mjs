import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadBook } from '../../scripts/lib/book.mjs'
import { sidebarsFromBook } from './src/book/sidebars-from-book.mjs'

const docsDir = fileURLToPath(new URL('./docs/', import.meta.url))
// WP0: only the pages already converted exist on disk; the others join their sidebar when WP1 moves them.
const hasDoc = (id) => ['.md', '.mdx'].some((extension) => existsSync(`${docsDir}${id}${extension}`))

export default sidebarsFromBook(loadBook(fileURLToPath(new URL('./book.yml', import.meta.url))), { hasDoc })
