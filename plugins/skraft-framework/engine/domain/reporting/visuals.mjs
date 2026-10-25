import { normalizeRelative } from '../config/relative-path.mjs'
import { CONFIG_FILE } from '../config/skraft-config.mjs'
import { code } from './markdown-safety.mjs'

/**
 * The screenshots a front end's e2e run leaves: the manifest Playwright writes beside them, the
 * copies kept in the run's evidence folder, and how the pull request shows them, light first and
 * dark folded below.
 *
 * The manifest, at VISUALS_MANIFEST under the component's root, is written by the developer's
 * Playwright reporter once the run ends:
 * `{ "screenshots": [{ "title": "…", "theme": "light" | "dark", "path": "skraft-visuals/….png" }] }`,
 * theme being the name of the Playwright project that took it, path relative to the component's root.
 *
 * @typedef {import('../config/skraft-config.mjs').Component} Component
 * @typedef {'light' | 'dark'} Theme
 * @typedef {{ title: string, theme: Theme, path: string }} Screenshot
 *   title: the alt text, made safe to publish; path: relative to the component's root, or to the
 *   working copy once kept.
 * @typedef {{ ok: true, screenshots: Screenshot[] } | { ok: false, reason: string }} ManifestReading
 * @typedef {{
 *   component: string, command: string | null, e2e: 'passed' | 'failed' | 'not-run', detail: string,
 *   evidence: string | null, screenshots: Screenshot[],
 * }} ComponentVisuals
 *   detail: what became of its screenshots, or why its e2e run did not run or failed; evidence:
 *   the log of its e2e run, relative to the tracking folder; screenshots: those kept on the
 *   working branch, relative to the working copy.
 * @typedef {{ commit: string | null, components: ComponentVisuals[] }} Visuals
 *   commit: the commit that holds the kept screenshots, null when none was kept.
 * @typedef {{ host: string, repository: string } | null} Repository
 *   repository: `<owner>/<repo>`; null when the remote names none.
 */

/** The manifest of an e2e run's screenshots, relative to the component's root. */
export const VISUALS_MANIFEST = 'skraft-visuals/manifest.json'

const THEMES = Object.freeze(/** @type {Theme[]} */ (['light', 'dark']))

/** Why a configuration has no screenshot to take. */
export const NO_FRONT_END = `no component of ${CONFIG_FILE} is a front end (stack react, or an e2e command)`

/** A front end: a React component, or any component that declares an e2e command. @param {Component} component */
export const isFrontend = (component) => component.stack === 'react' || 'e2e' in component.commands

/**
 * The screenshots a manifest lists, or why it lists none a run can keep.
 * @param {string | null} text @returns {ManifestReading}
 */
export const readManifest = (text) => {
  const listed = listedOf(text)
  if (listed === null) return { ok: false, reason: `${VISUALS_MANIFEST} is missing or is not an object with a screenshots list` }
  const screenshots = listed.map(screenshotOf)
  const wrong = screenshots.findIndex((screenshot) => screenshot === null)
  if (wrong >= 0) return { ok: false, reason: `screenshot ${wrong + 1} of ${VISUALS_MANIFEST} needs a title, a theme light or dark, and the path of a .png under the component` }
  return { ok: true, screenshots: /** @type {Screenshot[]} */ (screenshots) }
}

/** @param {string | null} text @returns {unknown[] | null} */
const listedOf = (text) => {
  try {
    const parsed = JSON.parse(String(text))
    return Array.isArray(parsed.screenshots) ? parsed.screenshots : null
  } catch {
    return null
  }
}

/** @param {any} entry @returns {Screenshot | null} */
const screenshotOf = (entry) => {
  const title = typeof entry?.title === 'string' ? altText(entry.title) : ''
  if (title === '' || !THEMES.includes(entry.theme) || !isPngUnder(entry.path)) return null
  return { title, theme: entry.theme, path: normalizeRelative(entry.path) }
}

/** `/x`, `\\server\x`, `C:\x`, `C:/x`. */
const ABSOLUTE = /^(?:[\\/]|[A-Za-z]:)/

/** A .png under the component's root. @param {unknown} path as the manifest writes it */
const isPngUnder = (path) => typeof path === 'string' && /\.png$/i.test(path) && !ABSOLUTE.test(path) && !normalizeRelative(path).split('/').includes('..')

/** An alt text keeps letters, digits, spaces and plain punctuation: no markup, mention or reference survives. @param {string} title */
const altText = (title) => title.replace(/[^\p{L}\p{N} .,:;'’()-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)

/**
 * Where each screenshot is kept: `<evidence>/<component>/<theme>-<rank>.png`, ranked within its theme.
 * @param {string} evidence the story's evidence folder, relative to the working copy
 * @param {Component} component @param {Screenshot[]} screenshots
 */
export const evidenceCopies = (evidence, component, screenshots) => screenshots.map((screenshot) => ({
  from: normalizeRelative(`${component.root}/${screenshot.path}`),
  within: component.root,
  kept: { ...screenshot, path: `${evidence}/${component.name}/${screenshot.theme}-${rankIn(screenshots, screenshot)}.png` },
}))

/** @param {Screenshot[]} screenshots @param {Screenshot} screenshot */
const rankIn = (screenshots, screenshot) => screenshots.filter(({ theme }) => theme === screenshot.theme).indexOf(screenshot) + 1

/**
 * The Screenshots section of a pull request: what each front end's e2e run gave, then the light
 * screenshots, the dark ones folded below.
 * @param {Visuals | null} visuals @param {Repository} repository
 */
export const screenshotLines = (visuals, repository) => {
  if (visuals === null) return ['None recorded: this run took no screenshots (no visuals step, or no front end in skraft-config.json).']
  if (visuals.components.length === 0) return [`None recorded: ${NO_FRONT_END}.`]
  const kept = visuals.components.flatMap(({ screenshots }) => screenshots)
  return [...visuals.components.map(componentLine), ...imageLines(kept, visuals.commit, repository)]
}

/** @param {ComponentVisuals} visuals */
const componentLine = ({ component, command, e2e, detail, evidence }) => {
  if (command === null) return `- ${component}: ${detail}`
  return `- ${component}: e2e run ${e2e} (${code(command)}, evidence ${code(/** @type {string} */ (evidence))}); ${detail}`
}

/** @param {Screenshot[]} kept @param {string | null} commit @param {Repository} repository */
const imageLines = (kept, commit, repository) => {
  if (kept.length === 0) return []
  const image = (/** @type {Screenshot} */ { title, path }) => ['', `![${title}](${urlOf(repository, /** @type {string} */ (commit), path)})`]
  const dark = kept.filter(({ theme }) => theme === 'dark')
  return [
    ...(repository === null ? ['', `The remote names no repository on a forge: each image links its path at commit ${code(/** @type {string} */ (commit))}, which the forge does not show.`] : []),
    ...kept.filter(({ theme }) => theme === 'light').flatMap(image),
    ...(dark.length === 0 ? [] : ['', '<details><summary>Dark theme</summary>', ...dark.flatMap(image), '', '</details>']),
  ]
}

/**
 * A kept screenshot's address at its commit: the forge's raw route, which a private repository
 * serves to a signed-in viewer too; the path alone without a repository.
 * @param {Repository} repository @param {string} commit @param {string} path
 */
const urlOf = (repository, commit, path) => {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return repository === null ? encoded : `https://${repository.host}/${repository.repository}/raw/${commit}/${encoded}`
}
