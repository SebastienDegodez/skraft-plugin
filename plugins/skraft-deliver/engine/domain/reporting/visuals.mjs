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
 * `{ "screenshots": [{ "title": "…", "theme": "light" | "dark", "path": "skraft-visuals/….png", "scenario": "S2" }] }`,
 * theme being the name of the Playwright project that took it, path relative to the component's root,
 * scenario (optional) the scenario of the test plan it shows.
 *
 * @typedef {import('../config/skraft-config.mjs').Component} Component
 * @typedef {'light' | 'dark'} Theme
 * @typedef {{ title: string, theme: Theme, path: string, scenario?: number, url?: string | null }} Screenshot
 *   title: the alt text, made safe to publish; scenario: the number of the scenario it shows, when
 *   the manifest gives one; path: relative to the component's root, or to the
 *   working copy once kept; url: where the pull request shows it, set once the forge is known:
 *   `./<path>` for a file the forge's client attaches, the file's address at the commit for a
 *   committed one, null when the forge gives none.
 * @typedef {{ ok: true, screenshots: Screenshot[] } | { ok: false, reason: string }} ManifestReading
 * @typedef {{
 *   component: string, command: string | null, e2e: 'passed' | 'failed' | 'not-run', detail: string,
 *   evidence: string | null, screenshots: Screenshot[],
 * }} ComponentVisuals
 *   detail: what became of its screenshots, or why its e2e run did not run or failed; evidence:
 *   the log of its e2e run, relative to the tracking folder; screenshots: those kept on the
 *   working branch, relative to the working copy.
 * @typedef {{ commit: string | null, attached?: boolean, components: ComponentVisuals[] }} Visuals
 *   commit: the commit that holds the kept screenshots, null when none was committed; attached:
 *   the screenshots stay where Playwright wrote them, and the forge's client attaches them to
 *   the pull request (gh).
 */

/** The manifest of an e2e run's screenshots, relative to the component's root. */
export const VISUALS_MANIFEST = 'skraft-visuals/manifest.json'

export const THEMES = Object.freeze(/** @type {Theme[]} */ (['light', 'dark']))

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
  if (wrong >= 0) return { ok: false, reason: `screenshot ${wrong + 1} of ${VISUALS_MANIFEST} needs a title, a theme light or dark, the path of a .png under the component, and a scenario, when it names one, as S<n>` }
  return withoutHash(/** @type {Screenshot[]} */ (screenshots))
}

/**
 * The screenshots, unless a path holds a `#`: gh's `--attach <path>#<alt>` would cut the path there.
 * @param {Screenshot[]} screenshots @returns {ManifestReading}
 */
const withoutHash = (screenshots) => {
  const hashed = screenshots.findIndex(({ path }) => path.includes('#'))
  if (hashed >= 0) return { ok: false, reason: `the path of screenshot ${hashed + 1} of ${VISUALS_MANIFEST} holds a #, which gh reads as the start of its alt text: name the file without one` }
  return { ok: true, screenshots }
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
  const scenario = scenarioOf(entry.scenario)
  if (scenario === null) return null
  return { title, theme: entry.theme, path: normalizeRelative(entry.path), ...(scenario === undefined ? {} : { scenario }) }
}

/** The number of the scenario an entry names, `S<n>`; undefined when it names none, null when it is not one. @param {unknown} named */
const scenarioOf = (named) => {
  if (named === undefined) return undefined
  const found = typeof named === 'string' ? /^S([1-9]\d*)$/i.exec(named) : null
  return found === null ? null : Number(found[1])
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

/** What the Screenshots section says, per language. */
const WORDS = Object.freeze({
  en: Object.freeze({
    none: `None recorded: this run took no screenshots (no visuals step, or no front end in ${CONFIG_FILE}).`,
    noFrontEnd: `None recorded: ${NO_FRONT_END}.`,
    colon: ': ',
    /** @param {string} e2e @param {string} command @param {string} evidence */
    ran: (e2e, command, evidence) => `e2e run ${e2e} (${command}, evidence ${evidence}); `,
    /** @param {string} commit */
    noRepository: (commit) => `The remote names no repository on a forge: each image links its path at commit ${commit}, which the forge does not show.`,
    dark: 'Dark theme',
    /** @param {number} more @param {Theme} theme @param {string} component @param {string} folder */
    more: (more, theme, component, folder) => `${more} more ${theme} screenshot${more === 1 ? '' : 's'} of ${component} in ${folder}`,
  }),
  fr: Object.freeze({
    none: `Aucune consignée : ce run n'a pris aucune capture d'écran (pas d'étape visuals, ou pas de front end dans ${CONFIG_FILE}).`,
    noFrontEnd: `Aucune consignée : aucun composant de ${CONFIG_FILE} n'est un front end (stack react, ou une commande e2e).`,
    colon: ' : ',
    /** @param {string} e2e @param {string} command @param {string} evidence */
    ran: (e2e, command, evidence) => `run e2e ${e2e} (${command}, preuve ${evidence}) ; `,
    /** @param {string} commit */
    noRepository: (commit) => `Le remote ne nomme aucun dépôt sur une forge : chaque image pointe vers son chemin au commit ${commit}, que la forge n'affiche pas.`,
    dark: 'Thème sombre',
    /** @param {number} more @param {Theme} theme @param {string} component @param {string} folder */
    more: (more, theme, component, folder) => `${more} ${more > 1 ? 'autres captures' : 'autre capture'} du thème ${theme === 'dark' ? 'sombre' : 'clair'} de ${component} dans ${folder}`,
  }),
})

/**
 * The Screenshots section of a pull request: what each front end's e2e run gave, then the light
 * screenshots, the dark ones folded below; in the story's language.
 * @param {Visuals | null} visuals @param {import('./language.mjs').Language} language
 */
export const screenshotLines = (visuals, language) => {
  const words = WORDS[language]
  if (visuals === null) return [words.none]
  if (visuals.components.length === 0) return [words.noFrontEnd]
  return [...visuals.components.map((component) => componentLine(component, words)), ...imageLines(visuals, words)]
}

/** @typedef {typeof WORDS.en} Words */

/** @param {ComponentVisuals} visuals @param {Words} words */
const componentLine = ({ component, command, e2e, detail, evidence }, words) => {
  if (command === null) return `- ${component}${words.colon}${detail}`
  return `- ${component}${words.colon}${words.ran(e2e, code(command), code(/** @type {string} */ (evidence)))}${detail}`
}

/** A pull request shows at most this many screenshots of each theme of a component. */
const SHOWN_PER_THEME = 6

/** @param {Visuals} visuals @param {Words} words */
const imageLines = ({ components, commit }, words) => {
  if (components.every(({ screenshots }) => screenshots.length === 0)) return []
  const dark = themeLines(components, 'dark', words)
  return [
    ...(commit !== null && shownScreenshots({ commit, components }).some(({ url }) => !url) ? ['', words.noRepository(code(commit))] : []),
    ...themeLines(components, 'light', words),
    ...(dark.length === 0 ? [] : ['', `<details><summary>${words.dark}</summary>`, ...dark, '', '</details>']),
  ]
}

/**
 * The screenshots of a theme, the first SHOWN_PER_THEME of each component, then where its others are.
 * @param {ComponentVisuals[]} components @param {Theme} theme @param {Words} words
 */
const themeLines = (components, theme, words) => components.flatMap(({ component, screenshots }) => {
  const own = screenshots.filter((screenshot) => screenshot.theme === theme)
  const more = own.length - SHOWN_PER_THEME
  return [
    ...own.slice(0, SHOWN_PER_THEME).flatMap(({ title, path, url }) => ['', `![${title}](${url || encodedPath(path)})`]),
    ...(more > 0 ? ['', words.more(more, theme, component, code(own[0].path.slice(0, own[0].path.lastIndexOf('/'))))] : []),
  ]
})

/**
 * The screenshots a pull request shows: the first SHOWN_PER_THEME of each theme of each component.
 * @param {Visuals} visuals @returns {Screenshot[]}
 */
export const shownScreenshots = ({ components }) => components.flatMap(({ screenshots }) => THEMES.flatMap((theme) => screenshots.filter((screenshot) => screenshot.theme === theme).slice(0, SHOWN_PER_THEME)))

/** A path as a link: each segment encoded. @param {string} path */
const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/')

/**
 * The attachments a body itself refers to, the only ones it is sent with: one a comment of the run
 * details shows goes with that comment, it would be appended to the body.
 * @template {{ reference: string }} T @param {T[]} attachments @param {string} body @returns {T[]}
 */
export const referredIn = (attachments, body) => attachments.filter(({ reference }) => body.includes(`](${reference})`))

/**
 * How a body refers to a screenshot the forge's client attaches, which it rewrites to the uploaded
 * file: from the folder of the body's file, where gh resolves it and is run (`../../../web/a.png`).
 * @param {string} path relative to the working copy @param {string} folder the body file's, relative to the working copy
 */
export const attachedReference = (path, folder) => {
  const from = normalizeRelative(folder).split('/').filter((part) => part !== '.')
  const to = normalizeRelative(path).split('/')
  const shared = sharedLength(from, to)
  return [...from.slice(shared).map(() => '..'), ...to.slice(shared)].join('/')
}

/** How many leading segments two paths share; the file's own name never counts. @param {string[]} folder @param {string[]} path */
const sharedLength = (folder, path) => {
  let shared = 0
  while (shared < folder.length && shared < path.length - 1 && folder[shared] === path[shared]) shared += 1
  return shared
}
