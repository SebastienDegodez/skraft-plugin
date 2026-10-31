import { existsSync, readFileSync } from 'node:fs'
import { themes as prism } from 'prism-react-renderer'
import remarkPendingLinks from './plugins/pending-pages/remark-pending-links.mjs' // TEMPORARY, deleted in WP1b

const at = (path) => new URL(path, import.meta.url)
const released = existsSync(at('./versions.json')) ? JSON.parse(readFileSync(at('./versions.json'), 'utf8')) : []
const SITE = 'https://sebastiendegodez.github.io/skraft-plugin'
const REPO = 'https://github.com/SebastienDegodez/skraft-plugin'
const EDIT_BRANCH = process.env.SKRAFT_DOCS_EDIT_BRANCH ?? 'integration/v2-next' // 'main' after 2.0.0

// Before the 2.x cut: only `current`, served at the root. After it: 2.x at the root, current at /next.
const versions = released.length === 0
  ? { current: { label: '2.0 preview', path: '/', banner: 'none' } }
  : {
      current: { label: 'next', path: 'next', banner: 'unreleased', noIndex: true },
      '2.x': { label: '2.x', path: '/', banner: 'none' },
    }

/** The folder of the translated docs of a version: `docs` is `current`, `versioned_docs/version-X` is `version-X`. */
const translatedDocsDir = (versionDocsDirPath) =>
  versionDocsDirPath === 'docs' ? 'current' : versionDocsDirPath.replace('versioned_docs/', '')

/** @type {import('@docusaurus/types').Config} */
export default {
  title: 'skraft',
  tagline: 'An AI-agent SDLC pipeline: every phase delivered by one agent, reviewed by another.',
  url: 'https://sebastiendegodez.github.io',
  baseUrl: '/skraft-plugin/',
  trailingSlash: false, // /how-to/run-gates -> how-to/run-gates.html (GitHub Pages)
  favicon: 'img/favicon.png',
  organizationName: 'SebastienDegodez',
  projectName: 'skraft-plugin',
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  onDuplicateRoutes: 'throw',
  future: { v4: true }, // with "@docusaurus/faster" in dependencies
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr'],
    localeConfigs: { en: { label: 'English', htmlLang: 'en' }, fr: { label: 'Français', htmlLang: 'fr' } },
  },
  markdown: {
    format: 'detect', // .md is CommonMark, .mdx is MDX
    mermaid: true,
    hooks: { onBrokenMarkdownLinks: 'throw', onBrokenMarkdownImages: 'throw' },
  },
  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ['en', 'fr'],
        docsRouteBasePath: '/',
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
      },
    ],
  ],
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        blog: false,
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.mjs',
          lastVersion: released.length ? '2.x' : 'current',
          versions,
          onlyIncludeVersions: process.env.SKRAFT_DOCS_CURRENT_ONLY ? ['current'] : undefined, // fast dev/preview
          beforeDefaultRemarkPlugins: [remarkPendingLinks], // TEMPORARY, deleted in WP1b
          showLastUpdateTime: true, // needs fetch-depth: 0 in CI
          editUrl: ({ locale, versionDocsDirPath, docPath }) =>
            locale === 'en'
              ? `${REPO}/edit/${EDIT_BRANCH}/docs/website/${versionDocsDirPath}/${docPath}`
              : `${REPO}/edit/${EDIT_BRANCH}/docs/website/i18n/${locale}/docusaurus-plugin-content-docs/${translatedDocsDir(versionDocsDirPath)}/${docPath}`,
        },
        theme: { customCss: './src/css/custom.css' },
        sitemap: { lastmod: 'date', ignorePatterns: ['/skraft-plugin/next/**', '/skraft-plugin/fr/next/**'] },
      }),
    ],
  ],
  plugins: [
    './plugins/skraft-data/index.mjs',
    './plugins/aliases/index.mjs',
    './plugins/pending-pages/index.mjs', // TEMPORARY, deleted in WP1b
    './plugins/redirects/index.mjs', // /en/<p> -> /<p> for the English build only
    'docusaurus-plugin-image-zoom',
  ],
  customFields: { workflowRefs: { current: 'integration/v2-next', '2.x': 'v2.0.0' } },
  themeConfig: {
    colorMode: { defaultMode: 'light', respectPrefersColorScheme: true },
    docs: { sidebar: { hideable: true, autoCollapseCategories: true } },
    tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
    zoom: { selector: '.theme-doc-markdown img:not(a img)', background: { light: 'rgba(255,255,255,0.92)', dark: 'rgba(22,25,31,0.92)' } },
    navbar: {
      title: 'skraft',
      logo: { alt: 'skraft', src: 'img/logo.png' },
      items: [
        { type: 'docSidebar', sidebarId: 'tutorials', label: 'Tutorials', position: 'left' },
        { type: 'docSidebar', sidebarId: 'howTo', label: 'How-to guides', position: 'left' },
        { type: 'docSidebar', sidebarId: 'explanation', label: 'Explanation', position: 'left' },
        { type: 'docSidebar', sidebarId: 'reference', label: 'Reference', position: 'left' },
        {
          type: 'docsVersionDropdown',
          position: 'right',
          dropdownItemsAfter: [
            { type: 'html', value: '<hr class="dropdown__divider">' },
            { href: `${SITE}/v1.15.3/`, label: '1.15 (archived)' },
            { href: `${SITE}/v1/`, label: 'All v1 versions' },
          ],
        },
        { type: 'localeDropdown', position: 'right' },
        { href: REPO, label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Handbook',
          items: [
            { label: 'Catalogue', href: `${SITE}/dashboard/` },
            { label: 'Presentation', href: `${SITE}/skraft-basic-presentation.html` },
            { label: 'Citations', to: '/reference/citations' },
          ],
        },
        { title: 'More', items: [{ label: 'GitHub', href: REPO }, { label: 'v1 archive', href: `${SITE}/v1/` }] },
      ],
    },
    mermaid: { theme: { light: 'neutral', dark: 'dark' } },
    prism: {
      theme: prism.github,
      darkTheme: prism.vsDark,
      additionalLanguages: ['bash', 'powershell', 'json', 'yaml', 'diff', 'gherkin', 'dot', 'csharp', 'java', 'python'],
    },
  },
}
