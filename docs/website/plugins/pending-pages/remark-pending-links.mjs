import { existsSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { pendingDocIds } from './pending.mjs'

// TEMPORARY (see pending.mjs). A relative link `../how-to/x.md` whose file does not exist yet but
// whose doc is declared in book.yml becomes the route `/how-to/x`, served by a placeholder page.
const TREES = [`${sep}website${sep}i18n${sep}fr${sep}docusaurus-plugin-content-docs${sep}current${sep}`, `${sep}website${sep}docs${sep}`]

const treeRootOf = (filePath) => {
  for (const marker of TREES) {
    const at = filePath.indexOf(marker)
    if (at >= 0) return filePath.slice(0, at + marker.length)
  }
  return undefined
}

const rewrite = (url, filePath, pending) => {
  const match = /^(\.{1,2}\/[^#?]*\.mdx?)(#.*)?$/.exec(url)
  const root = treeRootOf(filePath)
  if (!match || !root) return url
  const target = resolve(dirname(filePath), match[1])
  const id = relative(root, target).split(sep).join('/').replace(/\.mdx?$/, '')
  return !existsSync(target) && pending.has(id) ? `/${id}` : url // the anchor goes too: the placeholder has none
}

const walk = (node, visit) => {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

export default function remarkPendingLinks() {
  const pending = pendingDocIds()
  return (tree, file) => {
    walk(tree, (node) => {
      if (node.type === 'link' || node.type === 'definition') node.url = rewrite(node.url, file.path, pending)
    })
  }
}
