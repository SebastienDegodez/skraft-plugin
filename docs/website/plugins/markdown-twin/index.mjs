import { fileURLToPath } from 'node:url'
import { writeMarkdownTwins } from './post-build.mjs'

// After each locale build: a `.md` twin next to every doc page, and llms.txt / llms-full.txt at the
// root of every version (build/llms.txt, build/next/llms.txt, build/fr/llms.txt, build/fr/next/llms.txt).
// The Agent button (src/components/PageActions) links to the twin.

const DOCS = 'docusaurus-plugin-content-docs'
const SUMMARY = {
  fr: "Un pipeline SDLC d'agents IA : chaque phase est livrée par un agent et revue par un autre.",
}

export default function markdownTwinPlugin(context, options = {}) {
  let versions = []
  let citations = []
  return {
    name: 'skraft-markdown-twin',
    async allContentLoaded({ allContent }) {
      versions = allContent[DOCS]?.default?.loadedVersions ?? []
      citations = allContent['skraft-data']?.default?.citations ?? []
    },
    async postBuild({ outDir, siteConfig, baseUrl }) {
      await writeMarkdownTwins({
        outDir,
        siteDir: context.siteDir,
        repoRoot: options.repoRoot ?? fileURLToPath(new URL('../../../../', import.meta.url)),
        siteConfig,
        baseUrl,
        locale: context.i18n.currentLocale,
        locales: context.i18n.locales,
        defaultLocale: context.i18n.defaultLocale,
        versions,
        citations,
        summary: { ...SUMMARY, ...options.summary },
      })
    },
  }
}
