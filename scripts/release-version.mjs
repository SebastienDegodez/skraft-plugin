#!/usr/bin/env node
// Release version bumper — repo-side half of the auto-update chain.
// Computes the next semver from Conventional Commits since the last tag and
// (with --apply) aligns every distribution surface on it:
//   plugins/.claude-plugin/plugin.json   (version SSOT)
//   plugins/src/package.json
//   apm.yml
//   plugins/skraft-framework.config.json (via build-config --apply re-stamp)
//
//   node scripts/release-version.mjs            # print next version or "none"
//   node scripts/release-version.mjs --apply    # rewrite the surfaces, print version
//
// Exit codes: 0 = version computed (or none, informational), 2 = usage/IO error.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { bumpFromCommits, nextVersion } from './lib/semver-bump.mjs'

const apply = process.argv.includes('--apply')

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()

const lastTag = () => {
  try { return git('describe', '--tags', '--abbrev=0', '--match', 'v*') } catch { return null }
}

const commitsSince = (tag) => {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  const raw = git('log', range, '--format=%B%x00')
  return raw.split('\u0000').map((m) => m.trim()).filter(Boolean)
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const writeJson = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n')

const PLUGIN_MANIFEST = 'plugins/.claude-plugin/plugin.json'
const PACKAGE_JSON = 'plugins/src/package.json'
const APM_YML = 'apm.yml'

const current = readJson(PLUGIN_MANIFEST).version
const bump = bumpFromCommits(commitsSince(lastTag()))
const version = nextVersion(current, bump)

if (version === null) {
  process.stdout.write('none\n')
  process.exit(0)
}

if (apply) {
  const manifest = readJson(PLUGIN_MANIFEST)
  manifest.version = version
  writeJson(PLUGIN_MANIFEST, manifest)

  const pkg = readJson(PACKAGE_JSON)
  pkg.version = version
  writeJson(PACKAGE_JSON, pkg)

  const apm = readFileSync(APM_YML, 'utf8')
  writeFileSync(APM_YML, apm.replace(/^version:.*$/m, `version: ${version}`))

  // Re-stamp the generated config provenance with the new generator version.
  const result = spawnSync('node', ['plugins/src/cli/build-config-bin.mjs', '--apply'], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(2)
}

process.stdout.write(`${version}\n`)
