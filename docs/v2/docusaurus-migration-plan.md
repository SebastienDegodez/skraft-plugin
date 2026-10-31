# skraft handbook: Jekyll to Docusaurus migration plan

Status: plan only. Nothing here is implemented, committed or filed.
Repo state read: `integration/v2-next` at `b20a27ff` (2026-10-30).
Delivery: one branch, `docs/docusaurus`, cut from `integration/v2-next`, merged by **one PR** into
`integration/v2-next`. Implementer subagents run in cloud sessions from GitHub. Each work package
(WP) below is a self-contained brief: it names the repo paths it reads and owns. A subagent cannot
read this file unless the coordinator pastes the WP section into its prompt (or commits the plan).

Owner decisions taken as given (not reopened):
- EN at the root, FR under `/fr/`.
- Versions `next` and `2.x` only; v1 stays online as external links.
- The site ships with 2.0.0; `next` can be previewed from `integration/v2-next` before then.
- Strict Diátaxis, with `book.yml` as the structure contract.
- The goal is readability.

---

## 0. Evidence summary

### 0.1 What exists today (measured in the repo)

| Item | Measured |
|---|---|
| Pages | 62 EN + 62 FR `.md` (`find docs/site/{en,fr} -name '*.md'`) |
| Words | EN 82,033 / FR 87,681 (`wc -w`). EN prose without fences: tutorials 3,503 (3 pages, avg 1,167), how-to 13,189 (18, avg 732), explanation 25,663 (27, avg 950), reference 33,506 (12, avg 2,792), home 896 |
| Largest pages (EN prose words) | reference/cli 6,717 · run-journal 4,727 · skraft-config 3,944 · workflow-dot 3,657 · hosts 3,636 · gates 3,405 · explanation/domain-driven-design 1,683 · token-economy 1,671 · how-to/publish-pull-request 1,547 |
| Liquid links | `relative_url` 543 per locale in 59 files. Targets: `/en/reference` 190, `/en/explanation` 184, `/en/how-to` 92, `/en/dashboard/` 27, `/assets/screenshots` 18, `/en/tutorials` 9, `/dashboard/` 3, `/en/` 1. 84 of them carry `}}#anchor` |
| Citation links | `{% assign cites = "/en/reference/citations" \| relative_url %}` in 19 files; `{{ cites }}#cite-<key>` 110 per locale |
| Includes in pages | 6 per locale, all `phase-ribbon.html current="…"` (discover, discuss, research, design, distill, deliver) |
| Other Liquid | `reference/citations.md` loops over `site.data.citations` (`{% for %}`, `{% if %}` ×3, `{% elsif %}`). `{% raw %}` in `reference/phases.md` (×2) and `reference/run-journal.md` (×1) |
| Heading IDs `{#id}` | 98 per locale. **The EN and FR ID sets are identical** (diff of the sorted sets is empty), so explicit IDs are load-bearing: translated headings share anchors |
| Raw HTML / JSX hazards outside code | `<div class="fil-rouge" markdown="1">` + `<span>`/`<em>` blocks in 7 pipeline pages per locale. The citations-page HTML. ~25 placeholder tags in prose (`<slug>`, `<reason>`, `<PHASE>`, `<a> -> <b>` in reference/workflow-dot tables, …). 32 `{`/`}` in prose in 4 files. No `<!--`, no `<http…>` autolinks, no kramdown `{: …}` |
| Mermaid fences | 27 per locale |
| Admonition-like blockquotes | ~37 intro blockquotes right after the H1 (the `intro-callout` of book.yml). 4 `> **Label.**` notes: fil-rouge "Decision", "Jargon", reading-a-verdict question, contributing "Genesis", evaluate-a-skill "Not verified on V2". 0 `:::` fences |
| Code fences (EN) | 193: text 99, none 21, json 18, mermaid 27, bash 6, sh 3, js 5, dot 4, markdown 3, ts 3, yaml 3, gherkin 1 |
| Shell-like fences (EN, heuristic: text/none/bash/sh) | commands only 62 · command + output 16 (includes some output-only `skraft checkout: waiting` blocks the heuristic over-matched) · output, file or template 47 · trees/diagrams 4. Script: scratchpad `inv/fences.mjs` |
| Images | 18 per locale, all screenshots |
| Front matter | layout 62, lang 62, title 62, description 61, persona 51, permalink 1 (dashboard) |
| Host variants | 22 EN pages name ≥2 hosts. Per-host H3 sections in `how-to/install-on-a-host` and `how-to/answer-a-question`; H2 sections with IDs in `reference/hosts` |
| Includes / layouts | `_includes/`: citation, dashboard-content (93 lines, 45 Liquid tags), doc-pager, handbook-sidebar, lang-toggle, mermaid, phase-ribbon, sidebar-toggle, site-nav, version-picker. `_layouts/`: dashboard, default, doc, splash. CSS: design-tokens (50 lines), doc (236), site (852) |
| Screenshots | `docs/site/assets/screenshots/`. en/fr: backlog-canvas-{progress,review}.png, dashboard-{catalogue,quality}.png. shared: pipeline-canvas-{question,adr,done}.png, replay-{sessions,baseline,skilled}.png, terminal-{init,doctor,status-waiting,status-done,gates,report-done,workflow-log}.svg |
| Screenshot tooling | `eng/docs/screenshots.mjs` (504 lines): Playwright, fixed clock, `colorScheme: 'dark'` default, 1280×800. Every capture is dark only. Terminal SVGs come from `eng/docs/terminal-svg.mjs`: dark card, traffic-light dots, title bar. The dashboard is re-rendered through **liquidjs** from `_layouts/dashboard.html` + `_data/nav.yml`. No canvas UI has a `prefers-color-scheme` rule (`grep -c` = 0) |
| Dashboard | `docs/site/dashboard/{index.html (front matter only), app.js 590, styles.css 221}`. Data comes from `eng/dashboard/build.mjs` into `docs/site/dashboard/data/` (gitignored). AGENTVIZ `agentviz@1.2.0` is copied into `_site/dashboard/replay/` at deploy time |
| Engine DOT reader | `plugins/skraft-framework/engine/domain/workflow/{dot.mjs (parseDot), workflow.mjs (readWorkflow), review-branches.mjs, call.mjs}`. Pure domain code (AGENTS.md: no `node:`, no `process`). `readWorkflow` returns `WorkflowNode`s with `kind, phase, agent, gates, lenses, question, goal, locked, unlock, outputs, writes, model, refuter, each, publish, when, branches, call, mandatory`. Fan-out and lens nodes are **folded into the review node's `branches`**. Subgraph clusters are dropped: "attributes only draw them" |

### 0.2 How the current deploy publishes versions, and why v1 needs an action

Source: `.github/workflows/pages-deploy.yml`, `eng/docs/{plan,versions,inject-switcher}.mjs`.

- **Only `main` deploys.** A push to `integration/v2-next` runs `gh workflow run pages-deploy.yml --ref main`.
- **Each deploy rebuilds everything from git.** That covers:
  - the root, from `main` with Jekyll;
  - every tag selected by `selectVersions`, each through `git archive refs/tags/<tag> docs/site` + `jekyll build` into `_site/<tag>/`;
  - `integration/v2-next` into `_site/v2-next/`.
  - `inject-switcher.mjs` adds a `<select>` that fetches `<base>/versions.json`.
- **Today's manifest** (`node eng/docs/plan.mjs`):
  - root: `main` (v1.15.3);
  - tags: `v2.0.0-alpha.37`, `v1.15.3`, `v1.15.2`, `v1.15.1`, `v1.15.0`, `v1.14.1`, `v1.14.0`, `v1.13.0`, `v1.12.0`, `v1.11.0`;
  - integration: `/v2-next/`.
- **The v1 trees are not stored anywhere.** They exist only as output of each deploy.
- **A Pages deployment publishes one artifact.** It is uploaded by `actions/upload-pages-artifact` and published by `actions/deploy-pages`.
  - The research found no GitHub sentence that says "replaces the whole site" verbatim (https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages only describes the artifact).
  - The current workflow already depends on that behaviour: it rebuilds every version each time because nothing outside the artifact survives.
  - **Consequence:** a Docusaurus deploy that does not put the v1 trees inside its artifact removes them.
- **How v1 stays online (WP7):**
  - build the v1 trees once, from their immutable tags, with the Jekyll toolchain that still works today;
  - store them as a tarball asset on a dedicated GitHub release, `docs-archive-v1`;
  - every new deploy downloads that asset, checks its sha256 and extracts it into `build/`.
  - Their URLs (`/skraft-plugin/v1.15.3/…`) stay the same. Ruby is no longer needed after the one-off archive run.

### 0.3 Platform facts (sources)

Checked through `npm view`, the npm tarballs, and the official docs. "Not verified" means I could not confirm it.

**Core and build**
- **Docusaurus core:** `@docusaurus/core` 3.10.2 is `latest` (published 2026-07-10).
  - Peer dependencies: react/react-dom `^18||^19`, `@mdx-js/react ^3`. Engines: node `>=20.0`.
  - No 4.x pre-release exists, only `4.0.0-canary-*`.
- **`future.v4: true`** (https://docusaurus.io/blog/releases/3.10, https://docusaurus.io/docs/api/docusaurus-config#future)
  - Turns on `removeLegacyPostBuildHeadAttribute`, `useCssCascadeLayers`, `siteStorageNamespacing`, `fasterByDefault` and `mdx1CompatDisabledByDefault`.
  - Through `fasterByDefault`, every `future.faster` flag defaults to true (Rspack, SWC, Lightning CSS, `ssgWorkerThreads`, `gitEagerVcs`, …).
  - `experimental_faster` is now a config error ("renamed to `future.faster`", read in core 3.10.2 `configValidation.js`).
  - The official 3.10.2 classic template uses `future: { v4: true }` plus the `@docusaurus/faster` 3.10.2 dependency.
  - Caveat: `mdx1Compat` becomes all false, so `{#id}`, `<!-- -->` and the `:::note Title` form stop working unless re-enabled explicitly.
- **Docs-only mode** (https://docusaurus.io/docs/docs-introduction#docs-only-mode): `routeBasePath: '/'`, a doc with `slug: /`, and no `src/pages/index.*`.

**Versioning**
- **Practice** (https://docusaurus.io/docs/versioning): "keep the number of your versions below 10"; do not version patch releases; archived versions become external links to immutable URLs; link to files by path (`.md`).
- **`docs:version X`** copies `docs/` into `versioned_docs/version-X/`, writes `versioned_sidebars/version-X-sidebars.json` and appends X to `versions.json`.
- **Options:** `lastVersion`, `onlyIncludeVersions`, `versions.{name}.{label,path,banner,badge,noIndex}`.
- **`docsVersionDropdown`** accepts `dropdownItemsBefore` and `dropdownItemsAfter` (https://docusaurus.io/docs/api/themes/configuration).

**i18n** (https://docusaurus.io/docs/i18n/tutorial)
- Translated docs live in `i18n/fr/docusaurus-plugin-content-docs/{current,version-2.x}/`, with `current.json` / `version-2.x.json` for sidebar labels.
- Theme strings live in `i18n/fr/code.json` and `docusaurus-theme-classic/{navbar,footer}.json`. They are extracted with `write-translations --locale fr`.
- `build` produces one single-page app per locale. The dev server runs one locale at a time (`start -- --locale fr`).
- Slugs are not translated.

**Markdown and MDX** (https://docusaurus.io/docs/markdown-features, issue https://github.com/facebook/docusaurus/issues/9092)
- `markdown.format: 'detect'` reads `.md` as CommonMark ("experimental") and `.mdx` as MDX.
- CommonMark mode has no imports and no JSX, so no Tabs and no DocCardList. Admonitions and heading IDs do work in both formats (mdx-loader 3.10.2 source).
- **Heading IDs** (https://docusaurus.io/docs/markdown-features/toc): `{#id}` is "not valid MDX syntax anymore". The native forms are `{/* #id */}` in MDX and `<!-- #id -->` in CommonMark. `write-heading-ids` exists.
- **Broken links:** top-level `onBrokenMarkdownLinks` was deprecated in 3.9 in favour of `markdown.hooks.onBrokenMarkdownLinks`. `onBrokenAnchors` warns by default.

**Theme and swizzling**
- **Swizzle safety**, from `@docusaurus/theme-classic@3.10.2/src/getSwizzleConfig.ts`:
  - wrap is **safe** for `CodeBlock`, `MDXContent`, `MDXComponents/Pre`, `MDXComponents/Code`, `DocCardList`, `DocSidebar` and `SearchBar`;
  - `CodeBlock/Content` is unsafe; `Admonition/Types` is eject-safe and wrap-forbidden;
  - `DocItem/*` has no entry, so it is not declared safe.
  - Policy (https://docusaurus.io/docs/swizzling): "Use CSS" first, "Prefer wrapping", "The smaller, the better".
- **Styling** (https://docusaurus.io/docs/styling-layout): Infima uses 7 primary shades; aim for WCAG AA; target the stable `ThemeClassNames`. The doc column is capped at `max-width: 75%` above 997px, with no variable for it.
- **Images** (https://docusaurus.io/docs/markdown-features/assets): GitHub-style `#gh-light-mode-only` / `#gh-dark-mode-only` fragments are "easily implement[ed] yourself" with CSS; `ThemedImage` exists; `/img/x.png` resolves from `static/`.
- **Code blocks** (https://docusaurus.io/docs/markdown-features/code-blocks): `title="…"` in the metastring, `additionalLanguages`. No console or shell-session language is documented.
- **Tabs** (https://docusaurus.io/docs/markdown-features/tabs): `groupId` syncs tabs and persists the choice; `queryString` puts it in the URL and wins over the stored choice.

**Search** (https://docusaurus.io/community/resources#search, npm)
- `@easyops-cn/docusaurus-search-local` 0.55.3 (2026-07-29).
  - Peer: `@docusaurus/theme-common ^2||^3`; lunr-languages 1.23.0 includes `fr`.
  - Index scoped to the active version; i18n support "since v0.25.0".
  - Depends on `@node-rs/jieba` (native, prebuilt per OS).
- Algolia DocSearch requires production-ready public docs and domain verification (https://docsearch.algolia.com/docs/who-can-apply).

**llms.txt and Markdown twins**
- Core 3.10.2 has no native support (issue https://github.com/facebook/docusaurus/issues/10899 is open).
- `docusaurus-plugin-llms` 0.6.1 (2026-10-03, peer `@docusaurus/core ^3`) writes llms.txt / llms-full.txt and per-page md, multi-version.
- `docusaurus-markdown-source-plugin` 2.4.0 (2026-10-27, peer core `^3||^4`) writes `.md` twins plus an "Open Markdown" dropdown. The dropdown has fixed English labels and is DOM-injected through a `Root` wrapper into a second React root, with "Open in ChatGPT/Claude/Gemini/Perplexity/Grok" rows.
- `docusaurus-plugin-copy-page-button` 0.8.5 (2026-10-12) converts the rendered HTML in the browser.

**Graph viewer libraries** (`npm view`, tarball sizes measured with gzip)

| Package | Version / date | Size | Notes |
|---|---|---|---|
| `@xyflow/react` | 12.12.0 (2026-10-11) | ESM 233 kB, 52 kB gz | MIT, peer react `>=17` |
| `@dagrejs/dagre` | 3.1.3 (2026-10-24) | min 49 kB, 17 kB gz | MIT, compound graphs |
| `elkjs` | 0.12.1 (2026-10-28) | bundled 1.65 MB, 480 kB gz | EPL-2.0 OR GPL-3.0 |
| `@hpcc-js/wasm-graphviz` | 1.30.0 | 637 kB gz | |
| `@viz-js/viz` | 3.31.0 | 469 kB gz | |
| `svg-pan-zoom` | 3.6.2 | | last publish 2024-10 |
| `@panzoom/panzoom` | 4.6.2 | 3.9 kB gz | |
| `@ts-graphviz/parser` | 0.6.1 | | 2022 |
| `dotparser` | 1.1.1 | | 2022 |

**Other packages**
- `docusaurus-plugin-image-zoom` 3.0.1 (2025-02-07): peer `@docusaurus/theme-classic >=3`, depends on `medium-zoom ^1.1.0`.
- `@axe-core/playwright` 4.14.0.
- `@docusaurus/plugin-client-redirects` 3.10.2.

**GitHub Pages deploy** (https://docusaurus.io/docs/deployment#triggering-deployment-with-github-actions)
- Pattern: `upload-pages-artifact` + `deploy-pages`, with `fetch-depth: 0`.
- Set `trailingSlash` explicitly, because "GitHub Pages adds a trailing slash … by default".
- `upload-pages-artifact` excludes dotfiles by default.

---

## 1. Target architecture

### 1.1 Location: `docs/website/`

**Why `docs/website/` rather than converting `docs/site/` in place or using a root `website/`:**
- **Release behaviour.** `release.yml` `paths-ignore` and the `docs` commit type already keep documentation out of releases. A path under `docs/` keeps that behaviour with one pattern change (`docs/site/**` becomes `docs/website/**`). A root `website/` would trigger semantic-release on every docs push.
- **The live preview keeps building.** `main`'s current deploy builds `/v2-next/` with `git archive refs/remotes/origin/integration/v2-next docs/site` under `set -euo pipefail`.
  - Deleting or repurposing `docs/site` on `integration/v2-next` before 2.0.0 would fail **main's** deploy: `git archive` exits non-zero on a missing pathspec, which would block v1 doc deploys.
  - A new directory lets `docs/site/` shrink to a 2-file Jekyll stub until the final PR to `main` (see §1.6 and WP10).
- **Familiar layout.** `website/` is the conventional Docusaurus directory name, the layout the Docusaurus repository itself uses.
- **Dependencies.** The site gets its own `package.json` and lockfile, like `plugins/skraft-framework/engine/`. The root `package.json` stays dev tooling and gains `docs:*` scripts that call `npm --prefix docs/website`.

```
docs/website/
  package.json, package-lock.json        "type": "module"; node >=20
  docusaurus.config.js                   §1.2
  sidebars.js                            derived from book.yml (§1.3)
  book.yml                               moved from docs/site/_data/book.yml (git mv)
  data/citations.yml, data/personas.yml  moved from docs/site/_data/ (git mv); nav.yml deleted
  docs/                                  EN, the `current` version (labelled `next` once 2.x exists)
    index.mdx                            home, slug: /
    tutorials/ how-to/ explanation/ reference/
  i18n/fr/
    docusaurus-plugin-content-docs/current/…   FR pages, same relative paths and file names as docs/
    docusaurus-plugin-content-docs/current.json  sidebar labels, generated from book.yml, committed
    docusaurus-theme-classic/navbar.json, footer.json
    code.json                            theme + search + custom component strings
  src/css/custom.css                     tokens (§2.3)
  src/theme/CodeBlock/index.js           wrap (safe): console fences become a Terminal (§2.5)
  src/theme/MDXContent/index.js          wrap (safe): page header slot = Agent button + phase ribbon
  src/components/{Terminal,PageActions,PhaseRibbon,Bibliography,WorkflowViewer}/
  src/book/sidebars-from-book.mjs        pure, tested
  plugins/skraft-data/                   loads data/citations.yml and personas.yml as global data
  plugins/markdown-twin/                 .md twins + llms.txt + llms-full.txt (§1.8)
  plugins/engine-domain/                 configureWebpack alias to the engine domain (§1.9)
  static/img/screenshots/{en,fr,shared}/ moved from docs/site/assets/screenshots (git mv)
  static/img/{logo.png,favicon.png}
  static/dashboard/{index.html,app.js,styles.css}   static app (§2.6); data/ generated
  static/skraft-basic-presentation.html  moved (git mv); URL unchanged
  static/en/dashboard/index.html         meta-refresh to ../../dashboard/ (old URL)
  versioned_docs/ versioned_sidebars/ versions.json   created only by the 2.x cut (final PR)
```

`.gitignore` additions:
- `docs/website/{build,.docusaurus,node_modules}/`
- `docs/website/static/dashboard/data/`
- `docs/website/static/workflows/` (generated, §1.9)

### 1.2 `docusaurus.config.js` (sketch)

```js
import { existsSync, readFileSync } from 'node:fs'
import { themes as prism } from 'prism-react-renderer'

const at = (p) => new URL(p, import.meta.url)
const released = existsSync(at('./versions.json')) ? JSON.parse(readFileSync(at('./versions.json'), 'utf8')) : []
const SITE = 'https://sebastiendegodez.github.io/skraft-plugin'
const REPO = 'https://github.com/SebastienDegodez/skraft-plugin'
const EDIT_BRANCH = process.env.SKRAFT_DOCS_EDIT_BRANCH ?? 'integration/v2-next'   // 'main' after 2.0.0

// Before the 2.x cut: only `current`, served at the root. After it: 2.x at the root, current at /next.
const versions = released.length === 0
  ? { current: { label: '2.0 preview', path: '/', banner: 'unreleased' } }
  : { current: { label: 'next', path: 'next', banner: 'unreleased', noIndex: true },
      '2.x': { label: '2.x', path: '/', banner: 'none' } }

export default {
  title: 'skraft', url: 'https://sebastiendegodez.github.io', baseUrl: '/skraft-plugin/',
  trailingSlash: false,                       // /how-to/run-gates -> how-to/run-gates.html (GitHub Pages)
  favicon: 'img/favicon.png',
  onBrokenLinks: 'throw', onBrokenAnchors: 'throw', onDuplicateRoutes: 'throw',
  future: { v4: true },                       // with "@docusaurus/faster": "3.10.2" in dependencies
  i18n: { defaultLocale: 'en', locales: ['en', 'fr'],
          localeConfigs: { en: { label: 'English', htmlLang: 'en' }, fr: { label: 'Français', htmlLang: 'fr' } } },
  markdown: {
    format: 'detect', mermaid: true,
    hooks: { onBrokenMarkdownLinks: 'throw', onBrokenMarkdownImages: 'throw' },
    // mdx1Compat: { headingIds: true }   <- only if the spike rejects the native comment IDs (WP0 decision D2)
  },
  themes: ['@docusaurus/theme-mermaid',
    ['@easyops-cn/docusaurus-search-local', { hashed: true, language: ['en', 'fr'], docsRouteBasePath: '/',
      indexBlog: false, highlightSearchTermsOnTargetPage: true, explicitSearchResultPath: true }]],
  presets: [['classic', {
    blog: false,
    docs: {
      routeBasePath: '/', sidebarPath: './sidebars.js',
      lastVersion: released.length ? '2.x' : 'current', versions,
      onlyIncludeVersions: process.env.SKRAFT_DOCS_CURRENT_ONLY ? ['current'] : undefined,   // fast dev/preview
      showLastUpdateTime: true,                                   // needs fetch-depth: 0 in CI
      editUrl: ({ locale, versionDocsDirPath, docPath }) => locale === 'en'
        ? `${REPO}/edit/${EDIT_BRANCH}/docs/website/${versionDocsDirPath}/${docPath}`
        : `${REPO}/edit/${EDIT_BRANCH}/docs/website/i18n/${locale}/docusaurus-plugin-content-docs/${versionDocsDirPath === 'docs' ? 'current' : versionDocsDirPath.replace('versioned_docs/', '')}/${docPath}`,
    },
    theme: { customCss: './src/css/custom.css' },
    sitemap: { lastmod: 'date', ignorePatterns: ['/skraft-plugin/next/**', '/skraft-plugin/fr/next/**'] },
  }]],
  plugins: ['./plugins/skraft-data', './plugins/markdown-twin', './plugins/engine-domain',
    ['@docusaurus/plugin-client-redirects', { createRedirects: oldEnglishPaths }],   // /en/<p> -> /<p>
    'docusaurus-plugin-image-zoom'],                                                  // only if WP0 D6 keeps it
  customFields: { workflowRefs: { current: 'integration/v2-next', '2.x': 'v2.0.0' } },  // §1.9
  themeConfig: {
    colorMode: { defaultMode: 'light', respectPrefersColorScheme: true },
    docs: { sidebar: { hideable: true, autoCollapseCategories: true } },
    tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
    navbar: { title: 'skraft', logo: { alt: 'skraft', src: 'img/logo.png' }, items: [
      { type: 'docSidebar', sidebarId: 'tutorials', label: 'Tutorials', position: 'left' },
      { type: 'docSidebar', sidebarId: 'howTo', label: 'How-to guides', position: 'left' },
      { type: 'docSidebar', sidebarId: 'explanation', label: 'Explanation', position: 'left' },
      { type: 'docSidebar', sidebarId: 'reference', label: 'Reference', position: 'left' },
      { type: 'docsVersionDropdown', position: 'right', dropdownItemsAfter: [
          { type: 'html', value: '<hr class="dropdown__divider">' },
          { href: `${SITE}/v1.15.3/`, label: '1.15 (archived)' },
          { href: `${SITE}/v1/`, label: 'All v1 versions' }] },
      { type: 'localeDropdown', position: 'right' },
      { href: REPO, label: 'GitHub', position: 'right' }] },
    footer: { style: 'light', links: [ /* Catalogue: pathname:///dashboard/ · Presentation: pathname:///skraft-basic-presentation.html · Changelog · Glossary · Citations · v1 archive */ ] },
    mermaid: { theme: { light: 'neutral', dark: 'dark' } },
    prism: { theme: prism.github, darkTheme: prism.vsDark,
             additionalLanguages: ['bash', 'powershell', 'json', 'yaml', 'diff', 'gherkin', 'dot', 'csharp', 'java', 'python'] },
  },
}
```

Spike checks on this sketch (WP0):
- **Version-aware entry points.** `docSidebar` navbar items must land on the part's generated index page and follow the active version. Fallback: one `index.mdx` per part with `<DocCardList/>`.
- **Redirect paths.** `createRedirects` must receive locale-prefixed paths, so that only EN paths get `/en` redirects.
- **Archived-version links.** Check whether `pathname:///v1.15.3/` keeps the baseUrl inside `dropdownItemsAfter`. If it does, it replaces the absolute `SITE` URLs, so previews on other hosts work too.
- **Static files per locale.** `static/` must be copied into each locale output (`build/fr/dashboard/`). The dashboard relies on it (§2.6).

### 1.3 `book.yml` stays the contract; the sidebars are derived from it

Why keep `book.yml`:
- It carries what `sidebars.js` cannot: page `type` (derived / editorial / dashboard), `source` globs for drift, `purpose_*`, templates, `retire`, `requires_risk_section`, and both locales' labels.
- `scan-drift`, `lint-nav`, the gh-aw workflows and seven `.github/agents/skraft-docs-*` agents read it.
- Replacing it would move that metadata into front matter on 124 files.

Schema changes, with concrete reasons:
1. **Page paths become one doc id.** Replace each page's `fr:` / `en:` paths with a single `doc: how-to/install-on-a-host` (no extension).
   - Docusaurus i18n requires the FR file at the same relative path and name as the EN one, so two path fields are redundant. Rule 3 ("same English basename") becomes structural and cannot break.
   - `scripts/lib/book.mjs` gains `pageFiles(page, siteRoot) → { en, fr }`, which resolves `.md` or `.mdx`.
2. **`meta.design` is rewritten.** The layout artifacts move to `docs/website/...`, the theme becomes `docusaurus-classic`, and the content measure is `72ch`. The header comment block that cites `_layouts/doc.html` is updated.
3. **Each part gets `slug:`** (`/tutorials`, `/how-to`, `/explanation`, `/reference`). Each section gets an `intro_fr` / `intro_en` (one sentence) for its generated index page.
4. **`how-to` gets `sections`.** Today it has 18 flat entries, the longest flat list in the sidebar (readability, §2.1). `lint-nav` already supports sections.
5. **Other paths:**
   - `sources.citations` becomes `docs/website/data/citations.yml`;
   - the `retire` globs are rewritten to the new paths (`docs/website/docs/reference/agents/*.md`, `docs/website/i18n/fr/…/reference/agents/*.md`, …).

`sidebars.js`:

```js
import { loadBook } from '../../scripts/lib/book.mjs'               // the existing zero-dependency reader
import { sidebarsFromBook } from './src/book/sidebars-from-book.mjs'
export default sidebarsFromBook(loadBook(new URL('./book.yml', import.meta.url)))
```

`sidebarsFromBook` (pure, tested):
- **One sidebar per Diátaxis part:** `tutorials`, `howTo`, `explanation`, `reference`. The home doc belongs to none (`displayed_sidebar: null`).
- **Part:** a non-collapsible category with `key: part.id`, `label: title_en` and `link: { type: 'generated-index', slug: part.slug, title, description: intro_en }`.
- **Section:** a category with `key: section.id` and `link: { type: 'generated-index', slug: <part slug>/<section id>, description: section.intro_en }`.
- **Page:** `{ type: 'doc', id: page.doc, label: label_en }`.
- **FR labels:** a generator, `docs/website/scripts/book-translations.mjs [--check]`, fills `i18n/fr/docusaurus-plugin-content-docs/current.json` from `title_fr`, `label_fr` and `intro_fr`.
  - Method: run `docusaurus write-translations --locale fr` once to learn the exact keys, then fill each one.
  - The generator fails when a key has no `book.yml` source.
  - `--check` runs in CI, the same pattern as `skills:check`.

### 1.4 Versions and i18n layout

| Moment | `docs/` (current) | `versioned_docs/version-2.x` | URLs |
|---|---|---|---|
| This PR → 2.0.0 | the V2 docs, label "2.0 preview", banner `unreleased` | none | `/` (EN), `/fr/` (FR) in local builds and preview artifacts |
| Final PR to `main` (2.x cut) | becomes `next` | snapshot by `docusaurus docs:version 2.x` + FR copy into `i18n/fr/docusaurus-plugin-content-docs/version-2.x/` + `version-2.x.json` | 2.x: `/`, `/fr/`; next: `/next/`, `/fr/next/` (`noIndex`, out of sitemap) |

v1 never enters Docusaurus. The dropdown shows `1.15 (archived)` and `All v1 versions` (a static index page in the archive asset).

Rules:
- `scan-drift`, `lint-nav` and the docs agents work on `docs/` and `i18n/fr/…/current/` only.
- `versioned_docs/version-2.x` takes fixes only: errata on released behaviour, applied to both trees in the same commit.
- `static/` is not versioned, so a refreshed screenshot shows on both versions. That is acceptable for UI captures. A versioned screenshot needs `static/img/screenshots/2.x/` at cut time (not planned).

### 1.5 Deployment (effective when the final PR lands on `main`)

New `.github/workflows/pages-deploy.yml`:
- **Triggers:** `push` to `main` (paths `docs/website/**`, `eng/**`, `plugins/skraft-framework/**`, the workflow file) and `workflow_dispatch`.
- **Build job**, with the existing permissions model:
  1. `actions/checkout` with `fetch-depth: 0` (last-update dates).
  2. `actions/setup-node`, node 22.
  3. `npm ci`, then `npm ci --prefix docs/website`.
  4. `node eng/catalog/scan.mjs && node eng/dashboard/build.mjs --repository "$GITHUB_REPOSITORY" --out docs/website/static/dashboard/data/dashboard.json`.
  5. `node eng/docs/workflow-copies.mjs --out docs/website/static/workflows`: the build-time DOT copies per version (§1.9).
  6. `npm run build --prefix docs/website`: all locales, all versions; broken links fail the build.
  7. AGENTVIZ: the same pinned `npm pack agentviz@1.2.0` step, copied into `docs/website/build/dashboard/replay/`.
  8. v1 archive: `gh release download docs-archive-v1 --pattern docs-v1-archive.tar.gz`, `sha256sum -c` against `DOCS_V1_ARCHIVE_SHA256` (pinned in the workflow `env`), extract into `docs/website/build/`.
  9. `node eng/docs/check-build.mjs docs/website/build`. It asserts the expected layout: `index.html`, `fr/index.html`, `next/` once `versions.json` lists 2.x, `llms.txt` per locale and version, `dashboard/index.html`, each `v1.*/index.html`.
  10. `upload-pages-artifact` with `path: docs/website/build`, then `deploy-pages`.
- **Action pins:** keep the repository's SHA-pin style. Current releases are upload-pages-artifact v5.0.0, deploy-pages v5.0.1, checkout v7.0.1, setup-node v7.1.0 and configure-pages v6.0.0. Resolve the SHAs when implementing, or keep the current pins.
- **Removed:**
  - Ruby, Jekyll and the `build_ref` loop;
  - `versions.json` and `inject-switcher`;
  - the `request-deploy` job (no `/v2-next/` any more);
  - `docs-tag.yml` (no per-patch versions).

One-off `.github/workflows/docs-archive-v1.yml`, run by `workflow_dispatch` from `integration/v2-next` **before** the final PR merges:
- Builds the v1 tags listed explicitly in its `env`: `v1.15.3 v1.15.2 v1.15.1 v1.15.0 v1.14.1 v1.14.0 v1.13.0 v1.12.0 v1.11.0`, the v1 tags published today.
  - Each one goes through `git archive refs/tags/<tag> docs/site` and Ruby 3.3 + `bundle exec jekyll build --baseurl /skraft-plugin/<tag>`, using that tag's own Gemfile.
- Injects a **static** archive banner with `node eng/docs/archive-banner.mjs`: "Archived documentation for skraft <tag>, current documentation →". There is no `versions.json` fetch, so the archive never depends on the live site.
- Writes `v1/index.html` (the list of archived trees), then tars, gzips and computes the sha256.
- Runs `gh release create docs-archive-v1 docs-v1-archive.tar.gz --latest=false --notes "…"`. The tag name does not match `v*`, so semantic-release and the version tooling ignore it.
- The workflow is deleted in the final PR once the asset exists and its sha256 is pinned.

### 1.6 Preview of `next` before 2.0.0

`main`'s deploy is the only Pages publisher, and V2 work never touches `main`. Before 2.0.0, `next` is therefore previewed through:
1. **A local build:** `npm run docs:build && npm run docs:serve`. `docusaurus serve` honours `baseUrl` and `trailingSlash`.
2. **A CI artifact:** the new `docs-website.yml` workflow builds on every PR and on pushes to `integration/v2-next`, then uploads `docs-website-build` (retention 14 days).
   - Reviewers download it and serve it with `npm run docs:serve -- --dir <unzipped>`, or just `npx docusaurus serve --dir <path>` from `docs/website`.

Until the final PR, `docs/site/` on `integration/v2-next` becomes a Jekyll stub (`_config.yml` + `index.md`). Its page says where the V2 handbook now lives and how to preview it, so `main`'s nightly-style rebuild of `/v2-next/` keeps succeeding. A hosted preview needs a change on `main` (open question Q2).

### 1.7 Search

- **Choice:** `@easyops-cn/docusaurus-search-local` with `language: ['en','fr']`, `hashed: true` and `docsRouteBasePath: '/'`.
- **Why:**
  - it builds a local index per locale and per version, with no account and no crawler;
  - it works on the CI artifacts and on local builds;
  - it is the most active local plugin and covers French through lunr-languages.
- **FR UI strings:** they go in `i18n/fr/code.json` under `theme.SearchBar.*` and `theme.SearchPage.*`.
- **Spike checks:** the index stays scoped per version and locale; the install works on Windows and macOS (`@node-rs/jieba` prebuilt binaries).
- **Later:** Algolia DocSearch becomes possible after 2.0.0, when the site is "production ready". That is a later decision, not part of this plan.

### 1.8 Agent button, Markdown twins and llms.txt

**Decision: a local plugin `docs/website/plugins/markdown-twin/` plus a page header component.** I verified the npm candidates (§0.3) and none fits all three requirements:
- `docusaurus-markdown-source-plugin` comes closest (it handles i18n and versions through route metadata), but its UI has fixed English labels, mounts in a separate React root through DOM injection, and adds "Open in ChatGPT/Claude/Gemini/Perplexity/Grok" rows.
- `docusaurus-plugin-copy-page-button` converts the rendered HTML in the browser instead of serving the source.
- `docusaurus-plugin-llms` covers only the llms files; its i18n handling is in its source, not in its README.

The local plugin is about 200 lines, owns one transformation, and is tested.

**Plugin behaviour:**
- **Collect.** `allContentLoaded({ allContent })` reads the docs plugin content of the current locale build: for every loaded version and every doc, its `source`, `permalink`, `title`, `description`, `frontMatter` and sidebar order.
- **Write twins.** `postBuild({ outDir, siteConfig, i18n })` writes, for each doc, `<outDir>/<permalink without baseUrl and locale prefix>.md`:
  - `/how-to/run-gates` gives `how-to/run-gates.md`; `/fr/next/how-to/run-gates` gives `build/fr/next/how-to/run-gates.md`; the home gives `index.md`.
- **Transform** (pure module `transform.mjs`, line-based on the controlled syntax, no parser dependency):
  - strip front matter;
  - start with `# <title>`, then `> Source: <absolute HTML URL> · Version <label> · <locale> · Updated <date>`;
  - rewrite relative doc links to the absolute URL of the target's `.md` twin (anchors kept), and image paths to absolute URLs;
  - admonitions become blockquotes: `:::warning[T]` → `> **Warning — T**`;
  - in `.mdx` pages, drop `import` lines, turn `<Tabs>`/`<TabItem label="X">` into `#### X` sections, `<WorkflowViewer file="pipeline" />` into a line linking the raw DOT file on GitHub at the version's ref, and `<Bibliography/>` into the rendered list from `citations.yml`;
  - keep `console` fences as they are.
- **llms files.** Per locale build and per version, it writes `llms.txt` and `llms-full.txt` at the version root: `build/llms.txt`, `build/next/llms.txt`, `build/fr/llms.txt`, `build/fr/next/llms.txt`.
  - `llms.txt`: H1 `skraft`, a one-line summary blockquote, then one H2 per Diátaxis part listing `- [Title](absolute .md URL): description` in sidebar order. The root file also links the FR and `next` variants. (Format follows the llms.txt proposal; not re-verified here.)
  - `llms-full.txt`: every twin of that version and locale in sidebar order, separated by `---`.

**Page header** (`src/theme/MDXContent/index.js`, a safe wrap):
- It renders `<DocPageHeader/>` before `children`, only when `useRouteContext().plugin.name === 'docusaurus-plugin-content-docs'`.
- `DocPageHeader` contains `<PageActions/>` (the Agent button) and `<PhaseRibbon/>` (when `frontMatter.phase` is set).
- It also emits `<Head><link rel="alternate" type="text/markdown" href="<twin URL>"/></Head>`.

**The Agent button, exactly:**
- **Element.** `<a class="skraft-agent-button" href="<twin URL>" target="_blank" rel="noopener">`. It is a real link, so it works without JS, with middle-click and for crawlers.
  - Placement: right-aligned on the first row of the article, above the H1, on every doc page (generated index pages excluded).
- **Visible label.** EN "Agent", FR "Agent", with an icon (`aria-hidden="true"`).
- **Accessible name** (`aria-label` + `title`), through `<Translate id="skraft.agentButton.label">`:
  - EN: "Open this page as Markdown for an AI agent (new tab) and copy it";
  - FR: "Ouvrir cette page en Markdown pour un agent IA (nouvel onglet) et la copier".
- **Click** (pointer, Enter, Space via `role` semantics of a link + keydown handler):
  1. Copy the twin's text with `navigator.clipboard.write([new ClipboardItem({ 'text/plain': fetch(url).then(r => r.blob()) })])`. The promise-valued item keeps the user activation in Safari.
     - Fallback: `navigator.clipboard.writeText(url)`.
  2. Let the default navigation open the twin in a new tab.
  3. Announce the result in a visually hidden `aria-live="polite"` region:
     - success: EN "Markdown copied" / FR "Markdown copié";
     - failure: EN "Could not copy; the Markdown opened in a new tab" / FR "Copie impossible ; le Markdown s'est ouvert dans un nouvel onglet".
- **Focus and size.** Visible focus ring through `--ifm-color-primary`. Target size at least 44×44 px on touch.
- **Not verified:** the `Content-Type` GitHub Pages sends for `.md` (expected `text/markdown`). If a browser downloads instead of displaying, the copy and the agent fetch still work. The first deploy checks it with `curl -I`.

**Tests:**
- `tests/tooling/docs-markdown-twin/transform.test.mjs`: one case per construct (front matter, links with and without anchors, FR and next permalinks, admonition with title, Tabs, viewer, image).
- `tests/tooling/docs-markdown-twin/post-build.test.mjs`: runs `postBuild` on a temp `outDir` with a fake content object of 2 versions × 3 docs, and asserts the twin paths, `llms.txt` order and `llms-full.txt` content.
- `tests/site/agent-button.spec.mjs` (Playwright, Chromium with `clipboard-read` / `clipboard-write` permissions):
  - EN and FR labels and accessible names;
  - Enter activates it; a popup opens with a URL ending in `.md` and text starting with `# <page title>`;
  - the clipboard holds the same text; the live region reads "Markdown copied";
  - `link[rel=alternate][type="text/markdown"]` is present.

### 1.9 DOT workflow visual interpreter (`WorkflowViewer`)

**Semantics come from the engine, not from a second parser.**
- `plugins/engine-domain/` adds a `configureWebpack` alias, `@skraft/engine-domain` → `<repo>/plugins/skraft-framework/engine/domain`.
- The viewer imports `readWorkflow` from `@skraft/engine-domain/workflow/workflow.mjs`: the exact function the engine runs. It reads `review.skraft.dot` with `{ called: true }`, like a call does.
- This is possible because AGENTS.md forbids `node:`, `process` and I/O in `domain/`. Its transitive imports are `config/skraft-config.mjs`, `decisions/questions.mjs`, `gates/gate-plan.mjs` and `review/lenses.mjs`, all in the domain.
- **No engine change is planned.** If bundling needs one (a new export), it follows AGENTS.md's engine TDD rules in its own commit.
- **WP5 risk check first:** Rspack must bundle these `.mjs` files from outside `siteDir`.

**Library choice: `@xyflow/react` 12.12.0 + `@dagrejs/dagre` 3.1.3.**
- **Why:**
  - they add about 70 kB gzipped, loaded only on the 3 pages that use the viewer;
  - React Flow ships pan, zoom, `fitView`, Controls, focusable nodes and edges with ARIA labels, and a `colorMode` prop;
  - node cards are plain React components, which gives the Arazzo-style cards with attributes;
  - dagre handles compound groups and `rankdir` TB/LR;
  - both are MIT and published in October 2026;
  - peer `react >=17` is compatible with React 19.
- **Rejected:**
  - `elkjs`: 480 kB gzipped and EPL/GPL licence. It stays the fallback only if dagre's compound layout is unreadable.
  - Graphviz WASM (`@hpcc-js/wasm-graphviz` 637 kB, `@viz-js/viz` 469 kB, plus a pan-zoom library): heavy, gives SVG nodes that need manual keyboard handling, and the drawing would follow DOT shapes rather than the engine's folded model.
  - `@ts-graphviz/parser` and `dotparser`: a second parser, untouched since 2022.

**View model:** `src/components/WorkflowViewer/flow-model.mjs`, pure and tested, `toFlow(workflow, { direction: 'LR' | 'TB' })`.
- **Nodes by kind:**
  - start/exit: pills;
  - agent: card with the agent, `model=` family, `each`/`proposal`, outputs and writes;
  - gate: card with the gate list, a lock icon when `locked`, `unlock` reason, `goal`;
  - review: a **group** holding one lens chip per `branches[]` (lens, `when=`, `mandatory`) and the fan-in verdict;
  - ask: the question key and its answers;
  - publish: what it publishes and `when`;
  - call: a card with "runs workflow `review`" and a button that switches the viewer to the review workflow.
- **Grouping:**
  - phases as light swimlane groups (`phase` already inherited by the engine);
  - review groups labelled `<PHASE> review`, which matches the DOT clusters without reading them.
- **Edges:** `label` (PASS/FAIL/APPROVED/NEEDS_REWORK or an answer) and `max_visits` as a badge.

**UI:**
- **Toolbar** (buttons with `aria-pressed`):
  - "Pipeline / Review";
  - "Horizontal / Vertical" (default horizontal at ≥ 997px, vertical below);
  - "Fit".
- **Viewport:** `height: clamp(420px, 70vh, 760px)`, `fitView` on load and on every toggle.
- **Scroll is never hijacked:** `zoomOnScroll={false}`, zoom with Ctrl/⌘ + wheel or with the Controls.
- **Keyboard:** Tab reaches nodes, Enter opens the side panel, Esc closes it. React Flow's keyboard panning stays on.
- **Side panel** (drawer under 997px) lists every non-null `WorkflowNode` field, with links to:
  - `reference/workflow-dot#<attribute>` per attribute;
  - `reference/phases#<phase>` for the phase;
  - `reference/gates#<gate>` per gate.
  - The anchors are the shared `{#id}`s, so the same links work in EN and FR.
- **Colours:** Infima CSS variables, plus `colorMode` from `useColorMode()`.

**Source of the DOT, and which copy wins:**
- **Fetched:** `https://raw.githubusercontent.com/SebastienDegodez/skraft-plugin/<ref>/plugins/skraft-framework/workflows/<file>.skraft.dot`.
  - `<ref>` comes from `customFields.workflowRefs[activeVersion.name]`: `current` → `integration/v2-next` (owner decision), `2.x` → `v2.0.0`.
- **Bundled:** `eng/docs/workflow-copies.mjs` writes `static/workflows/<version>/<file>.skraft.dot`.
  - `current` comes from the working tree; `2.x` from `git show v2.0.0:<path>`, so the fallback matches the version's ref.
- **The fetched copy wins** when it returns 200 within 4 s, is under 256 kB, and `readWorkflow` returns `ok: true`. The owner asked for the live workflow, and the engine reader guarantees it is read the engine's way.
- **Otherwise the bundled copy renders.** That covers offline, rate limits, a timeout and a newer DOT the bundled reader refuses.
- **The source is always shown under the diagram:** "Live from GitHub `<ref>`" or "Copy built with this page (`<ref>`): live fetch failed (<reason code>)". The reason is a fixed code, never an exception text.

**SSR:** `<BrowserOnly fallback={<StaticFallback/>}>` around a `React.lazy` import of the viewer.
- `StaticFallback` shows a link to the DOT file and "Loading the workflow…".
- The SSR build never imports React Flow or dagre.

**Placement** (these pages become `.mdx`, EN and FR):
- `reference/workflow-dot`: both workflows, vertical default;
- `explanation/pipeline/index`: pipeline;
- `how-to/eject-workflow`: pipeline, with the review switch.

**Tests:**
- `tests/tooling/workflow-viewer/flow-model.test.mjs`, on the **shipped** DOT files read through `readWorkflow`:
  - every engine node appears;
  - `design_review` holds the lenses `consistency`, `architecture-compliance` and `fitness`;
  - `gates` and `mutation` carry `locked`;
  - every edge label is kept;
  - the call node targets `review`;
  - both directions give non-overlapping node boxes.
- `tests/site/workflow-viewer.spec.mjs`: renders; toggles direction; keyboard Enter opens the panel with the agent of `design`; with `page.route('**/raw.githubusercontent.com/**', r => r.abort())` it renders the bundled copy and shows the fallback notice.

---

## 2. Readability design

### 2.1 Information architecture

- **Navbar (left):**
  - Tutorials · How-to guides · Explanation · Reference, the four Diátaxis doors.
  - Each opens its own sidebar, so the left column only lists that part, instead of today's single sidebar with all 61 pages.
- **Navbar (right):** search, version dropdown (with the v1 archive entries), language dropdown, GitHub.
- **Footer:** the Catalogue dashboard, the presentation deck, Changelog, Glossary, Citations, v1 archive, and "For executives".
- **Home** (`docs/index.mdx`, `slug: /`, about 250 words; today's `index.md` is 896):
  - one-sentence pitch;
  - "Start here": Install → First steps;
  - 4 door cards (title + one line, from the parts' `intro_*`);
  - a static phase strip (the `PhaseRibbon` component, no current phase);
  - links to the roadmap section and the "For executives" page.
  - The roadmap section moves to `reference/changelog` (`#roadmap`), and `docs/roadmap.md` and `docs/conventions.md` are updated.
- **Part and section index pages:** `generated-index` pages with card lists (title + description from front matter), driven by `book.yml` (`intro_*`). No hand-written index files.
- **Proposed how-to sections** (`book.yml`):
  - Set up: install-on-a-host, configure-components, choose-models, migrate-from-v1
  - Run a story: run-gates, resume-a-run, answer-a-question, publish-pull-request
  - Review: review-a-pull-request, customise-review
  - Adapt the workflow: eject-workflow, add-repository-agent
  - Backlog: prd-to-backlog, refine-backlog
  - Existing code: characterize-legacy, refactor-legacy
  - Contribute: evaluate-a-skill, contributing
- **Explanation and Reference** keep their 7 and 6 existing sections.
- **Sidebar behaviour:** hideable, auto-collapsing categories. Built-in prev/next pagination replaces `doc-pager`.

### 2.2 Page conventions per Diátaxis mode

Applies to new and converted pages. `lint-nav` checks the mechanical parts; the docs lenses judge the rest.

**Every page:**
- Front matter: `title` and `description`. `description` is the card text and the search snippet; at most 160 characters.
- The intro blockquote becomes a **lead paragraph**: the first paragraph after the H1, styled at 1.15rem. No blockquote.
- At most one H1. H2s carry the shared `{#id}`s.
- **"Next steps"** (H2, 2–3 links) closes tutorials and how-tos. **"See also"** closes reference and explanation pages.

| Mode | Budget (prose words) | Shape |
|---|---|---|
| Tutorial | ≤ 1,500 | Lead = what you will have built. `:::info[Before you start]` (≤ 5 bullets). One H2 per step, each ending on a visible result (a terminal block or a screenshot). "What you built", then Next steps. One host per tutorial: no Tabs, a tutorial is one path that always works. |
| How-to | ≤ 800 | Lead = the goal in one sentence. "Prerequisites" (≤ 5 bullets). Numbered steps. Host differences in `<Tabs groupId="host" queryString="host">` (Claude Code / Copilot CLI / VS Code), so a reader sets the host once and `?host=` carries it across pages. "Troubleshooting" with one H3 per symptom. |
| Explanation | ≤ 1,500 | Lead = the question answered. Why, then how. At most one diagram per H2. Jargon defined inline or in `:::note[Jargon]`. No steps. Citations through Bibliography anchors. |
| Reference | ≤ 2,500 per page | Lead = what it describes. One link to the explanation page that gives the why. Tables and console blocks. TOC levels 2–3. Above budget, the page becomes a category with sub-pages, and the overview page keeps the old H2 IDs with one-line "moved to" links (Q4). |

Current pages over budget, from the measurements above:
- reference: cli, run-journal, skraft-config, workflow-dot, hosts, gates;
- explanation: domain-driven-design, token-economy, reading-a-verdict, for-executives;
- how-to: publish-pull-request (1,547 words, about twice the budget).

Admonitions use the built-in keywords with bracket titles only (`:::note[Title]`):
- `note`: aside; `tip`: shortcut; `info`: context and the running example; `warning`: something that loses work; `danger`: an irreversible action; `caution`: not verified on a host.
- Mapping of today's markers:

| Today | Becomes |
|---|---|
| fil-rouge `<div>` (7 per locale) | `:::info[☕ Running example — Starbucks (illustrative)]` (FR label taken from its `<span>`) |
| "Decision" | `:::note[Decision]` |
| "Jargon" | `:::note[Jargon]` |
| "Genesis" | `:::info[Genesis]` |
| "Not verified on V2" | `:::caution[Not verified on V2]` |
| reading-a-verdict question | stays a blockquote (it is a quotation) |

### 2.3 Theme

- **Approach:** CSS variables only, in `src/css/custom.css`. No swizzle for styling.
- **Palette:** a calm blue on neutral surfaces, replacing the black, white and green. Contrast ratios computed with the WCAG formula (scratchpad `inv/pal.mjs`).

| Token | Light | Dark | Contrast |
|---|---|---|---|
| `--ifm-background-color` | `#ffffff` | `#16191f` | — |
| surface (`--ifm-background-surface-color`, code, cards) | `#f6f8fa` | `#1e222a` | — |
| `--ifm-font-color-base` | `#1f2328` | `#e6edf3` | 15.80 / 14.90 |
| secondary text (`--ifm-color-emphasis-700`) | `#59636e` | `#9198a1` | 6.11 / 6.04 |
| `--ifm-color-primary` (links, active) | `#2b59c3` | `#7aa7ff` | on bg 6.33 / 7.38; on surface 5.94 / 6.68 |
| text on primary (buttons) | `#ffffff` on `#2b59c3` | `#16191f` on `#7aa7ff` | 6.33 / 7.38 |
| terminal (both modes) | bg `#16181d`, text `#d7dae0`, muted `#8b929c`, prompt `#7cc4ff`, ok `#4fc27a` | same | 12.68 / 5.66 / 9.47 / 7.89 |

- **Primary shades:** the 7 `--ifm-color-primary-*` shades per mode come from the official generator on https://docusaurus.io/docs/styling-layout. I did not compute them here.
- **Warnings:** the warning admonition text must be re-checked; `#9a6700` on `#fff8c5` gives 4.52, at the AA edge, so use a darker text.
- **Contrast test:** `tests/tooling/docs-theme/contrast.test.mjs` parses `custom.css`. It asserts ≥ 4.5:1 for every text/background pair above and each admonition's text/background, in both `[data-theme]` blocks.
- **Typography:**
  - system UI stack (Infima default, no web font: fastest load and full French glyphs);
  - `--ifm-font-size-base: 106.25%` (17px); `--ifm-line-height-base: 1.7`;
  - prose measure `72ch` on `.theme-doc-markdown :is(p, li, blockquote)`, while tables, diagrams, terminals and the viewer keep the full column;
  - `--ifm-heading-font-weight: 650`; H2 at 1.5rem with more space above;
  - links underlined in prose (`text-underline-offset: 0.15em`), so they do not rely on colour alone;
  - monospace `ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`; `--ifm-code-font-size: 90%`.
- **Colour mode:** `respectPrefersColorScheme: true`, default light. Mermaid uses `neutral` in light mode and `dark` in dark mode.
- **Images in both modes:**
  - the CSS rules `[data-theme=dark] img[src$="#gh-light-mode-only"] { display: none }` and the reverse, so plain Markdown images can be themed in `.md` pages;
  - single-theme captures (all canvas captures) sit in a `figure` frame with a 1px border and radius, which reads in both modes.
- **Image zoom:** `docusaurus-plugin-image-zoom` 3.0.1, kept only if WP0 D6 shows it working on 3.10.2 with `v4: true`. Otherwise images link to their full-size file.

### 2.4 What replaces each Jekyll include and layout

| Jekyll | Docusaurus |
|---|---|
| `_layouts/default.html`, `doc.html`, `splash.html` | theme-classic layout; the root splash is removed (EN at the root) |
| `site-nav.html`, `_data/nav.yml` | `themeConfig.navbar` + `i18n/fr/docusaurus-theme-classic/navbar.json` |
| `handbook-sidebar.html`, `sidebar-toggle.html` | `sidebars.js` from `book.yml`; `docs.sidebar.hideable` |
| `lang-toggle.html` | `localeDropdown` |
| `version-picker.html`, `assets/js/version-picker.js`, `eng/docs/inject-switcher.mjs` | `docsVersionDropdown` + `dropdownItemsAfter` (v1); static banner in the archive |
| `doc-pager.html` | built-in pagination (follows the sidebar) |
| `mermaid.html` | `@docusaurus/theme-mermaid` |
| `phase-ribbon.html` | front matter `phase: <name>` + `PhaseRibbon` rendered by the `MDXContent` wrapper (pages stay `.md`) |
| fil-rouge `<div>` | `:::info[…]` admonition |
| `citation.html`, citations page loop | `plugins/skraft-data` global data + `<Bibliography/>` in `reference/citations.mdx`. Entries render with `id="cite-<key>"` and call `useBrokenLinks().collectAnchor` so `onBrokenAnchors` sees them |
| `dashboard.html` + `dashboard-content.html` | static `static/dashboard/index.html` (§2.6) |
| `assets/css/*` | `src/css/custom.css` (tokens §2.3). `design-tokens.css` is retired; `plugins/skraft-backlog/PRODUCT.md` and `.impeccable/design.json` that cite it are updated to the new file |

### 2.5 macOS terminal look

**Decision:** a **`CodeBlock` wrap** (safe in theme-classic 3.10.2), triggered by the fence language `console`. Fence form: ` ```console title="checkout" `.

Why not an MDX `<Terminal>` component:
- A component forces `.mdx` and an import on about 40 pages, and those pages lose CommonMark simplicity.
- The fence works in `.md` (format detect).
- GitHub renders ` ```console ` as a shell session when someone reads the source.
- The copy behaviour lives in one place.

**Source syntax:**
- `$ ` starts a POSIX command, `PS> ` a PowerShell command, `> ` a command typed in a host prompt (Claude Code or Copilot CLI slash commands; title the block with the host name).
- A trailing `\` continues a command. Every other line is output.

**Rendering** (`src/components/Terminal/`, with the parser in `parse.mjs`):
- a title bar with the three dots (`#ff5f57`, `#febc2e`, `#28c840`, `aria-hidden`) and the `title` (default "Terminal", FR "Terminal");
- prompts muted, commands in the text colour with bash highlighting (prism-react-renderer `Highlight`), output in a softer colour;
- the status words `ok`/`pass` green, `WARN` amber, `FAIL`/`fail` red, using the same table as `eng/docs/terminal-svg.mjs`;
- the card stays dark in both modes, like the existing SVG transcripts; in light mode it gets a 1px border and a soft shadow;
- `role="region"` with an `aria-label` equal to the title.

**Copy button:**
- copies **only the commands**, prompts stripped, continuations joined, one command per line;
- hidden when the block has no command (output-only);
- label EN "Copy commands" / FR "Copier les commandes".

**Mobile:**
- the body scrolls horizontally inside the card (`white-space: pre`, scroll shadow), with the existing word-wrap toggle;
- font size 0.8125rem under 600px; the title truncates; the copy target is at least 44×44 px.

**Parity:** `tests/tooling/docs-terminal/palette-parity.test.mjs` asserts that the CSS terminal colours equal the `COLOURS` in `terminal-svg.mjs`, so the SVG transcripts and the live blocks look the same.

**Converter tagging** of the 129 shell-like fences per locale (EN counts in §0.1):
- **Commands only (≈62):** become `console`, with `$ ` added to each command line. Lines starting with `/` (host slash commands) get `> ` and a host `title`.
- **Command + output (≈16):** become `console`. A command line matches a known executable (`skraft`, `node`, `npm`, `npx`, `git`, `gh`, `claude`, `copilot`, `dotnet`, `vally`, `sh`, `./eng/…`) followed by a space and arguments, **not** by `:`. So `skraft checkout: waiting` stays output.
- **Output only, CLI output** (`skraft …: <status>`, tables that `skraft report` prints): `console` with no prompt; the copy button is hidden.
- **Files, templates, trees and ASCII diagrams (≈51):** unchanged (`text` or their language).
- **Ambiguous blocks** are listed in `--report <json>` with file, line and the reason. The conversion commit resolves each one by hand.

**Tests:**
- `tests/tooling/docs-terminal/parse.test.mjs`: prompts, continuation, PowerShell, host prompt, output-only, the copy text, the title meta.
- `tests/tooling/docs-conversion/fences.test.mjs`: the classifier.
- `tests/site/terminal.spec.mjs`: the clipboard holds only the commands; the button is absent on output-only blocks; dark card in both modes; no page-level horizontal scroll at 375px.

### 2.6 Dashboard, deck and screenshots

**Dashboard:**
- **It stays a static app**, `static/dashboard/index.html` + the existing `app.js` and `styles.css`. It is not rewritten as a React page.
- **Why:**
  - `app.js` (590 lines) is DOM code that runs once, and client-side routing would remount it;
  - `eng/docs/screenshots.mjs` can keep serving it with no Docusaurus build;
  - the liquidjs dependency goes away.
- **Template:** `dashboard-content.html` (45 Liquid tags) becomes plain HTML. Its EN/FR conditionals move into an `app.js` string table, and the language comes from `location.pathname` (`/fr/`).
- **Locales:** `static/` is copied into each locale build, which gives `/dashboard/` and `/fr/dashboard/` (WP0 D4 checks this).
- **Styles:** `styles.css` gets light and dark tokens through `prefers-color-scheme`. `localStorage` is not read: `siteStorageNamespacing` changes the key.
- **Header:** a link back to the handbook.
- **Catalogue page:** `book.yml`'s `dashboard` page becomes the doc `reference/catalogue.md` (EN and FR). It has a lead, one screenshot and an "Open the catalogue" link (`pathname:///dashboard/`), and it gives search and the sidebar an entry.
  - The 27 in-text links per locale to `/en/dashboard/` are rewritten to this doc.
  - `static/en/dashboard/index.html` meta-refreshes to `../../dashboard/`.
- **Build output:** `eng/dashboard/build.mjs` writes to `docs/website/static/dashboard/data/dashboard.json` by default. `eng/dashboard/serve.mjs`, `preview.sh` and `scripts/migrate-plugin-paths.mjs` move to the new path.

**Deck:** `static/skraft-basic-presentation.html` (git mv). It keeps its URL, `/skraft-plugin/skraft-basic-presentation.html`.

**Screenshots:**
- **Move:** `git mv docs/site/assets/screenshots docs/website/static/img/screenshots`. Pages use `![alt](/img/screenshots/<lang>/<file>)`.
- **`eng/docs/screenshots.mjs` changes:**
  - `--out` default becomes `docs/website/static/img/screenshots`;
  - `renderDashboard` (liquidjs) is replaced by serving `docs/website/static/` as-is;
  - `navigation()` (nav.yml) is deleted;
  - a new `--theme light,dark` option: captures whose UI follows `prefers-color-scheme` (today only the dashboard, after WP6) are written as `<name>-light.png` and `<name>-dark.png`, and pages reference them with the `#gh-*-mode-only` fragments. The canvas captures stay single-theme until the canvases gain a light theme (out of scope).
- **CI:** `docs-screenshots.yml` paths are updated to `docs/website/**`.

**Screenshots per page.** "Generated" means new code in `eng/docs/screenshots.mjs` driven by repository fixtures, the same way as today. "Needs a real run" means a host session (Claude Code, Copilot CLI, VS Code or GitHub). Those never block the PR; until they exist, the page shows the `console` terminal look.

| Page | Existing | Add | How |
|---|---|---|---|
| tutorials/getting-started | terminal-init, -doctor, -status-waiting, -status-done, -gates | Claude Code `/plugin install` and the `skraft-pipeline` pane in its host | needs a real run. Meanwhile, `pane-waiting.svg` generated from `drivers/claude-mod/run-view.mjs` `paneRows()` on the tutorial fixture (labelled "pane text") |
| tutorials/first-run-copilot | canvas question/adr/done, workflow-log, report-done | Copilot CLI `/workflows` list; the `skraft_decide` confirm dialog | needs a real run |
| tutorials/first-run-copilot, explanation/event-journal, reference/run-journal | — | canvas **journal** tab with signature states (alpha.36) and **config** tabs (alpha.35) | generated: extend the `pipeline` group |
| tutorials/first-brownfield, how-to/prd-to-backlog, how-to/refine-backlog | backlog-canvas progress/review (FR/EN) | backlog canvas: remaining tabs | generated (`backlog` group) |
| tutorials/first-brownfield, how-to/characterize-legacy, how-to/refactor-legacy | — | brownfield refactorer session; `validate-mikado` output | session: needs a real run; script output: generated from the skill script fixture |
| how-to/install-on-a-host | — | Claude Code marketplace install; `copilot plugin install`; VS Code; then `skraft doctor` | install screens: needs a real run; doctor: reuse terminal-doctor |
| how-to/configure-components | — | `skraft init`, `skraft init --add <folder>` | generated (terminal group) |
| how-to/run-gates | terminal-gates | `skraft gate` with a FAIL and mutation survivors | generated (tutorial fixture with a surviving mutant) |
| how-to/resume-a-run | — | `skraft status` blocked, `skraft next` | generated |
| how-to/answer-a-question | — | `skraft decide …` output; canvas question (reuse); Claude Code dialog | decide: generated; dialog: needs a real run |
| how-to/choose-models | — | doctor model table (reuse); canvas agent models (reuse canvas-adr) | reuse |
| how-to/customise-review, eject-workflow, add-repository-agent | — | `skraft workflow eject`, `check`, `diff` outputs | generated. The workflow itself is the live `WorkflowViewer` |
| how-to/review-a-pull-request, publish-pull-request | — | `skraft review --pr` output; the PR and its review comment on GitHub | needs a real run |
| how-to/migrate-from-v1 | — | `skraft migrate --dry-run` | generated from a v1 working-copy fixture (reuse the migration tests' fixture) |
| how-to/evaluate-a-skill, explanation/deep-dive/reading-a-verdict | dashboard-catalogue, -quality; replay ×3 | dashboard light/dark pair | generated after WP6 |
| explanation/pipeline/index, reference/phases | — | none (live `WorkflowViewer`); canvas-done (reuse) | reuse |
| explanation/token-economy | — | `skraft report` (reuse terminal-report-done) | reuse |
| reference/hosts | — | pane, canvas, VS Code side by side | pane and VS Code: needs a real run; canvas: reuse |
| reference/cli | — | none (live `console` blocks) | — |

---

## 3. Content conversion

**Script:** `eng/docs/convert-jekyll.mjs`. Plain Node with `node:path` and `node:fs`, no dependency; YAML through `eng/lib/yaml-parser.mjs`.
- `node eng/docs/convert-jekyll.mjs --src <site-root> --dest docs/website [--locale en|fr|all] [--report report.json] [--check] [--heading-ids comment|classic]`.
- **Idempotent:** running it on its own output changes nothing. A test asserts this.
- `--check` exits 1 when any Liquid (`{{`, `{%`, `relative_url`), any `{#id}` (in comment mode) or any unescaped JSX hazard in an `.mdx` file remains.

**Rules, in order:**
1. **Front matter:** drop `layout`, `lang` and `permalink` (the permalink is written to the redirect list), keep `title`, `description` and `persona`, and add `phase: <x>` where a phase-ribbon include existed.
2. **Citation links:** remove `{% assign cites = … %}`, and rewrite `{{ cites }}#cite-<key>` to the relative path of `reference/citations.mdx` + `#cite-<key>`.
3. **Internal links:** `{{ "/<lang>/<p>" | relative_url }}` with an optional `#anchor` becomes a **relative file link** to the target file (`.md` or `.mdx`; `/<p>/` resolves to `<p>/index.md`).
   - `/en/dashboard/` and `/dashboard/` go to `reference/catalogue.md`;
   - `/assets/screenshots/<l>/<f>` goes to `/img/screenshots/<l>/<f>`;
   - `/skraft-basic-presentation.html` goes to `pathname:///skraft-basic-presentation.html`.
4. **Includes:** `{% include phase-ribbon.html current="x" %}` is removed (it became `phase` in rule 1).
5. **Running example:** the fil-rouge `<div … markdown="1">` / `<span class="fil-rouge__label">L</span>` … `</div>` becomes `:::info[L]` … `:::`, with `<em>` turned into `*…*` inside the label.
6. **Raw blocks:** `{% raw %}` and `{% endraw %}` are removed.
7. **Citations page:** `reference/citations.md` becomes `citations.mdx` with a lead and `<Bibliography/>`, a special case in the script.
8. **Heading IDs:** `## T {#id}` becomes `## T <!-- #id -->` (`.md`) or `## T {/* #id */}` (`.mdx`). With `--heading-ids classic`, they stay as they are and `mdx1Compat.headingIds: true` is set instead (WP0 D2).
9. **Intro and labelled blockquotes:** the first blockquote right after the H1 becomes the lead paragraph. The 4 labelled blockquotes become the admonitions mapped in §2.2.
10. **Code fences:** classified as in §2.5, with ambiguous ones written to the report.
11. **Placeholders:** `<word>` in prose outside code spans becomes `&lt;word&gt;`. This is valid in both CommonMark and MDX; today kramdown's raw-HTML passthrough may already swallow some of them.
12. **Braces:** in files that become `.mdx`, `{` and `}` in prose are escaped (`\{`). That is 32 occurrences in 4 EN files, today all in `.md`-only pages.
13. **Extension:** `.mdx` only when a page needs JSX: Tabs, `<WorkflowViewer>`, `<Bibliography/>`, the home cards. Everything else stays `.md`. `lint-nav` enforces this.

**Commits:**
- **First, moves only:**
  - `git mv docs/site/en/<p> docs/website/docs/<p>`;
  - `git mv docs/site/fr/<p> docs/website/i18n/fr/docusaurus-plugin-content-docs/current/<p>`.
  - A move-only commit lets git follow the history.
- **Then, the conversion:** the converter's output plus the hand resolutions from the report.

**Tests:** `tests/tooling/docs-conversion/`:
- `convert-jekyll.test.mjs`: one before/after fixture per rule under `fixtures/`, plus the idempotence test;
- `fences.test.mjs`;
- `real-pages.test.mjs`: converts a temp copy of 3 real pages, `explanation/pipeline/design.md`, `reference/cli.md` and `how-to/answer-a-question.md`, from `git show HEAD:docs/site/en/…`, and asserts `--check` passes.

---

## 4. Tooling impact (every reference found)

Found with `git grep -l "docs/site"` plus a grep for `jekyll|_site|relative_url|citations.yml|book.yml|version-picker|versions.json|eng/docs|github.io`.

| File | What happens |
|---|---|
| `docs/site/**` | pages and assets: `git mv` into `docs/website/` (WP1, WP6). `_includes/`, `_layouts/`, `assets/css`, `assets/js`, `index.html`, `Gemfile(.lock)`, `_config.yml`: deleted in WP10. `docs/site/` becomes a 2-file Jekyll stub until the final PR (§1.6) |
| `docs/site/_data/book.yml`, `citations.yml`, `personas.yml` | `git mv` to `docs/website/book.yml` and `docs/website/data/`; `nav.yml` deleted (WP0) |
| `scripts/lib/book.mjs` | adapt: new default path, `doc` ids, `pageFiles()` (WP2) |
| `scripts/scan-drift.mjs` | adapt: `--book docs/website/book.yml`, `--site-root docs/website`, EN/FR parity between `docs/` and `i18n/fr/…/current/`, `.md`/`.mdx`, dashboard page → `reference/catalogue`, `retire` paths (WP2) |
| `scripts/lint-nav.mjs` | adapt: `NAV-LINK-NO-BASEURL` becomes `NAV-LINK-ABSOLUTE` (internal links are relative file links; no `/en/`, `/fr/` or Liquid). Add: every doc declared in `book.yml`; `.mdx` only when JSX is present; front matter `description` ≤ 160 characters (WP2) |
| `scripts/check-citations.mjs` | adapt: citations path; cite link pattern `…/reference/citations.mdx#cite-<key>`; both locales (WP2) |
| `scripts/migrate-plugin-paths.mjs` | `docs/site/dashboard/data/` → `docs/website/static/dashboard/data/` (WP6) |
| `scripts/migrate-adr-layout.mjs` | skip list: add `build`, `.docusaurus`; keep `_site`, `.jekyll-cache` while the stub exists (WP10) |
| `scripts/local-ci.mjs` | add docs steps: `node --test tests/tooling/docs-*/ tests/tooling/workflow-viewer/`, `npm run docs:check`; `--docs` runs the full build + Playwright site suite (WP7) |
| `package.json` (root) | scripts: `docs:install` (`npm ci --prefix docs/website`), `docs:start`, `docs:start:fr`, `docs:build`, `docs:serve`, `docs:convert`, `docs:check` (lint-nav + scan-drift + citations + `book-translations --check`); `lint:citations` paths; drop `liquidjs`; add `@axe-core/playwright` 4.14.0 (WP7, WP10) |
| `playwright.config.mjs` | `webServer`: `npm run docs:build && npm run docs:serve -- --port 4000 --no-open`; base URL unchanged (WP7) |
| `eng/docs/plan.mjs`, `eng/docs/versions.mjs`, `eng/docs/inject-switcher.mjs` | delete (WP7). Replaced by `eng/docs/archive-banner.mjs` (static banner), `eng/docs/check-build.mjs` and `eng/docs/workflow-copies.mjs` |
| `eng/docs/screenshots.mjs` | adapt (§2.6, WP6) |
| `eng/docs/terminal-svg.mjs` | keep; its colours become the shared terminal palette (parity test) |
| `eng/dashboard/build.mjs`, `serve.mjs`, `preview.sh` | default output and root paths → `docs/website/static/dashboard/` (WP6) |
| `eng/lib/pr-comment.mjs` | `DOCS` constant: keep the base URL; check every path it builds (`/en/…` → `/…`) (WP8) |
| `eng/host-probe/README.md` | link to the architecture page → `docs/website/docs/explanation/architecture.md` (WP8) |
| `.github/workflows/pages-deploy.yml` | rewrite (§1.5, WP7) |
| `.github/workflows/site-ci.yml` | replaced by `.github/workflows/docs-website.yml` (WP7): job `checks` (Ubuntu + Windows + macOS matrix: `node --test` docs tooling, `npm run docs:check`); job `build` (Ubuntu: dashboard data, `docs:build`, `check-build`, upload artifact `docs-website-build`); job `e2e` (Playwright on the built artifact: smoke, nav, agent button, terminal, viewer, search EN/FR, axe). Triggers: `pull_request` and `push` to `integration/v2-next` with paths `docs/website/**`, `scripts/{scan-drift,lint-nav,check-citations}.mjs`, `scripts/lib/book.mjs`, `eng/docs/**`, `eng/dashboard/**`, `tests/site/**`, `tests/tooling/docs-*/**`, `tests/tooling/workflow-viewer/**`, `plugins/skraft-framework/workflows/**`, `plugins/skraft-framework/engine/domain/workflow/**` |
| `.github/workflows/docs-tag.yml` | delete: no per-patch versions (WP7; takes effect on `main` at 2.0.0) |
| `.github/workflows/docs-screenshots.yml` | paths `docs/site/**` → `docs/website/**`; capture command unchanged (WP6) |
| `.github/workflows/release.yml` | `paths-ignore`: `docs/site/**` → `docs/website/**` (keep `docs/**/*.md`) (WP7) |
| `.github/workflows/skill-evaluation.yml` | `'!eng/docs/**'` stays; no change |
| `.github/workflows/skraft-docs-sync.md`, `skraft-docs-gaps.md` (+ `.lock.yml`) | paths, link syntax (relative file links, no Liquid), FR/EN locations, `doc` ids; recompile with `gh aw compile skraft-docs-sync` and `gh aw compile skraft-docs-gaps`, never hand-edit hashes (WP8) |
| `.github/agents/skraft-docs-{orchestrator,derived-writer,editorial-writer,reviewer,placement-architect,glossary-keeper,citation-fidelity-lens}.agent.md` | paths and link syntax (`relative_url` rules → relative file links); `structure-lens` NAV5 rule rewritten; `diataxis-lens` and `parity-lens` have no path but get the new page conventions (§2.2) where they judge them (WP8) |
| `.github/instructions/skraft-handbook-content.instructions.md`, `skraft-handbook-agent-chains.instructions.md` | same as the agents, plus the per-mode budgets, Tabs-per-host, terminal fence syntax and admonition table (WP8) |
| `tests/agents/skraft-docs-orchestrator/{eval.yaml,README.md,fixtures/*/docs/site/**}` | fixture trees `git mv` to the new layout; `eval.yaml` path references updated (48 occurrences). No new tests for the spec (AGENTS.md). Not re-run: Vally is paused, so mark it "not verified" (WP8) |
| `tests/site/smoke.spec.mjs`, `handbook-nav.spec.mjs`, `dashboard.spec.mjs` | rewrite for the Docusaurus DOM (WP10) |
| `tests/site/version-picker.{spec,harness,harness.test}.mjs`, `tests/dashboard/version-picker.unit.test.mjs`, `tests/dashboard/doc-versions.unit.test.mjs` | delete with what they test (WP7). `archive-banner.mjs` gets `tests/tooling/docs-archive/banner.test.mjs` |
| `tests/site/check-citations.test.mjs` + `fixtures/` | adapt to the new link pattern (WP2) |
| `tests/tooling/documentation/scan-drift-order.test.mjs` | adapt fixture paths to `docs/website` (WP2) |
| `tests/tooling/documentation/terminal-svg.test.mjs` | keep |
| `tests/tooling/plugin-packaging/release-rules.test.mjs` | asserts `docs/site/**` in release paths → `docs/website/**` (WP7) |
| `.gitignore` | `docs/site/_site/`, `.jekyll-cache` stay while the stub exists; add the `docs/website` entries (§1.1) (WP0) |
| `AGENTS.md` | repository map (`docs/website/`), architecture link (line 10), commands (`docs:*`) (WP8) |
| `README.md`, `docs/README.md`, `docs/conventions.md`, `docs/roadmap.md` | paths and URLs (`/en/…` → `/…`, `/fr/#roadmap` → new anchor), the conventions table rows on pages, dashboard and language (WP8) |
| `plugins/skraft-framework/README.md` | 15 handbook URLs `…/skraft-plugin/en/<p>` → `…/skraft-plugin/<p>`. The `/en/` redirects keep installed copies working (WP8) |
| `plugins/skraft-framework/MAINTAINING.md` | relative links into `docs/site/en/...` → `docs/website/docs/...` (WP8) |
| `plugins/skraft-backlog/PRODUCT.md`, `plugins/skraft-backlog/.impeccable/design.json` | brand reference `docs/site/assets/css/design-tokens.css` → `docs/website/src/css/custom.css` (WP8) |
| `CHANGELOG.md` | historical; untouched |

---

## 5. Work packages on branch `docs/docusaurus` (one PR to `integration/v2-next`)

**Conventions for every package:**
- Conventional commits, one concern each. Scopes: `docs` for content, `docs-site` for site code, `ci`, `test`, `build`.
- Commits end with the attribution line from the session.
- `git mv` for moves; tests never under `plugins/`; Node with `node:path` and argv arrays (no shell strings); no model names anywhere.
- `docs:` commits never release; the final PR body says `Refs #<tracking issue>`.
- Each cloud subagent works on its own branch from the tip of `docs/docusaurus`, touches only the files its package owns, and the coordinator merges it back in the order below.
- **Hot files** are touched by WP0 only: `docs/website/package.json`, `docusaurus.config.js`, `sidebars.js`. WP0 adds every dependency the later packages need:

```
@docusaurus/core, preset-classic, theme-mermaid, faster, plugin-client-redirects, module-type-aliases, types   3.10.2
react / react-dom ^19   @mdx-js/react ^3   prism-react-renderer ^2.4.1   clsx ^2.1.1
@easyops-cn/docusaurus-search-local 0.55.3   @xyflow/react 12.12.0   @dagrejs/dagre 3.1.3
docusaurus-plugin-image-zoom 3.0.1 (removed if D6 fails)
```

- A later package that needs a config change states the exact diff in its handback, and the coordinator applies it.

**Verification commands every package runs locally, besides its own:**
```
npm ci && npm ci --prefix docs/website
node --test "tests/tooling/docs-*/**/*.test.mjs" "tests/tooling/workflow-viewer/**/*.test.mjs"
npm run docs:check
npm run docs:build            # all locales; onBroken* = throw
```

### WP0: Spike that proves the stack (sequential, first, blocks everything)

**Scope:**
- **Scaffold:** `docs/website/` from the 3.10.2 classic template with docs-only mode.
- **Data moves:** `git mv` of `book.yml`, `citations.yml` and `personas.yml`; delete `nav.yml` usage.
- **Config:** the config of §1.2, and `sidebars.js` reading the **current** `book.yml` schema (paths mapped to ids by stripping `fr/` and `en/`; WP2 migrates the schema).
- **Hand-converted pages** (2 per Diátaxis mode, EN + FR, plus home):
  - tutorials/getting-started and first-run-copilot (console blocks, terminal SVGs, canvas captures);
  - how-to/install-on-a-host (Tabs `groupId="host"` + `queryString`) and run-gates;
  - explanation/pipeline/index (mermaid, running example, generated index) and pipeline/design (`phase`, citation links);
  - reference/cli (long page, console, anchors) and reference/citations (`<Bibliography/>`).
  - Moved with `git mv`; every other page is excluded through `book.yml` until WP1.
- **Components:** minimal `Terminal` (CodeBlock wrap), `MDXContent` wrap with an empty `DocPageHeader`, `PhaseRibbon`, `Bibliography`, the `skraft-data` plugin, and draft tokens in `custom.css`.
- **Jekyll stub:** `docs/site/` becomes the stub (`_config.yml` + `index.md`). All other `docs/site` content stays in place until WP1 moves it.
- **CI:** `docs-website.yml` (checks + build + artifact upload; e2e added in WP10).

**Decisions the spike records in its handback** (each with evidence: command + output):
- **D1 · `.md` CommonMark mode:** admonitions, mermaid, tables, raw `&lt;` entities and heading-ID comments must render in `.md`. If CommonMark mode fails on any of them, every page becomes `.mdx` and the converter escapes everything.
- **D2 · Heading IDs:** native comment IDs (`<!-- #id -->` in `.md`, `{/* #id */}` in `.mdx`) or `mdx1Compat.headingIds: true` with `{#id}`. The shared FR/EN anchor `#install` must resolve in both locales.
- **D3 · Versions:** in a scratch copy, outside git, run `npx docusaurus docs:version 2.x`, then copy FR into `version-2.x`, then build.
  - Root = 2.x and `/next/` = current, in both locales;
  - the dropdown lists `next`, `2.x`, `1.15 (archived)` and `All v1 versions`, and the archived links keep the baseUrl;
  - the banner on `next`;
  - search scoped per version and locale;
  - `check-build.mjs` passes on that build.
  - Nothing from this test is committed.
- **D4 · Static copy per locale:** `static/` must be copied under `build/fr/`.
- **D5 · Redirects:** `createRedirects` produces `/en/<p>` → `/<p>` for EN routes only.
- **D6 · Image zoom:** `docusaurus-plugin-image-zoom` must work with `future.v4`; drop it if not.
- **D7 · `docSidebar` navbar items:** must land on the part's generated-index page and follow the active version; else switch to `index.mdx` per part.
- **D8 · Terminal wrap props:** the CodeBlock wrap must receive `className="language-console"` and the `metastring` in `.md` and `.mdx`.
- **D9 · Windows and macOS:** `npm ci --prefix docs/website` and `npm run docs:build` must work (the search plugin's `@node-rs/jieba` prebuilt binaries). Run on Windows by the `checks` matrix job or by a developer.
- **D10 · Measurements:** build time for both locales; main JS of a doc page (gzip); axe on 1 page per mode per locale per theme.

**Done when:**
- the preview artifact builds in CI with 0 broken links or anchors;
- D1–D10 are answered;
- the coordinator has opened the artifact and seen both locales and both themes;
- `node --test tests/tooling/docs-sidebars/` passes. Its test covers `sidebarsFromBook` on a 2-part fixture (categories, keys, generated-index slugs and descriptions).

**Verify:**
```
npm run docs:build
npm run docs:serve
npm run docs:start:fr
```

### WP1: Converter, then the bulk conversion (sequential within; after WP0)

- **WP1a:** `eng/docs/convert-jekyll.mjs` + `tests/tooling/docs-conversion/**`, test first, one rule at a time.
  - Done when every §3 rule has a fixture test, the idempotence test passes, and `real-pages.test.mjs` passes.
- **WP1b:** the moves commit (`git mv` of every remaining page, both locales, plus `static/` assets), then the conversion commit (script output plus hand resolutions of the `--report` list).
  - Done when `node eng/docs/convert-jekyll.mjs --check` exits 0, `npm run docs:build` passes with `throw` on every broken link, anchor, Markdown link and image, and a spot check shows 5 pages per locale identical in content to the Jekyll ones.
- **Owns:** `eng/docs/convert-jekyll.mjs`, `tests/tooling/docs-conversion/`, `docs/website/docs/**`, `docs/website/i18n/fr/docusaurus-plugin-content-docs/current/**`, `docs/website/static/img/**`.

### WP2: `book.yml` schema, sidebars, translations and the drift tooling (parallel with WP1; merge after WP1b)

- Implement §1.3:
  - `doc` ids, part `slug`s, section `intro_*`, how-to sections;
  - `sidebars-from-book.mjs` final;
  - `scripts/book-translations.mjs [--check]` and its committed `current.json`.
- Adapt `scripts/lib/book.mjs`, `scan-drift.mjs`, `lint-nav.mjs` (new rules, §4) and `check-citations.mjs`.
- Tests:
  - `tests/tooling/docs-sidebars/`, `tests/tooling/docs-translations/`;
  - update `tests/tooling/documentation/scan-drift-order.test.mjs` and `tests/site/check-citations.test.mjs`;
  - add `tests/tooling/documentation/lint-nav.test.mjs` for the new link rule and the declared-doc rule.
  - Red first: break one rule by hand and see the test fail.
- **Done when** `npm run docs:check` passes on the converted tree, every new check has been seen failing, and the build passes.
- **Owns:** `docs/website/book.yml`, `docs/website/src/book/`, `docs/website/scripts/`, `docs/website/i18n/fr/docusaurus-plugin-content-docs/current.json`, `scripts/lib/book.mjs`, `scripts/{scan-drift,lint-nav,check-citations}.mjs`, and their tests.

### WP3: Theme and readability components (parallel; after WP0)

- **Theme:** the final `custom.css` tokens (§2.3), including the 7 primary shades from the official generator and the admonition palette; `tests/tooling/docs-theme/contrast.test.mjs`.
- **Terminal:** final version (§2.5) + `parse.test.mjs` + `palette-parity.test.mjs`.
- **Page parts:** `PhaseRibbon` final; the home page `docs/index.mdx` and its FR twin (§2.1); navbar, footer and `code.json` FR strings.
- **Images:** the themed-image CSS and the figure frame.
- **Done when:**
  - the contrast and parity tests pass;
  - axe reports 0 serious or critical issues on home, one page per mode, both locales, both themes (run through `tests/site/a11y.spec.mjs`, added here);
  - no page-level horizontal scroll at 375px on the 9 spike pages.
- **Owns:** `docs/website/src/css/`, `src/components/{Terminal,PhaseRibbon}/`, `src/theme/CodeBlock/`, `docs/website/docs/index.mdx` + FR twin, `docs/website/i18n/fr/{code.json,docusaurus-theme-classic/}`, `tests/tooling/docs-theme/`, `tests/tooling/docs-terminal/`, `tests/site/a11y.spec.mjs`.

### WP4: Agent button, Markdown twins and llms files (parallel; after WP0)

- Build §1.8: the `plugins/markdown-twin/` plugin (with `transform.mjs`), `PageActions` and the `DocPageHeader` slot fill.
- Tests: `tests/tooling/docs-markdown-twin/**`, `tests/site/agent-button.spec.mjs`.
- **Done when:**
  - every doc has a twin in both locales;
  - `llms.txt` and `llms-full.txt` exist per locale (and per version in the D3 scratch build);
  - the Playwright spec passes in Chromium;
  - a twin opened from the button starts with `# <title>`.
- **Owns:** `docs/website/plugins/markdown-twin/`, `src/components/PageActions/`, `src/theme/MDXContent/` (header slot), `tests/tooling/docs-markdown-twin/`, `tests/site/agent-button.spec.mjs`.

### WP5: Workflow viewer (parallel; after WP0; embedding after WP1b)

- **First commit:** the `engine-domain` alias plugin, plus a throwaway page proving that Rspack bundles `readWorkflow` in the client build. It stops the package early if this fails.
- **Then** build §1.9:
  - `flow-model.mjs` (test first, on the shipped DOT files);
  - the viewer (React Flow + dagre), side panel, toolbar and fallback;
  - `eng/docs/workflow-copies.mjs` (+ `tests/tooling/workflow-viewer/workflow-copies.test.mjs` on a temp git repo);
  - `tests/site/workflow-viewer.spec.mjs`.
- **Embedding commit**, after WP1b: rename the three pages to `.mdx` (EN + FR) and place `<WorkflowViewer file="pipeline" />` and `<WorkflowViewer file="review" />`.
- **Done when:**
  - every engine node of `pipeline.skraft.dot` and `review.skraft.dot` is drawn;
  - both layouts fit the bounded viewport with no page scroll trap;
  - the keyboard path opens the panel;
  - the fallback renders with the network blocked;
  - the SSR build does not include `@xyflow/react` in the server bundle (check `build/` assets).
- **Owns:** `docs/website/plugins/engine-domain/`, `src/components/WorkflowViewer/`, `eng/docs/workflow-copies.mjs`, `tests/tooling/workflow-viewer/`, `tests/site/workflow-viewer.spec.mjs`, and (embedding) the three pages.

### WP6: Dashboard, deck and screenshots (parallel; after WP0; page edits after WP1b)

- **Dashboard and deck:** §2.6.
  - Static dashboard: `git mv docs/site/dashboard/{app.js,styles.css}`, new `index.html`, the i18n string table, light and dark styles.
  - `reference/catalogue.md` (EN/FR) and the `static/en/dashboard/` refresh page.
  - `eng/dashboard/*` paths.
  - Deck `git mv`.
- **Screenshots:**
  - `eng/docs/screenshots.mjs` rework: `--theme`, no liquidjs;
  - the **generated** captures of the §2.6 table;
  - `docs-screenshots.yml` paths;
  - `scripts/migrate-plugin-paths.mjs`.
- **Done when:**
  - `npm run docs:screenshots` writes every capture under 250 KB on macOS and in CI;
  - `/dashboard/` and `/fr/dashboard/` work in the built site, both themes;
  - `tests/site/dashboard.spec.mjs` is adapted and passes;
  - the "needs a real run" list is in the PR body as a checklist.
- **Owns:** `docs/website/static/{dashboard,en,skraft-basic-presentation.html}`, `static/img/screenshots/**`, `eng/dashboard/**`, `eng/docs/screenshots.mjs`, `.github/workflows/docs-screenshots.yml`, `scripts/migrate-plugin-paths.mjs`, `docs/website/docs/reference/catalogue.md` + FR, `tests/site/dashboard.spec.mjs`.

### WP7: CI, deploy and the v1 archive (parallel; after WP0)

- **Workflows:**
  - `docs-website.yml` final (matrix `checks` on ubuntu/windows/macos, `build`, artifact);
  - `pages-deploy.yml` rewrite (§1.5);
  - `docs-archive-v1.yml` + `eng/docs/archive-banner.mjs` (+ test);
  - `eng/docs/check-build.mjs` (+ test on a fake tree);
  - delete `docs-tag.yml`, `site-ci.yml`, `plan.mjs`, `versions.mjs`, `inject-switcher.mjs` and their tests;
  - `release.yml` `paths-ignore` + `release-rules.test.mjs`.
- **Local tooling:** `playwright.config.mjs`, root `package.json` `docs:*` scripts, `scripts/local-ci.mjs` docs steps.
- **Done when:**
  - the archive workflow has run once on a fork or with `--dry-run` (writes the tarball as a workflow artifact without creating the release), and its output opens locally with the banner;
  - `check-build.mjs` passes on the WP0 D3 scratch build and fails when `fr/index.html` is removed;
  - `node --test tests/tooling/plugin-packaging/release-rules.test.mjs` passes;
  - `docs-website.yml` is green on the branch.
- **The real `gh release create docs-archive-v1` is not run in this PR.** It is a pre-merge step of the final PR (§6).
- **Owns:** `.github/workflows/{docs-website,pages-deploy,docs-archive-v1,docs-tag,site-ci,release}.yml`, `eng/docs/{archive-banner,check-build,plan,versions,inject-switcher}.mjs`, `playwright.config.mjs`, `package.json`, `scripts/local-ci.mjs`, `tests/tooling/docs-archive/`, `tests/tooling/plugin-packaging/release-rules.test.mjs`, and the deleted version tests.

### WP8: Docs agents, gh-aw workflows and the docs that point at the site (after WP1b + WP2)

- **Every row of §4 marked WP8:**
  - `.github/agents/skraft-docs-*`, `.github/instructions/*`;
  - the gh-aw `.md` sources + `gh aw compile skraft-docs-sync` and `gh aw compile skraft-docs-gaps`, committing the regenerated `.lock.yml`;
  - eval fixtures `git mv` + `eval.yaml` paths;
  - `AGENTS.md`, `README.md`, `docs/README.md`, `docs/conventions.md`, `docs/roadmap.md`;
  - `plugins/skraft-framework/{README,MAINTAINING}.md`, `plugins/skraft-backlog/{PRODUCT.md,.impeccable/design.json}`;
  - `eng/lib/pr-comment.mjs`, `eng/host-probe/README.md`.
- **If the cloud session has no `gh aw`** (`gh extension install github/gh-aw` fails), it stops after editing the `.md` sources, and the coordinator compiles locally.
- **Done when:**
  - `git grep -n "docs/site"` lists only the stub, `CHANGELOG.md` and `scripts/migrate-adr-layout.mjs`'s skip list;
  - `git grep -n "relative_url"` outside the stub is empty;
  - `gh aw compile` reports no diff after the commit;
  - `npm run plugin:check` passes (the plugin README is not an agent descriptor, but run it anyway);
  - the Vally docs-orchestrator suite is marked not verified (paused).

### WP9: Readability pass (after WP1b, WP2, WP3; WP5 for the viewer pages; 4 parallel subagents, one per part, each EN + FR)

- **Structural changes only.** Prose cuts follow Q4.
  - Lead paragraphs, "Next steps" and "See also" sections.
  - Host Tabs in how-to/install-on-a-host, answer-a-question and resume-a-run (the pages become `.mdx`).
  - The how-to sections from `book.yml`.
  - Admonition mapping checked.
  - Placeholder captions for "needs a real run" screenshots: a `console` block plus `:::note[Screenshot pending a real run]`.
- **Reference pages over budget:** split only if Q4 says yes. A split keeps the old H2 IDs on the overview page.
- **Done when:**
  - `lint-nav` (word budgets reported as warnings, `description` length as errors) is clean;
  - the docs lenses' checks (diataxis, parity, structure) pass on a dry run if available; otherwise mark them "not verified".
- **Owns:** per part, `docs/website/docs/<part>/**` + the FR twin. Only the how-to subagent edits `book.yml` (sections).

### WP10: Hardening and the Jekyll removal (sequential, last)

- **Playwright suite:** `tests/site/{smoke,handbook-nav}.spec.mjs` rewritten (navbar doors, sidebar per part, locale switch keeps the path, version dropdown entries, search returns a FR page for a FR query, `/en/how-to/run-gates` redirects); `e2e` job added to `docs-website.yml`.
- **Remove Jekyll:** `_includes`, `_layouts`, `assets/css`, `assets/js`, `index.html`, `Gemfile*`; keep the 2-file stub.
- **Root `package.json`:** drop `liquidjs`.
- **Final sweep:**
  - `git grep -nE "relative_url|\{\{ *\"/(en|fr)/|_includes|jekyll"` (stub excepted);
  - `node scripts/local-ci.mjs --docs`;
  - `npm run test:tooling`;
  - Windows/macOS tooling run (CI matrix).
- **Done when:** the whole local CI passes, the docs-website workflow is green (checks, build, e2e), and the PR body lists what each check examined and what was not verified.

**Parallelism summary:**
- WP0 runs alone.
- WP1 and WP2 run in parallel; merge WP1b first, then WP2 rebases.
- WP3, WP4, WP5 (code), WP6 (code) and WP7 run in parallel with WP1 and WP2; their file sets are disjoint.
- After WP1b + WP2: WP5's embedding commit, WP6's page edits and WP8 run in parallel.
- After WP3 (and WP5 for its pages): the WP9 subagents ×4 run in parallel.
- WP10 runs last.

---

## 6. At 2.0.0: the final PR `integration/v2-next` → `main` (outside this PR, checklist)

1. Run `docs-archive-v1.yml` for real, check the release asset, and pin its sha256 in `pages-deploy.yml`.
2. Cut 2.x in a docs commit:
   - `npm run docusaurus --prefix docs/website -- docs:version 2.x`;
   - copy `i18n/fr/docusaurus-plugin-content-docs/current` to `version-2.x`, plus `version-2.x.json` from `book-translations.mjs`;
   - set `SKRAFT_DOCS_EDIT_BRANCH=main` in the deploy env;
   - `customFields.workflowRefs` follows Q5.
3. Delete the `docs/site` stub and `docs-archive-v1.yml`.
4. After the merge, `pages-deploy` on `main` publishes:
   - 2.x at `/` and `/fr/`;
   - next at `/next/` and `/fr/next/`;
   - `/v1.11.0/` … `/v1.15.3/` + `/v1/`;
   - `/dashboard/`.
   - `/v2-next/` and `/v2.0.0-alpha.*/` disappear (open question Q3 for redirects).
5. `curl -I …/how-to/run-gates.md` records the served `Content-Type` (§1.8, not verified).

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| CommonMark mode is "experimental" | WP0 D1; fallback all-`.mdx` with converter escaping (the converter already knows which files would need it) |
| `{#id}` removal under `v4` breaks the shared FR/EN anchors | WP0 D2; `onBrokenAnchors: 'throw'` catches any miss at build |
| Rspack cannot bundle the engine domain from outside `siteDir` | first commit of WP5 proves it; fallback: `flow-model.mjs` consumes a JSON the build writes by running `readWorkflow` in Node (`workflow-copies.mjs`), same engine function, no client import |
| Swizzle wraps break on a minor update | only wraps marked **safe** in `getSwizzleConfig.ts` 3.10.2 (`CodeBlock`, `MDXContent`); exact versions pinned |
| Search plugin native dependency on Windows | WP0 D9 on the CI matrix; fallback `@cmfcmf/docusaurus-search-local` 2.0.1 (versions and i18n; last publish 2025-10) |
| Archive asset deleted or altered | sha256 pinned in `pages-deploy.yml`; the deploy fails loudly instead of publishing without v1 |
| Content doubles at the cut (`versioned_docs`) and drifts | tooling and agents target `current` only; errata on 2.x edit both trees in one commit (rule in `docs/conventions.md`) |
| One huge PR is hard to review | move-only commits separated from transform commits; a mechanical conversion commit generated by a tested script; readability edits in their own commits per part |
| Cloud subagents edit shared files concurrently | hot files reserved to WP0 and the coordinator; disjoint "Owns" lists |
| Static screenshots shared by versions | accepted; versioned captures are a later choice |
| Docs agents and the gh-aw workflows keep writing Jekyll syntax until WP8 lands | WP8 runs right after WP1b/WP2, before WP9; the gh-aw workflows only run on `main` triggers in practice (verify their `on:` before merging) |

---

## 8. Open questions for the owner (genuine)

1. **Q1 · `next` after 2.0.0.** semantic-release cuts a release on every merge to `main`, so `next` (main's `docs/`) and the `2.x` snapshot will usually describe the same released code. Each doc change then has to be written twice, or `2.x` ages.
   - Keep the decided model, with errata applied to both trees? Or serve `current` labelled `2.x` at the root (`lastVersion: 'current'`) and create `next` only when a 3.0 line exists?
   - The Docusaurus docs recommend `lastVersion: 'current'` for a "constantly patched and released" version.
2. **Q2 · Hosted preview before 2.0.0.** It is possible only by changing `main`'s `pages-deploy.yml` (the v1 line): build `docs/website` from `integration/v2-next` under, say, `/next-preview/`.
   - Allow that one change on `main`, or keep artifact and local previews only?
3. **Q3 · Old V2 preview URLs.** Today's `/v2-next/` and `/v2.0.0-alpha.37/` disappear at 2.0.0. Add redirect pages to the matching `/next/` pages, or let them 404?
   - Related: archive all 9 v1 trees at their current URLs (proposed), or only `v1.15.3`?
4. **Q4 · Readability scope in this PR.**
   - Structural changes are planned: IA, Tabs, leads, sections, terminal, viewer.
   - Should this PR also split the 6 reference pages over 2,500 words into sub-pages, and cut prose to the per-mode budgets (about 15 pages over budget, FR + EN)? Or should that be one follow-up PR per Diátaxis part?
5. **Q5 · Workflow viewer ref for `2.x`.** The owner said the `v2.0.0` tag. After 2.1 ships, the 2.x docs would still draw the 2.0.0 workflow. Pin `v2.0.0`, follow the latest `v2.*` tag (resolved at build), or use `main`?

---

## 9. Sources

- **Docusaurus releases:** https://docusaurus.io/blog/releases/3.8 · https://docusaurus.io/blog/releases/3.9 · https://docusaurus.io/blog/releases/3.10 (Faster stable as `future.faster`; v4 sub-flags; React 19; recommended native MDX syntax over `{#id}`)
- **Config and docs mode:** https://docusaurus.io/docs/api/docusaurus-config (`future`, `markdown.*`, `onBroken*`, `i18n.localeConfigs`) · https://docusaurus.io/docs/docs-introduction#docs-only-mode
- **Versioning and i18n:** https://docusaurus.io/docs/versioning (fewer than 10 versions, archived versions as external links, `docs:version` output) · https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-docs (`versions`, `lastVersion`, `onlyIncludeVersions`, `editUrl` function, `showLastUpdateTime` needs full history) · https://docusaurus.io/docs/i18n/tutorial and https://docusaurus.io/docs/i18n/introduction (layout, `write-translations`, one SPA per locale, dev single locale, slugs untranslated)
- **Theme:** https://docusaurus.io/docs/api/themes/configuration (`docsVersionDropdown.dropdownItemsAfter`, `colorMode`, `docs.sidebar.hideable/autoCollapseCategories`, `tableOfContents`) · https://docusaurus.io/docs/styling-layout (Infima 7 shades, WCAG AA, `ThemeClassNames`) · https://docusaurus.io/docs/swizzling (CSS first, prefer wrapping, smallest component) · `@docusaurus/theme-classic@3.10.2` `src/getSwizzleConfig.ts` (safe wraps: CodeBlock, MDXContent, MDXComponents/Pre, DocCardList, DocSidebar)
- **Markdown features:** https://docusaurus.io/docs/markdown-features (format detect, CommonMark experimental) · https://github.com/facebook/docusaurus/issues/9092 (CommonMark limits) · https://docusaurus.io/docs/markdown-features/toc (heading ID syntaxes, `write-heading-ids`) · https://docusaurus.io/docs/markdown-features/admonitions · https://docusaurus.io/docs/markdown-features/tabs (`groupId`, `queryString`) · https://docusaurus.io/docs/markdown-features/diagrams (theme-mermaid, `mermaid.theme`) · https://docusaurus.io/docs/markdown-features/assets (GitHub-style themed images, `ThemedImage`, `/img` from `static`) · https://docusaurus.io/docs/markdown-features/code-blocks (`title`, `additionalLanguages`; no console language documented)
- **Sidebars:** https://docusaurus.io/docs/sidebar/items and https://docusaurus.io/docs/sidebar/autogenerated (category `link`, `generated-index`, `key`, `customProps`)
- **Plugins:** https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-sitemap (`lastmod`, `ignorePatterns`)
- **Search:** https://docusaurus.io/docs/search · https://docusaurus.io/community/resources#search · https://docsearch.algolia.com/docs/who-can-apply
- **llms.txt:** https://github.com/facebook/docusaurus/issues/10899 (no native llms.txt) · README of `docusaurus-markdown-source-plugin` 2.4.0 (npm tarball: twins, `link rel=alternate`, Root DOM injection, provider rows) · README of `docusaurus-plugin-llms` 0.6.1 (llms.txt, llms-full.txt, `generateMarkdownFiles`, multi-version)
- **Deploy:** https://docusaurus.io/docs/deployment#triggering-deployment-with-github-actions (Pages artifact workflow, `trailingSlash`) · https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages (artifact format; no explicit "replace" sentence found) · https://github.com/actions/upload-pages-artifact (`include-hidden-files` false by default)
- **npm metadata** (`npm view … version time.modified peerDependencies`, 2026-10-30): every package and version named in §0.3 and §5
- **Repo measurements:** commands quoted in §0.1; scratchpad scripts `inv/scan.mjs`, `inv/fences.mjs`, `inv/pal.mjs`

## 10. Addendum — coordination with the animated figures work (issue #367 thread)

Agreed on https://github.com/SebastienDegodez/skraft-plugin/issues/367#issuecomment-6533097150 and the reply below it.

- Another session ships animated per-scenario figures: a pure ES core (`render()`/`animate()`, `<skraft-flow>` custom element), a React adapter `eng/docs/flow/adapters/docusaurus/FlowFigure.jsx`, data `docs/flows/deliver.json` generated from `pipeline.skraft.dot` by `eng/docs/flow-from-dot.mjs`, and a self-contained `flow-figure.css`. Its PR is expected on `integration/v2-next` before ours; we rebase on it.
- `docs/flows/` and `eng/docs/flow/` stay OUTSIDE `docs/website/`. Never copy them. WP0 adds `configureWebpack` aliases `@skraft/flow` → `eng/docs/flow` and `@skraft/flows` → `docs/flows` (same mechanism as the `engine-domain` alias of WP5), and `src/components/FlowFigure/index.js` re-exports the adapter, passing `lang` from `useDocusaurusContext().i18n.currentLocale`. `custom.css` imports `flow-figure.css`.
- WP1b: in `explanation/pipeline/deliver` (EN and FR, the page becomes `.mdx`), the Jekyll include of the figure becomes `<FlowFigure flow="deliver" />`. If the figures PR has not landed when WP1b runs, keep a `:::note` placeholder and leave the swap to whichever lands second.
- The figures follow the new theme tokens (Infima variables, light and dark), not the old green palette; asked on the issue.
- The version picker of #405 is not ported (native `docsVersionDropdown`, see §1.4/§1.5).

## 11. WP0 handback (decisions D1–D10)

Measured on 2026-10-31 on `docs/docusaurus` at `8cc5480e` (Linux x64, 2 vCPU, Node 22.23.4, Docusaurus 3.10.2, Chromium through Playwright). Probes that were not committed ran on a scratch copy of `docs/website` outside git (its build needs `future.experimental_vcs: false` there: "This Docusaurus site is outside any Git worktree"). Three defects were fixed on the way (§11.1).

- **D1 · `.md` CommonMark mode — keep `.md`.**
  - Probe pages `probe-md.md` / `probe-mdx.mdx`, EN and FR, built with `npx docusaurus build`.
  - Admonitions: `:::note[Jargon]` and `:::warning` give `theme-admonition-note`/`-warning` with the title.
  - Tables: render. `&lt;a&gt; -&gt; &lt;b&gt; with &lt;slug&gt;` in a table cell comes out as `<td>&lt;a> -> &lt;b> with &lt;slug>`. Bare `{ x }` in `.md` prose stays text.
  - Mermaid: Playwright counted `.docusaurus-mermaid-container svg` = 1 on `/tutorials/probe-md`, `/tutorials/probe-mdx` and `/fr/tutorials/probe-md`.
  - Heading-ID comments: see D2. The real `.md` pages `explanation/pipeline/index.md` and `design.md` already use `:::` admonitions.
  - Only the bracket title form works (`mdx1Compat` is off under `v4`): the converter writes `:::note[Title]`, never `:::note Title`.
- **D2 · Heading IDs — native comments, no `mdx1Compat`.**
  - `## Install the thing <!-- #install -->` (`.md`) and `{/* #install */}` (`.mdx`) both give `<h2 … id=install>`, in EN and FR.
  - Links to `#install` across the two files resolve in both locales.
  - The real shared anchors resolve too: `#skraft-command` in `how-to/install-on-a-host.html` and `fr/…`, and `#skraft-install` in `reference/cli.html` and `fr/…`. No comment text leaks (`grep -c '<!-- #\|{/\*'` = 0).
  - Negative check: with the FR `{/* #install */}` removed, `npx docusaurus build --locale fr` exits 1 with "Docusaurus found broken anchors! … linking to /skraft-plugin/tutorials/probe-mdx#install".
- **D3 · Versions — pass, with two fixes and a cut checklist.**
  - Procedure on the scratch copy: `npx docusaurus docs:version 2.x` ("version 2.x created!"), then copy `i18n/fr/…/current` to `version-2.x` and `current.json` to `version-2.x.json`, then build (exit 0).
  - Routes: `/`, `/next`, `/fr/`, `/fr/next` and `…/tutorials/getting-started` under each answer 200.
  - Navbar parts follow the version: `/skraft-plugin/next/tutorials` … on `/next/`, `/skraft-plugin/fr/next/…` on `/fr/next/`.
  - The dropdown lists `next`, `2.x`, `1.15 (archived)` and `All v1 versions`. EN links keep the base URL (`/skraft-plugin/v1.15.3/`). FR links were `/skraft-plugin/fr/skraft-plugin/v1.15.3/` (**fixed**, §11.1).
  - Banner: on `/next/` only ("This is unreleased documentation for skraft next version."); badge "Version: 2.x" at the root.
  - Search is scoped per version and locale. The `next` index first held 0 pages (**fixed**, §11.1). After the fix, `search?q=gates` returns:
    - 8 pages under `/skraft-plugin/{how-to,reference,…}`;
    - `&version=next/`: 8 pages under `/skraft-plugin/next`;
    - FR: 7 pages under `/skraft-plugin/fr/…`, and 7 under `/skraft-plugin/fr/next` for `next`.
  - `/next/` keeps `noindex` and stays out of `sitemap.xml` (0 matches).
  - `check-build.mjs` does not exist yet (WP7). WP7 must run it on its own scratch cut.
  - **Cut checklist** (final PR):
    1. Copying `current.json` carries `version.label` "Aperçu 2.0", so FR showed "Aperçu 2.0" for both versions. Set `version-2.x.json` → "2.x" and `current.json` → "next".
    2. The temporary `remark-pending-links` only knows `docs/` and `i18n/fr/…/current/`. A cut before WP1b fails with "Markdown link … couldn't be resolved"; WP1b deletes the plugin first.
- **D4 · Static copy per locale — pass.** `diff <(cd build && find img -type f | sort) <(cd build/fr && find img -type f | sort)` is empty, so `static/` is copied whole into `build/fr/`.
- **D5 · Redirects — pass.**
  - `build/en/` holds 137 redirect files (pages, `.html` twins, directory indexes). `build/fr/en` does not exist, and there is no `en/next` or `en/search*`.
  - `en/how-to/run-gates.html` → `location.replace("/skraft-plugin/how-to/run-gates"+location.search+location.hash)`. Covered by `tests/tooling/docs-redirects`.
- **D6 · Image zoom — keep `docusaurus-plugin-image-zoom`.**
  - On `/tutorials/getting-started`, 5 of 5 content images carry `medium-zoom-image`.
  - A click opens `.medium-zoom-overlay` with `body.medium-zoom--opened`, in light (`rgba(255, 255, 255, 0.92)`) and dark (`rgba(22, 25, 31, 0.92)`). No console errors.
- **D7 · `docSidebar` navbar items — keep them, no `index.mdx` per part.**
  - Clicking Tutorials / How-to guides / Explanation / Reference lands on `/skraft-plugin/{tutorials,how-to,explanation,reference}`, each a generated-index page. FR uses `/skraft-plugin/fr/…`.
  - On `/next/` they point to `/skraft-plugin/next/…` (D3).
- **D8 · Terminal wrap props — pass.** A scratch probe in the `CodeBlock` wrap rendered `data-probe-class=language-console data-probe-meta='title="Probe terminal"'` from both `.md` and `.mdx`, EN and FR (`title="Terminal sonde"`).
- **D9 · Windows and macOS — pass (CI).**
  - Here: Linux only. `npm ci --prefix docs/website` took 26 s and installed `@node-rs/jieba-linux-x64-gnu`. The lockfile pins the `win32-x64-msvc`, `darwin-arm64` and `darwin-x64` prebuilds.
  - Windows and macOS: workflow `docs-website.yml`, job `checks`, run 41237377313 on `8cc5480e`.
    - `checks (windows-latest)`, `checks (macos-latest)`, `checks (ubuntu-latest)` and `build` all succeeded.
    - Install took 45–79 s; the build of both locales took 12–23 s.
- **D10 · Measurements.**
  - **Build of both locales (`npm run docs:build`):**
    - CI: 12 s (`build`), 16 s (ubuntu), 17 s (macOS), 23 s (Windows).
    - Here: 19 s with a warm cache; 43–88 s cold or while a browser and other servers shared the 2 vCPU.
  - **Doc page JS (`how-to/run-gates`, gzip -9):**
    - up front: `runtime~main` 3.1 kB + `main` 187.0 kB = 190 kB;
    - all JS fetched after load: 19 files, 228 kB.
  - **axe 4.14.0** (`wcag2a/aa`, `wcag21a/aa`, `wcag22aa`), 4 modes × 2 locales × 2 themes, on `tutorials/getting-started`, `how-to/run-gates`, `explanation/pipeline` and `reference/cli`. EN and FR give identical results.

    | Page | Light | Dark |
    |---|---|---|
    | getting-started | 45 contrast nodes | 0 |
    | run-gates | 1 | 0 |
    | pipeline | 1 | 6 |
    | cli | 1 + `scrollable-region-focusable` | `scrollable-region-focusable` |

  - **Causes, all for WP3:**
    - The search shortcut `<kbd>` is #bec3c9 on #ebedf0, 1.51:1, on every light page.
    - Prism `github` tokens on #f6f8fa: #36acaa 2.58:1, #e3116c 4.32:1, #d73a49 4.29:1, in JSON blocks.
    - Mermaid `dark` edge labels are #cccccc on #585858, 4.43:1.
    - A wide table in `reference/cli` scrolls without keyboard focus.

### 11.1 Fixes committed with this handback

- `a42befe6 fix(docs-site): keep the v1 archive links off the French base URL`
  - **Cause:** `pathname://` links get the locale base URL.
  - **Fix:** the v1 archive becomes a raw HTML item; the catalogue and deck links become `pathname:///<path>` (one copy per locale, §2.6).
  - **Test:** `tests/tooling/docs-links/`.
- `ac284ab9 fix(docs-site): index the noIndex next preview for its own search`
  - **Fix:** `forceIgnoreNoIndex: true`.
- `800a864e fix(docs-site): a directory index is a copy of its page, not a redirect`
  - **Cause:** `docusaurus serve` answers `/explanation/pipeline` with `explanation/pipeline/index.html`, so the redirect index reloaded itself (122–146 navigations in 3 s).
  - **Pages affected:** the four part landings in both locales, and `explanation/pipeline`.
  - **Test:** `tests/tooling/docs-redirects` (seen failing against the old code).

### 11.2 For the coordinator

- **GitHub Pages and `/explanation/pipeline`.** It is not measured whether GitHub Pages serves the `.html` file or the folder for this address. The index is now a copy of the page, so both cases render it.
- **"See all results" link.** The search box's link is `…/search/?q=` with a trailing slash. Client-side navigation works. A new tab hits `/search/`, which has no `index.html`. The fix belongs to WP7/WP10: a copy at `search/index.html`, or the e2e suite.
- **Main bundle size.** `main` is 187 kB gzip before any page component. WP3/WP5 should check what mermaid, search and `@xyflow/react` add before setting a budget.
