// Another session, in a process of its own: takes the pipeline's lease the way RunPipeline does,
// says `held` (or the refusal code) on stdout, then renews it until a `release` line on stdin
// ends the lease and the process, or the process is killed.
//   node holder.mjs <working copy> <slug>
import { holdRun } from '../../../../plugins/skraft-framework/engine/application/pipeline/run-lock.mjs'
import { createNodeRunLock } from '../../../../plugins/skraft-framework/engine/infrastructure/tracking/lock-file.mjs'
import { createNodeTimer } from '../../../../plugins/skraft-framework/engine/infrastructure/clock/node-timer.mjs'
import { createSystemClock } from '../../../../plugins/skraft-framework/engine/infrastructure/clock/system-clock.mjs'

const [root, slug] = process.argv.slice(2)
const lock = await holdRun({ runLock: createNodeRunLock({ root }), timer: createNodeTimer(), clock: createSystemClock() }, slug)
process.stdout.write(lock.ok ? 'held\n' : `${lock.outcome.code}\n`)
if (lock.ok) {
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', async (text) => {
    if (!text.includes('release')) return
    await lock.held.release()
    process.stdout.write('released\n')
    process.exit(0)
  })
}
