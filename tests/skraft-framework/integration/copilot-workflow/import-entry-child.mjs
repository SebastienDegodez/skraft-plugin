// Run as a child process by extension-entry.test.mjs: imports the Copilot extension entry with
// `@github/copilot-sdk/extension` resolved to stub-copilot-sdk.mjs, and records every async
// resource created from the import until the process exits, so that a socket or a timer the
// entry starts after its import resolved is seen too. Writes nothing to stdout itself; the report
// is the last line of stderr, written synchronously at exit.  argv: <extension entry path>
import { createHook } from 'node:async_hooks'
import { writeSync } from 'node:fs'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { registered } from './simulated-sdk.mjs'

const stub = new URL('./stub-copilot-sdk.mjs', import.meta.url).href
const hooks = `export async function resolve(specifier, context, next) {
  return specifier === '@github/copilot-sdk/extension' ? { url: ${JSON.stringify(stub)}, shortCircuit: true } : next(specifier, context)
}`
register(`data:text/javascript,${encodeURIComponent(hooks)}`)

const created = []
process.on('exit', () => {
  const report = { created: [...new Set(created)].sort(), joins: registered(globalThis.skraftStubSdk?.joins ?? []) }
  writeSync(2, `\n${JSON.stringify(report)}\n`)
})
createHook({ init: (_id, type) => { created.push(type) } }).enable()
await import(pathToFileURL(process.argv[2]).href)
