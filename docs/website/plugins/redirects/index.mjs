import clientRedirects from '@docusaurus/plugin-client-redirects'

// The Jekyll handbook served English pages at `/en/<page>`; they now live at `/<page>`.
// The redirect plugin runs once per locale build and sees locale-less paths, so only the
// English build keeps it: the French build would otherwise write `/fr/en/<page>`.
// `/404.html` and the search page were never Jekyll pages: no redirect for them.
const oldEnglishPath = (existingPath) =>
  /\.html$|^\/search$/.test(existingPath) ? undefined : [`/en${existingPath === '/' ? '' : existingPath}`]

export default function redirectsPlugin(context) {
  if (context.i18n.currentLocale !== context.i18n.defaultLocale) return null
  const options = { fromExtensions: [], toExtensions: [], redirects: [], createRedirects: oldEnglishPath }
  return clientRedirects(context, options)
}
