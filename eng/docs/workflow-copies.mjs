#!/usr/bin/env node
// The workflow viewer's fallback: the DOT files of each handbook version, copied into
// docs/website/static/workflows/<version>/ (gitignored). `current` comes from the working tree;
// a released version from `git show <ref>:<path>`, its ref taken from the site's
// customFields.workflowRefs, so the fallback matches what the live fetch would read.
//
//   node eng/docs/workflow-copies.mjs          writes the copies for every version of the site
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WORKFLOWS = 'plugins/skraft-framework/workflows' // a git path: forward slashes on every OS
const isWorkflow = (name) => name.endsWith('.skraft.dot')

const git = (repoRoot, args) => {
  const run = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (run.status !== 0) throw new Error(`workflow-copies: git ${args.join(' ')} failed: ${(run.stderr ?? '').trim()}`)
  return run.stdout
}

const fromWorkingTree = (repoRoot) => {
  const dir = join(repoRoot, ...WORKFLOWS.split('/'))
  return readdirSync(dir).filter(isWorkflow).sort().map((name) => [name, readFileSync(join(dir, name), 'utf8')])
}

const fromRef = (repoRoot, ref) => git(repoRoot, ['ls-tree', '--name-only', `${ref}:${WORKFLOWS}`])
  .split('\n').filter(isWorkflow).sort()
  .map((name) => [name, git(repoRoot, ['show', `${ref}:${WORKFLOWS}/${name}`])])

const filesOf = (repoRoot, version, refs) => {
  if (version === 'current') return fromWorkingTree(repoRoot)
  if (!refs[version]) throw new Error(`workflow-copies: version ${version} has no workflow ref in customFields.workflowRefs`)
  return fromRef(repoRoot, refs[version])
}

/**
 * @param {{ repoRoot: string, staticDir: string, versions: string[], refs: Record<string, string> }} site
 * @returns {Record<string, string[]>} the files written, by version
 */
export const writeWorkflowCopies = ({ repoRoot, staticDir, versions, refs }) => Object.fromEntries(versions.map((version) => {
  const files = filesOf(repoRoot, version, refs)
  const dir = join(staticDir, 'workflows', version)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const [name, text] of files) writeFileSync(join(dir, name), text)
  return [version, files.map(([name]) => name)]
}))

/** The versions a site builds: `current`, then each released one of versions.json. */
export const siteVersions = (siteDir) => {
  const listed = join(siteDir, 'versions.json')
  return ['current', ...(existsSync(listed) ? JSON.parse(readFileSync(listed, 'utf8')) : [])]
}

const main = async () => {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
  const siteDir = join(repoRoot, 'docs', 'website')
  const config = (await import(pathToFileURL(join(siteDir, 'docusaurus.config.mjs')).href)).default
  const written = writeWorkflowCopies({ repoRoot, staticDir: join(siteDir, 'static'), versions: siteVersions(siteDir), refs: config.customFields.workflowRefs })
  for (const [version, files] of Object.entries(written)) console.log(`${version}: ${files.join(', ')}`)
}

// No top-level await: Docusaurus loads this module through jiti (CommonJS) from plugins/engine-domain.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
