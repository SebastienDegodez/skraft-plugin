import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import clientRedirects from '@docusaurus/plugin-client-redirects'

// The Jekyll handbook served English pages at `/en/<page>` and `/en/<page>.html`; they now live at
// `/<page>`. The redirect plugin runs once per locale build and sees locale-less paths, so only the
// English build keeps it: the French build would otherwise write `/fr/en/<page>`.
// `/404.html`, the search page and the `/next` preview never existed under `/en`: no redirect for them.
const NEVER_UNDER_EN = /\.html$|^\/search$|^\/next(\/|$)/

const oldEnglishPaths = (existingPath) =>
  NEVER_UNDER_EN.test(existingPath) ? undefined : [existingPath === '/' ? '/en' : `/en${existingPath}`]

const redirectPage = (toUrl) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>Redirecting…</title>` +
  `<link rel="canonical" href="${toUrl}"><meta http-equiv="refresh" content="0; url=${toUrl}"></head>` +
  `<body><a href="${toUrl}">${toUrl}</a></body></html>\n`

// With trailingSlash: false the plugin cannot write `/en/<page>.html` (it would write `.html.html`),
// so the old `.html` addresses are written here.
async function writeOldHtmlAddresses({ routesPaths, baseUrl, outDir }) {
  for (const route of routesPaths) {
    const page = route.slice(baseUrl.length - 1)
    if (page === '/' || NEVER_UNDER_EN.test(page)) continue
    const file = join(outDir, 'en', `${page}.html`)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, redirectPage(route), { flag: 'wx' })
  }
}

export default function redirectsPlugin(context) {
  if (context.i18n.currentLocale !== context.i18n.defaultLocale) return null
  const options = { fromExtensions: [], toExtensions: [], redirects: [], createRedirects: oldEnglishPaths }
  const plugin = clientRedirects(context, options)
  return {
    ...plugin,
    async postBuild(props) {
      await plugin.postBuild(props)
      await writeOldHtmlAddresses(props)
    },
  }
}
