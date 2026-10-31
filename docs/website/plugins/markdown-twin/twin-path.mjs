// Pure and dependency-free: shared by the build (post-build.mjs) and the Agent button in the browser.
// A doc's permalink may end with `/` (a folder's index doc) while the site serves it without
// (`trailingSlash: false`); only the home of a version, whose slug is `/`, keeps its slash.

/** @param {{ permalink: string, slug: string }} doc */
export const htmlPathOf = ({ permalink, slug }) =>
  slug === '/' ? permalink.replace(/\/?$/, '/') : permalink.replace(/\/$/, '')

/** The site path of a doc's Markdown twin: its HTML path plus `.md`, `index.md` for the home of a version. */
export const twinPathOf = (doc) => {
  const html = htmlPathOf(doc)
  return html.endsWith('/') ? `${html}index.md` : `${html}.md`
}
