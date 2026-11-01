import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// A redirect page keeps the query and the anchor (`/en/reference/cli.html#see-also`): the script
// carries them, the meta refresh is the fallback for a browser without script (it drops the anchor).
export const redirectPage = (toUrl) => {
  const target = JSON.stringify(toUrl).replaceAll('<', '\\u003c')
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>Redirecting…</title>` +
    `<link rel="canonical" href="${toUrl}">` +
    `<script>location.replace(${target}+location.search+location.hash)</script>` +
    `<meta http-equiv="refresh" content="0; url=${toUrl}"></head>` +
    `<body><a href="${toUrl}">${toUrl}</a></body></html>\n`
  )
}

const isDirectory = async (path) => (await stat(path).catch(() => null))?.isDirectory() === true
const exists = async (path) => (await stat(path).catch(() => null)) !== null

// Jekyll served `/explanation/pipeline/` as a directory index. The build has `explanation/pipeline.html`
// and an `explanation/pipeline/` folder of sub-pages without `index.html`, so that address 404s.
// The index is a copy of the page, never a redirect to it: `docusaurus serve` (3.10.2) answers
// `/explanation/pipeline` with the folder's `index.html`, so a redirect there reloads itself forever.
export async function writeDirectoryIndexes({ routesPaths, baseUrl, outDir }) {
  for (const route of routesPaths) {
    const page = route.slice(baseUrl.length - 1)
    const folder = join(outDir, page)
    if (page === '/' || !(await isDirectory(folder))) continue
    const file = join(folder, 'index.html')
    if (await exists(file)) continue
    await copyFile(`${folder}.html`, file)
  }
}

// The search box's "See all results" link is `<baseUrl>search/?q=…` whatever `trailingSlash` says
// (@easyops-cn/docusaurus-search-local 0.55.3). With trailingSlash: false the build has `search.html`
// only, so a new tab on `search/` 404s on GitHub Pages: the folder index is a copy of the page.
export async function writeSearchFolderIndex({ outDir }) {
  const page = join(outDir, 'search.html')
  if (!(await exists(page))) return
  await mkdir(join(outDir, 'search'), { recursive: true })
  await copyFile(page, join(outDir, 'search', 'index.html'))
}

export async function writeRedirectPage(file, toUrl) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, redirectPage(toUrl), { flag: 'wx' })
}
