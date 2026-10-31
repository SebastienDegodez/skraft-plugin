import { mkdir, stat, writeFile } from 'node:fs/promises'
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
export async function writeDirectoryIndexes({ routesPaths, baseUrl, outDir }) {
  for (const route of routesPaths) {
    const page = route.slice(baseUrl.length - 1)
    const folder = join(outDir, page)
    if (page === '/' || !(await isDirectory(folder))) continue
    const file = join(folder, 'index.html')
    if (await exists(file)) continue
    await writeFile(file, redirectPage(route))
  }
}

export async function writeRedirectPage(file, toUrl) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, redirectPage(toUrl), { flag: 'wx' })
}
