// Converts the Jekyll handbook pages (docs/site/{en,fr}) into Docusaurus pages (docs/website).
// Plan: docs/v2/docusaurus-migration-plan.md, section 3. Zero dependency.

/**
 * Converts one Jekyll page.
 * @param {string} source the Jekyll page
 * @param {{ docId: string, locale: 'en'|'fr' }} options
 * @returns {{ text: string, extension: '.md'|'.mdx', findings: object[], redirects: object[] }}
 */
export const convertPage = (source, options) => ({ text: source, extension: '.md', findings: [], redirects: [] })
