import { join } from 'node:path'
import clientRedirects from '@docusaurus/plugin-client-redirects'
import { writeDirectoryIndexes, writeRedirectPage, writeSearchFolderIndex } from './redirect-pages.mjs'

// The Jekyll handbook served English pages at `/en/<page>` and `/en/<page>.html`; they now live at
// `/<page>`. The redirect plugin runs once per locale build and sees locale-less paths, so only the
// English build keeps it: the French build would otherwise write `/fr/en/<page>`. Both builds write
// the directory indexes Jekyll served (`/fr/explanation/pipeline/`) and `search/`, where the search
// box sends "See all results".
// `/404.html`, the search page and the `/next` preview never existed under `/en`: no redirect for them.
const NEVER_UNDER_EN = /\.html$|^\/search$|^\/next(\/|$)/

const oldEnglishPaths = (existingPath) =>
  NEVER_UNDER_EN.test(existingPath) ? undefined : [existingPath === '/' ? '/en' : `/en${existingPath}`]

// With trailingSlash: false the plugin cannot write `/en/<page>.html` (it would write `.html.html`),
// so the old `.html` addresses are written here.
async function writeOldHtmlAddresses({ routesPaths, baseUrl, outDir }) {
  for (const route of routesPaths) {
    const page = route.slice(baseUrl.length - 1)
    if (page === '/' || NEVER_UNDER_EN.test(page)) continue
    await writeRedirectPage(join(outDir, 'en', `${page}.html`), route)
  }
}

async function writeFolderIndexes(props) {
  await writeDirectoryIndexes(props)
  await writeSearchFolderIndex(props)
}

export default function redirectsPlugin(context) {
  if (context.i18n.currentLocale !== context.i18n.defaultLocale) {
    return { name: 'skraft-directory-indexes', postBuild: writeFolderIndexes }
  }
  const options = { fromExtensions: [], toExtensions: [], redirects: [], createRedirects: oldEnglishPaths }
  const plugin = clientRedirects(context, options)
  return {
    ...plugin,
    async postBuild(props) {
      await plugin.postBuild(props)
      await writeOldHtmlAddresses(props)
      await writeFolderIndexes(props)
    },
  }
}
