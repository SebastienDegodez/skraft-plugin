import { strictEqual } from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'))

// A rubric entry is a sentence handed to the LLM judge. YAML forbids ": " inside
// a plain scalar, so an unquoted entry that contains one parses as a mapping
// instead of a string. The judge then receives an object, throws, and every
// trial for that stimulus is recorded as errored — which the comparison reports
// as an incomplete pairing rather than as a broken spec. Nothing else in the
// pipeline notices, so the criterion silently stops being graded at all.
function malformedRubricEntries(content) {
  const lines = content.split(/\r?\n/)
  const findings = []
  let rubricIndent = null

  for (const [index, line] of lines.entries()) {
    const opensRubric = /^(\s*)rubric:\s*$/.exec(line)
    if (opensRubric) {
      rubricIndent = opensRubric[1].length
      continue
    }
    if (rubricIndent === null || line.trim() === '') continue

    const indent = line.length - line.trimStart().length
    if (indent <= rubricIndent) {
      rubricIndent = null
      continue
    }

    const item = /^\s*-\s+(.*)$/.exec(line)
    if (!item) continue

    const text = item[1]
    // Quoted scalars and block scalars keep ": " as content, so only a bare
    // plain scalar can turn into a mapping.
    if (/^['">|]/.test(text)) continue
    if (/:(\s|$)/.test(text)) findings.push({ line: index + 1, text })
  }

  return findings
}

function evalSpecs(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) evalSpecs(path, found)
    else if (/^(\.[a-z-]+\.)?eval(\.[a-z-]+)?\.yaml$/.test(entry.name)) found.push(path)
  }
  return found
}

describe('committed eval specs', () => {
  it('keeps every rubric entry a string the judge can read', () => {
    const findings = evalSpecs(join(repoRoot, 'tests')).flatMap((path) =>
      malformedRubricEntries(readFileSync(path, 'utf8')).map(
        (finding) => `${relative(repoRoot, path)}:${finding.line} — quote it: ${finding.text}`,
      ),
    )

    strictEqual(findings.length, 0, `rubric entries YAML reads as a mapping:\n${findings.join('\n')}`)
  })

  it('flags an unquoted entry that YAML would read as a mapping', () => {
    const spec = ['    rubric:', '      - Ownership is explicit: approval belongs to bdd-methodology.', ''].join('\n')

    strictEqual(malformedRubricEntries(spec).length, 1)
  })

  it('accepts the same sentence once it is quoted', () => {
    const spec = ["    rubric:", "      - 'Ownership is explicit: approval belongs to bdd-methodology.'", ''].join('\n')

    strictEqual(malformedRubricEntries(spec).length, 0)
  })

  it('leaves the block that follows a rubric alone', () => {
    const spec = ['    rubric:', '      - A plain sentence with no colon.', '    graders:', '      - type: prompt', ''].join('\n')

    strictEqual(malformedRubricEntries(spec).length, 0)
  })
})
