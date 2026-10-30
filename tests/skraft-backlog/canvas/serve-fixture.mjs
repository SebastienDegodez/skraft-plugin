// Serves the backlog canvas over the fixture workspace with a fake `gh`, for the browser tests and
// for looking at the panel by hand:
//   node tests/skraft-backlog/canvas/serve-fixture.mjs [--port 4317] [--empty]
// It prints the panel URL on its first line. Every start builds a fresh workspace, removed on stop.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createController } from '../../../plugins/skraft-backlog/prd-backlog/canvas/controller.mjs'
import { startServer } from '../../../plugins/skraft-backlog/prd-backlog/canvas/server.mjs'
import { fakeGitHub } from '../prd-backlog/fake-github.mjs'
import { REPO, makeWorkspace } from './workspace.mjs'

const args = process.argv.slice(2)
const port = Number(args[args.indexOf('--port') + 1]) || 0
const cwd = await mkdtemp(join(tmpdir(), 'skraft-canvas-'))
if (!args.includes('--empty')) await makeWorkspace(cwd)
const controller = createController({ cwd, gh: fakeGitHub({ repo: REPO }).run, pollMs: 300 })
await controller.reload()
controller.watch()
const server = await startServer({ controller, port, onError: (error) => process.stderr.write(`${error.stack}\n`) })
process.stdout.write(`${server.url}\n${cwd}\n`)

// server.close() resolves only once every connection has closed, and Node (22.17) never counts
// a connection that has not sent a request yet as idle: a browser's preconnected socket held it
// open for good and the test timed out in afterEach. Exiting drops every connection; only the
// workspace has to be gone first.
const stop = async () => {
  await controller.stop()
  void server.close()
  await rm(cwd, { recursive: true, force: true })
  process.exit(0)
}
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
