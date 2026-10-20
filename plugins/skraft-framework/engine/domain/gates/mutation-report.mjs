import { joinRelative } from '../config/relative-path.mjs'
import { shortLocation } from '../review/locations.mjs'

/**
 * The mutants a mutation run left alive, read from the report its tool writes: the
 * mutation-testing-elements JSON of Stryker (.NET, JavaScript, TypeScript, and any tool that
 * writes it), or the `mutations.xml` of PIT (Java).
 *
 * @typedef {import('../config/skraft-config.mjs').Component} Component
 * @typedef {{ file: string, line: number, mutator: string, replacement: string | null, covered: boolean }} Survivor
 *   file: relative to the working copy, absolute only outside it; for PIT, the class's source
 *   file under its package folders, relative to a source folder. covered: a test ran it and still passed;
 *   false when no test runs that code.
 * @typedef {{ file: string, mutants: string[] }} SurvivorGroup the survivors of one file, each told on one line
 * @typedef {{ ok: true, survivors: Survivor[], inSources: boolean } | { ok: false, reason: string }} SurvivorReading
 *   inSources: each file is relative to a source folder of the component, where PIT names a
 *   class by its package; the files of a Stryker report are relative to the working copy.
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
  if (component.stack === 'java' && /gradle/.test(component.commands.mutation)) return GRADLE_REPORT
  return REPORTS[component.stack]
}

/**
 * The survivors a report names, each file relative to the working copy.
 * @param {string} text the report's content
 * @param {Where} where
 * @returns {SurvivorReading}
 */
export const readSurvivors = (text, where) => (where.report.endsWith('.xml') ? pitSurvivors(text) : strykerSurvivors(text, where))

/**
 * Where a file PIT names may sit in the component: under each source folder, in its `java` or
 * `kotlin` folder or right in it.
 * @param {Component} component @param {string} file relative to a source folder
 */
export const sourceCandidates = (component, file) => component.paths.src.flatMap((src) => [
  ...['java', 'kotlin'].map((language) => joinRelative(component.root, src, language, file)),
  joinRelative(component.root, src, file),
])

/**
 * @typedef {{ report: string, root: string, workingCopy: string }} Where
 *   report: the report's path, relative to root, the component's root; workingCopy: its absolute path.
 */

/** Stryker's statuses that count against the score, with whether a test ran the mutant. */
const STRYKER_ALIVE = Object.freeze({ Survived: true, NoCoverage: false })

/** @param {string} text @param {Where} where @returns {SurvivorReading} */
const strykerSurvivors = (text, where) => {
  const report = parseJson(text)
  if (!isStrykerReport(report)) return { ok: false, reason: 'is not a mutation-testing-elements report' }
  return { ok: true, inSources: false, survivors: Object.entries(report.files).flatMap(([name, file]) => strykerFile(reportedFile(name, where), file.mutants)) }
}

/** @param {string} text @returns {unknown} undefined when the text is not JSON */
const parseJson = (text) => {
  try {
    return JSON.parse(text)
    // Stryker disable next-line BlockStatement: a text that is no JSON and one that is no report get the same answer
  } catch {
    return undefined
  }
}

/** @param {any} report @returns {report is { files: Record<string, { mutants: StrykerMutant[] }> }} */
const isStrykerReport = (report) => isRecord(report) && isRecord(report.files) && Object.values(report.files).every((file) => isRecord(file) && Array.isArray(file.mutants) && file.mutants.every(isStrykerMutant))

/**
 * @typedef {{ status: string, mutatorName: string, replacement?: unknown, location: { start: { line: number } } }} StrykerMutant
 * @param {any} mutant @returns {mutant is StrykerMutant}
 */
const isStrykerMutant = (mutant) => isRecord(mutant) && typeof mutant.status === 'string' && typeof mutant.mutatorName === 'string' && Number.isInteger(mutant.location?.start?.line)

/** @param {unknown} value @returns {value is Record<string, any>} */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** @param {string} path */
const slashed = (path) => path.replaceAll('\\', '/')

/**
 * A file the report names, relative to the working copy. Stryker.NET names it by its absolute
 * path, StrykerJS relative to the folder the command ran in, the component's root.
 * @param {string} name @param {Where} where
 */
const reportedFile = (name, { root, workingCopy }) => {
  const file = slashed(name)
  return isAbsolute(file) ? shortLocation(file, workingCopy) : joinRelative(root, file)
}

/** @param {string} path `/`-separated */
const isAbsolute = (path) => /^([/]|[A-Za-z]:)/.test(path)

/** @param {string} file @param {StrykerMutant[]} mutants @returns {Survivor[]} */
const strykerFile = (file, mutants) => mutants
  .filter((mutant) => Object.hasOwn(STRYKER_ALIVE, mutant.status))
  .map((mutant) => ({
    file,
    line: mutant.location.start.line,
    mutator: mutant.mutatorName,
    replacement: typeof mutant.replacement === 'string' ? mutant.replacement : null,
    covered: STRYKER_ALIVE[/** @type {'Survived' | 'NoCoverage'} */ (mutant.status)],
  }))

/** PIT's statuses that count against the score, with whether a test ran the mutant. */
const PIT_ALIVE = Object.freeze({ SURVIVED: true, NO_COVERAGE: false })

/** @param {string} text @returns {SurvivorReading} */
const pitSurvivors = (text) => {
  if (!/<mutations[\s>]/.test(text)) return { ok: false, reason: 'is not a PIT mutations.xml report' }
  const mutations = [...text.matchAll(/<mutation\b([^>]*)>([\s\S]*?)<\/mutation>/g)]
  return { ok: true, inSources: true, survivors: mutations.flatMap(([, attributes, body]) => pitMutation(attributes, body)) }
}

/** @param {string} attributes @param {string} body @returns {Survivor[]} */
const pitMutation = (attributes, body) => {
  const status = /\bstatus=['"]([A-Z_]+)['"]/.exec(attributes)?.[1]
  if (!Object.hasOwn(PIT_ALIVE, String(status))) return []
  const tag = (/** @type {string} */ name) => unescapeXml(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body)?.[1] ?? '')
  return [{
    file: pitSource(tag('mutatedClass'), tag('sourceFile')),
    line: Number(tag('lineNumber')),
    mutator: /** @type {string} */ (tag('mutator').split('.').at(-1)),
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
  // With no round before, the minimum is Infinity: never stalled.
  return Math.min(...counts.slice(-ROUNDS_WITHOUT_PROGRESS)) >= Math.min(...before)
}
