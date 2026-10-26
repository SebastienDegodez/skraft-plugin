// Another session starting again and again: tries to create the lock file until it is told to
// stop (a `stop` line on stdin), then says how many of its creates succeeded.
//   node creator.mjs <lock path>
import { createLock } from '../../../../plugins/skraft-framework/engine/infrastructure/tracking/lock-file.mjs'

const [path] = process.argv.slice(2)
let stopped = false
let created = 0
process.stdin.setEncoding('utf8')
process.stdin.on('data', (text) => { if (text.includes('stop')) stopped = true })
process.stdout.write('ready\n')
while (!stopped) {
  if (await createLock(path, 'intruder 2026-10-11T09:00:00.000Z 2026-10-11T09:00:00.000Z\n').catch(() => false)) created += 1
  await new Promise((resolve) => setImmediate(resolve))
}
process.stdout.write(`${created}\n`)
process.exit(0)
