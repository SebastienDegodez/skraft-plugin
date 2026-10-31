// Links from the navbar and the footer to files that are not Docusaurus pages.
//
// Docusaurus puts the base URL of the current locale in front of a `pathname://` link unless the
// link already starts with it (measured on 3.10.2: `pathname:///skraft-plugin/v1/` became
// `/skraft-plugin/fr/skraft-plugin/v1/` in the French build). So:
// - a file copied into every locale build (static/: the dashboard, the deck) is `pathname:///<path>`
//   and lands on `/<base>/<path>` in English and `/<base>/fr/<path>` in French;
// - the v1 archive sits once beside the site, outside every locale: a raw HTML link keeps its href.

const escapeHtml = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

/** A file of `static/`, served in each locale build. */
export const inEachLocale = (path) => `pathname:///${path}`

const archiveAnchor = (className, baseUrl, path, label) =>
  `<a class="${className}" href="${escapeHtml(`${baseUrl}${path}`)}">${escapeHtml(label)}</a>`

/** A `docsVersionDropdown` item to the v1 archive, the same address in every locale. */
export const archiveDropdownItem = ({ baseUrl, path, label }) => ({
  type: 'html',
  value: archiveAnchor('dropdown__link', baseUrl, path, label),
})

/** A footer item to the v1 archive, the same address in every locale. */
export const archiveFooterItem = ({ baseUrl, path, label }) => ({
  html: archiveAnchor('footer__link-item', baseUrl, path, label),
})
