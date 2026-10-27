// Run as a child process by extension-entry.test.mjs: imports the Copilot extension entry with
// `@github/copilot-sdk/extension` resolved to stub-copilot-sdk.mjs, and records every async
// resource created while the import runs, and the active resources before and after it. Writes
// nothing to stdout itself; the report is the last line of stderr.  argv: <extension entry path>
import { createHook } from 'node:async_hooks'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { registered } from './simulated-sdk.mjs'

const stub = new URL('./stub-copilot-sdk.mjs', import.meta.url).href
const hooks = `export async function resolve(specifier, context, next) {
  return specifier === '@github/copilot-sdk/extension' ? { url: ${JSON.stringify(stub)}, shortCircuit: true } : next(specifier, context)
}`
register(`data:text/javascript,${encodeURIComponent(hooks)}`)

const created = []
const before = process.getActiveResourcesInfo()
const hook = createHook({ init: (_id, type) => { created.push(type) } })
hook.enable()
await import(pathToFileURL(process.argv[2]).href)
hook.disable()
const after = process.getActiveResourcesInfo()

process.stderr.write(`\n${JSON.stringify({ created: [...new Set(created)].sort(), before, after, joins: registered(globalThis.skraftStubSdk.joins) })}\n`)
