// node:test reporter that turns each failing test into a GitHub Actions error annotation,
// so a failure on any runner OS is readable from the check run without downloading logs.
//   node --test --test-reporter=spec --test-reporter-destination=stdout \
//     --test-reporter=./scripts/lib/gh-annotations-reporter.mjs --test-reporter-destination=stdout ...
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const escapeData = (value) => String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
const escapeProperty = (value) => escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C')

const repoPath = (file) => {
  if (!file) return null
  const path = file.startsWith('file:') ? fileURLToPath(file) : file
  return relative(process.cwd(), path).split('\\').join('/')
}

export default async function* githubAnnotations(source) {
  for await (const event of source) {
    if (event.type !== 'test:fail') continue
    const { name, file, line, details } = event.data
    // A suite fails when one of its tests does; annotate the test, not every ancestor.
    if (details?.type === 'suite' || details?.error?.failureType === 'subtestsFailed') continue
    const error = details?.error?.cause ?? details?.error
    const message = (error?.message ?? String(error ?? 'failed')).split('\n').slice(0, 12).join('\n')
    const where = repoPath(file)
    const properties = [where && `file=${escapeProperty(where)}`, where && line && `line=${line}`, `title=${escapeProperty(`${process.platform}: ${name}`)}`].filter(Boolean)
    yield `::error ${properties.join(',')}::${escapeData(message)}\n`
  }
}
