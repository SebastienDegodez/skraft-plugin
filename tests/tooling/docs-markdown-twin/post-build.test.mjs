import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { writeMarkdownTwins } from '../../../docs/website/plugins/markdown-twin/post-build.mjs'

const SITE = 'https://sebastiendegodez.github.io'
const siteConfig = {
  url: SITE,
  baseUrl: '/skraft-plugin/',
  tagline: 'An AI-agent SDLC pipeline.',
  organizationName: 'SebastienDegodez',
  projectName: 'skraft-plugin',
  customFields: { workflowRefs: { current: 'integration/v2-next', '2.x': 'v2.0.0' } },
}

// Three docs per version: the home (in no sidebar), a how-to and a tutorial. The sidebar lists the
// tutorial part before the how-to part, so the order is the sidebar's, not the docs array's.
const SOURCES = {
  'index.mdx': '---\ntitle: skraft\n---\n\n# skraft\n\nHome body.\n',
  'how-to/run-gates.md': '# Run the gates\n\nSee [first steps](../tutorials/getting-started.md).\n',
  'tutorials/getting-started.md': '# First steps\n\nTutorial body.\n',
}

const sidebars = (tutorials, howTo) => ({
  tutorials: [{ type: 'category', label: tutorials, items: [{ type: 'doc', id: 'tutorials/getting-started' }] }],
  howTo: [{ type: 'category', label: howTo, items: [{ type: 'doc', id: 'how-to/run-gates' }] }],
})

const doc = (contentDir, path, permalink, title, extra = {}) => ({
  title,
  description: `About ${title}.`,
  source: `@site/${contentDir}/${path}`,
  sourceDirName: dirname(path),
  permalink,
  lastUpdatedAt: Date.UTC(2026, 9, 30),
  ...extra,
})

const version = ({ name, label, path, isLast, contentDir, labels }) => ({
  versionName: name,
  label,
  path,
  isLast,
  sidebars: sidebars(...labels),
  docs: [
    doc(contentDir, 'how-to/run-gates.md', `${path.replace(/\/?$/, '/')}how-to/run-gates`, 'Run the gates', {
      id: 'how-to/run-gates',
    }),
    doc(contentDir, 'index.mdx', path.replace(/\/?$/, '/'), 'skraft', { id: 'index' }),
    doc(contentDir, 'tutorials/getting-started.md', `${path.replace(/\/?$/, '/')}tutorials/getting-started`, 'First steps', {
      id: 'tutorials/getting-started',
    }),
  ],
})

const withSite = async (run) => {
  const root = await mkdtemp(join(tmpdir(), 'skraft-twins-'))
  const siteDir = join(root, 'docs', 'website')
  try {
    for (const contentDir of ['docs', 'versioned_docs/version-2.x', 'i18n/fr/docusaurus-plugin-content-docs/current']) {
      for (const [path, text] of Object.entries(SOURCES)) {
        await mkdir(dirname(join(siteDir, contentDir, path)), { recursive: true })
        await writeFile(join(siteDir, contentDir, path), text)
      }
    }
    await run({ root, siteDir, outDir: join(root, 'build') })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const enBuild = ({ siteDir, outDir, root }) => ({
  outDir,
  siteDir,
  repoRoot: root,
  siteConfig,
  baseUrl: '/skraft-plugin/',
  locale: 'en',
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  citations: [],
  versions: [
    version({ name: '2.x', label: '2.x', path: '/skraft-plugin/', isLast: true, contentDir: 'versioned_docs/version-2.x', labels: ['Tutorials', 'How-to guides'] }),
    version({ name: 'current', label: 'next', path: '/skraft-plugin/next', isLast: false, contentDir: 'docs', labels: ['Tutorials', 'How-to guides'] }),
  ],
})

const frBuild = (site) => ({
  ...enBuild(site),
  outDir: join(site.outDir, 'fr'),
  baseUrl: '/skraft-plugin/fr/',
  locale: 'fr',
  versions: [
    version({ name: 'current', label: 'next', path: '/skraft-plugin/fr/next', isLast: false, contentDir: 'i18n/fr/docusaurus-plugin-content-docs/current', labels: ['Tutoriels', 'Guides pratiques'] }),
  ],
})

test('every doc of every version gets its twin under the version root', async () => {
  await withSite(async (site) => {
    await writeMarkdownTwins(enBuild(site))
    await writeMarkdownTwins(frBuild(site))
    for (const twin of ['index.md', 'how-to/run-gates.md', 'tutorials/getting-started.md']) {
      for (const root of ['', 'next', 'fr/next']) assert.ok(existsSync(join(site.outDir, root, twin)), `${root}/${twin}`)
    }
    const nextTwin = await readFile(join(site.outDir, 'next', 'how-to', 'run-gates.md'), 'utf8')
    assert.match(nextTwin, /^# Run the gates\n\n> Source: https:\/\/sebastiendegodez\.github\.io\/skraft-plugin\/next\/how-to\/run-gates · Version next · en · Updated 2026-10-30\n/)
    assert.match(nextTwin, /\[first steps\]\(https:\/\/sebastiendegodez\.github\.io\/skraft-plugin\/next\/tutorials\/getting-started\.md\)/)
  })
})

test('llms.txt lists each part in sidebar order, with absolute twin URLs and descriptions', async () => {
  await withSite(async (site) => {
    await writeMarkdownTwins(enBuild(site))
    const llms = await readFile(join(site.outDir, 'next', 'llms.txt'), 'utf8')
    assert.deepEqual(llms.trim().split('\n'), [
      '# skraft',
      '',
      '> An AI-agent SDLC pipeline.',
      '',
      `- [skraft](${SITE}/skraft-plugin/next/index.md): About skraft.`,
      '',
      '## Tutorials',
      '',
      `- [First steps](${SITE}/skraft-plugin/next/tutorials/getting-started.md): About First steps.`,
      '',
      '## How-to guides',
      '',
      `- [Run the gates](${SITE}/skraft-plugin/next/how-to/run-gates.md): About Run the gates.`,
    ])
  })
})

test('the root llms.txt links the other languages and versions', async () => {
  await withSite(async (site) => {
    await writeMarkdownTwins(enBuild(site))
    const root = await readFile(join(site.outDir, 'llms.txt'), 'utf8')
    assert.match(root, /## Other versions and languages\n\n- \[next\]\(https:\/\/sebastiendegodez\.github\.io\/skraft-plugin\/next\/llms\.txt\)\n- \[fr\]\(https:\/\/sebastiendegodez\.github\.io\/skraft-plugin\/fr\/llms\.txt\)\n/)
  })
})

test('a French build writes its llms files under its locale with its own part labels', async () => {
  await withSite(async (site) => {
    await writeMarkdownTwins(frBuild(site))
    const llms = await readFile(join(site.outDir, 'fr', 'next', 'llms.txt'), 'utf8')
    assert.match(llms, /## Tutoriels\n\n- \[First steps\]\(https:\/\/sebastiendegodez\.github\.io\/skraft-plugin\/fr\/next\/tutorials\/getting-started\.md\)/)
    assert.ok(existsSync(join(site.outDir, 'fr', 'next', 'llms-full.txt')))
  })
})

test('llms-full.txt holds every twin of the version in sidebar order, separated by rules', async () => {
  await withSite(async (site) => {
    await writeMarkdownTwins(enBuild(site))
    const full = await readFile(join(site.outDir, 'llms-full.txt'), 'utf8')
    const parts = full.split('\n\n---\n\n')
    assert.deepEqual(parts.map((part) => part.split('\n')[0]), ['# skraft', '# First steps', '# Run the gates'])
    assert.match(parts[0], /Home body\./)
    assert.match(parts[0], /· Version 2\.x · en · /)
  })
})
