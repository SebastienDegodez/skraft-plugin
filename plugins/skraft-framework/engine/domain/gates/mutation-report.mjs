import { joinRelative } from '../config/relative-path.mjs'

/**
 * The mutants a mutation run left alive, read from the report its tool writes: the
 * mutation-testing-elements JSON of Stryker (.NET, JavaScript, TypeScript, and any tool that
 * writes it), or the `mutations.xml` of PIT (Java).
 *
 * @typedef {import('../config/skraft-config.mjs').Component} Component
 * @typedef {{ file: string, line: number, mutator: string, replacement: string | null, covered: boolean }} Survivor
 *   file: relative to the working copy, or absolute when the report names it so; for PIT, the
 *   class's source file under its package folders. covered: a test ran it and still passed;
 *   false when no test runs that code.
 * @typedef {{ file: string, mutants: string[] }} SurvivorGroup the survivors of one file, each told on one line
 * @typedef {{ ok: true, survivors: Survivor[] } | { ok: false, reason: string }} SurvivorReading
 */

/** Where each stack's mutation tool writes its report, relative to the component root. */
const REPORTS = Object.freeze({
  dotnet: 'StrykerOutput/reports/mutation-report.json',
  typescript: 'reports/mutation/mutation.json',
  javascript: 'reports/mutation/mutation.json',
  react: 'reports/mutation/mutation.json',
  python: 'mutation-report.json',
  java: 'target/pit-reports/mutations.xml',
})

/** Where PIT's Gradle plugin writes its XML report. */
const GRADLE_REPORT = 'build/reports/pitest/mutations.xml'

/**
 * The report a component's mutation command leaves, relative to the component root: the one
 * the developer names, else the one its stack's tool writes.
 * @param {Component} component
 */
export const mutationReportOf = (component) => {
  if (component.mutationReport !== null) return component.mutationReport
  if (component.stack === 'java' && /gradle/.test(component.commands.mutation ?? '')) return GRADLE_REPORT
  return REPORTS[component.stack]
}

/**
 * The survivors a report names, each file relative to the working copy.
 * @param {string} text the report's content
 * @param {{ report: string, root: string }} where the report's path and the component's root
 * @returns {SurvivorReading}
 */
export const readSurvivors = (text, { report, root }) => (report.endsWith('.xml') ? pitSurvivors(text, root) : strykerSurvivors(text, root))

/** Stryker's statuses that count against the score, with whether a test ran the mutant. */
const STRYKER_ALIVE = Object.freeze({ Survived: true, NoCoverage: false })

/** @param {string} text @param {string} root @returns {SurvivorReading} */
const strykerSurvivors = (text, root) => {
  const report = parseJson(text)
  if (!isStrykerReport(report)) return { ok: false, reason: 'is not a mutation-testing-elements report' }
  const projectRoot = typeof report.projectRoot === 'string' ? slashed(report.projectRoot) : null
  return { ok: true, survivors: Object.entries(report.files).flatMap(([name, file]) => strykerFile(reportedFile(name, projectRoot, root), file.mutants)) }
}

/** @param {string} text @returns {unknown} undefined when the text is not JSON */
const parseJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** @param {any} report @returns {report is { projectRoot?: unknown, files: Record<string, { mutants: any[] }> }} */
const isStrykerReport = (report) => isRecord(report) && isRecord(report.files) && Object.values(report.files).every((file) => isRecord(file) && Array.isArray(file.mutants))

/** @param {unknown} value @returns {value is Record<string, any>} */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** @param {string} path */
const slashed = (path) => path.replaceAll('\\', '/').replace(/\/$/, '')

/**
 * A file the report names, relative to the working copy: under the report's project root, it
 * is relative to the component; an absolute path outside it stays as written.
 * @param {string} name @param {string | null} projectRoot @param {string} root
 */
const reportedFile = (name, projectRoot, root) => {
  const file = slashed(name)
  const inner = projectRoot !== null && file.startsWith(`${projectRoot}/`) ? file.slice(projectRoot.length + 1) : file
  return /^([/]|[A-Za-z]:)/.test(inner) ? inner : joinRelative(root, inner)
}

/** @param {string} file @param {any[]} mutants @returns {Survivor[]} */
const strykerFile = (file, mutants) => mutants
  .filter((mutant) => Object.hasOwn(STRYKER_ALIVE, mutant?.status))
  .map((mutant) => ({
    file,
    line: Number(mutant.location?.start?.line ?? 0),
    mutator: String(mutant.mutatorName ?? 'unknown'),
    replacement: typeof mutant.replacement === 'string' ? mutant.replacement : null,
    covered: STRYKER_ALIVE[/** @type {'Survived' | 'NoCoverage'} */ (mutant.status)],
  }))

/** PIT's statuses that count against the score, with whether a test ran the mutant. */
const PIT_ALIVE = Object.freeze({ SURVIVED: true, NO_COVERAGE: false })

/** @param {string} text @param {string} root @returns {SurvivorReading} */
const pitSurvivors = (text, root) => {
  if (!/<mutations[\s>]/.test(text)) return { ok: false, reason: 'is not a PIT mutations.xml report' }
  const mutations = [...text.matchAll(/<mutation\b([^>]*)>([\s\S]*?)<\/mutation>/g)]
  return { ok: true, survivors: mutations.flatMap(([, attributes, body]) => pitMutation(attributes, body, root)) }
}

/** @param {string} attributes @param {string} body @param {string} root @returns {Survivor[]} */
const pitMutation = (attributes, body, root) => {
  const status = /\bstatus=['"]([A-Z_]+)['"]/.exec(attributes)?.[1] ?? ''
  if (!Object.hasOwn(PIT_ALIVE, status)) return []
  const tag = (/** @type {string} */ name) => unescapeXml(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body)?.[1] ?? '')
  return [{
    file: joinRelative(root, pitSource(tag('mutatedClass'), tag('sourceFile'))),
    line: Number(tag('lineNumber')),
    mutator: tag('mutator').split('.').at(-1) ?? '',
    replacement: tag('description') || null,
    covered: PIT_ALIVE[/** @type {'SURVIVED' | 'NO_COVERAGE'} */ (status)],
  }]
}

/**
 * The source file of a mutated class, under the folders of its package.
 * @param {string} mutatedClass `com.acme.Checkout` or `com.acme.Checkout$Line` @param {string} sourceFile `Checkout.java`
 */
const pitSource = (mutatedClass, sourceFile) => [...mutatedClass.split('.').slice(0, -1), sourceFile].join('/')

/** @param {string} text */
const unescapeXml = (text) => text
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&')

/**
 * A survivor on one line: where it is, what the mutation did, and why it is alive.
 * @param {Survivor} survivor
 */
export const survivorLine = ({ file, line, mutator, replacement, covered }) =>
  `${file}:${line} ${mutator}${replacement === null ? '' : ` (${replacement})`} ${covered ? 'survived' : 'has no test covering it'}`

/**
 * The survivors by file, files and lines in order.
 * @param {Survivor[]} survivors
 * @returns {SurvivorGroup[]}
 */
export const groupSurvivors = (survivors) => {
  const files = [...new Set(survivors.map(({ file }) => file))].sort()
  return files.map((file) => ({
    file,
    mutants: survivors.filter((survivor) => survivor.file === file).sort((a, b) => a.line - b.line).map(survivorLine),
  }))
}

/** How many mutants a run left alive, in words. @param {number} count */
export const aliveCount = (count) => (count === 1 ? '1 mutant survives' : `${count} mutants survive`)

/** Rounds in a row that may leave as many mutants alive before the loop stops. */
export const ROUNDS_WITHOUT_PROGRESS = 2

/**
 * Whether the last rounds of a mutation loop left as many mutants alive as the best round before
 * them: the loop makes no progress and stops.
 * @param {number[]} counts the survivors of each failed round since the gate last passed, oldest first
 */
export const isStalled = (counts) => {
  const before = counts.slice(0, -ROUNDS_WITHOUT_PROGRESS)
  if (before.length === 0) return false
  return Math.min(...counts.slice(-ROUNDS_WITHOUT_PROGRESS)) >= Math.min(...before)
}
