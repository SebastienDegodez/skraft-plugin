import { readFile, writeFile, symlink } from 'node:fs/promises'
import { report } from './quality-gates-javascript.fixture.mjs'

const [, , , configPath, mode = 'pass'] = process.argv
const options = JSON.parse(await readFile(configPath, 'utf8'))
const destination = options.jsonReporter.fileName
const value = report(options, process.cwd())
process.stdout.write('fixture runner stdout\n')
process.stderr.write('fixture runner stderr\n')
if (mode === 'missing') process.exit(0)
if (mode === 'malformed') {
  await writeFile(destination, '{broken')
  process.exit(0)
}
if (mode === 'symlink') {
  await writeFile(`${destination}.old`, JSON.stringify(value))
  await symlink(`${destination}.old`, destination)
  process.exit(0)
}
if (mode === 'empty') value.files = {}
if (mode === 'stale') value.config = { ...options, jsonReporter: { fileName: '/old/report.json' } }
if (mode === 'unexpected') value.files['unexpected.mjs'] = value.files[options.mutate[0]]
if (mode === 'survived') value.files[options.mutate[0]].mutants[0].status = 'Survived'
if (mode === 'change-source') await writeFile(options.mutate[0], 'changed source')
if (mode === 'change-core') await writeFile('src/core.mjs', 'changed core after it passed')
await writeFile(destination, JSON.stringify(value))
if (mode === 'nonzero') process.exit(7)
if (mode === 'signal') process.kill(process.pid, 'SIGTERM')