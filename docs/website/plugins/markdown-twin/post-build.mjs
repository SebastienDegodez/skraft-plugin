import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, posix, relative, sep } from 'node:path'
import { llmsFull, llmsIndex, partsOf, readingOrder } from './llms.mjs'
import { toMarkdownTwin } from './transform.mjs'
import { htmlPathOf, twinPathOf } from './twin-path.mjs'

// Writes, for one locale build, the Markdown twin of every doc and the llms.txt / llms-full.txt of
// every version, all under the build's outDir (which already holds the locale prefix).

const docPathOf = (doc) => posix.join(doc.sourceDirName, basename(doc.source))
const sourceFileOf = (siteDir, doc) => join(siteDir, ...doc.source.replace(/^@site\//, '').split('/'))
const dayOf = (timestamp) => (timestamp ? new Date(timestamp).toISOString().slice(0, 10) : undefined)
const withSlash = (path) => path.replace(/\/?$/, '/')

/** Where a site path lands in this build's outDir: the path without the build's (localized) base URL. */
const outPath = (outDir, baseUrl, sitePath) => join(outDir, ...sitePath.slice(baseUrl.length).split('/').filter(Boolean))

const write = async (file, text) => {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, text)
}

const rawRepoOf = (siteConfig, version) => {
  const ref = siteConfig.customFields?.workflowRefs?.[version.versionName] ?? 'main'
  return `https://raw.githubusercontent.com/${siteConfig.organizationName}/${siteConfig.projectName}/${ref}/`
}

const pageOf = (build, version, twins, doc) => ({
  title: doc.title,
  permalink: htmlPathOf(doc),
  docPath: docPathOf(doc),
  locale: build.locale,
  versionLabel: version.label,
  versionPath: version.path,
  updated: dayOf(doc.lastUpdatedAt),
  siteUrl: build.siteConfig.url,
  baseUrl: build.siteConfig.baseUrl,
  rawRepo: rawRepoOf(build.siteConfig, version),
  sourceRepoPath: relative(build.repoRoot, sourceFileOf(build.siteDir, doc)).split(sep).join('/'),
  twins,
  citations: build.citations,
})

const writeTwin = async (build, version, twins, doc) => {
  const source = await readFile(sourceFileOf(build.siteDir, doc), 'utf8')
  const twin = toMarkdownTwin(source, pageOf(build, version, twins, doc))
  await write(outPath(build.outDir, build.baseUrl, twinPathOf(doc)), twin)
  return twin
}

// The root llms.txt (default locale, last version) links the other versions and the other locales.
const variantsOf = (build, version) => {
  if (build.locale !== build.defaultLocale || !version.isLast) return []
  const { url, baseUrl } = build.siteConfig
  const versions = build.versions.filter((other) => other !== version)
  const locales = build.locales.filter((locale) => locale !== build.locale)
  return [
    ...versions.map((other) => ({ label: other.label, url: `${url}${withSlash(other.path)}llms.txt` })),
    ...locales.map((locale) => ({ label: locale, url: `${url}${baseUrl}${locale}/llms.txt` })),
  ]
}

const writeVersion = async (build, version) => {
  const twins = new Map(version.docs.map((doc) => [docPathOf(doc), twinPathOf(doc)]))
  const parts = partsOf(version.sidebars)
  const ordered = readingOrder(version.docs, parts)
  const texts = []
  for (const doc of ordered) texts.push(await writeTwin(build, version, twins, doc))
  const listed = ordered
    .filter((doc) => !doc.unlisted)
    .map((doc) => ({ ...doc, twinUrl: `${build.siteConfig.url}${twinPathOf(doc)}` }))
  const index = llmsIndex({
    title: build.siteConfig.title ?? 'skraft',
    summary: build.summary?.[build.locale] ?? build.siteConfig.tagline,
    locale: build.locale,
    docs: listed,
    parts,
    variants: variantsOf(build, version),
  })
  const root = outPath(build.outDir, build.baseUrl, withSlash(version.path))
  await write(join(root, 'llms.txt'), index)
  await write(join(root, 'llms-full.txt'), llmsFull(texts))
}

/**
 * @param {object} build outDir, siteDir, repoRoot, siteConfig, baseUrl (of this locale build), locale, locales,
 *   defaultLocale, versions (the docs plugin's loadedVersions), citations, summary ({ [locale]: string }, optional)
 */
export const writeMarkdownTwins = async (build) => {
  for (const version of build.versions) await writeVersion(build, version)
}
