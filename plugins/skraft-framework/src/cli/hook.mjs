#!/usr/bin/env node
// SKRAFT hook entry point, wired into every hook event of both manifests.
//
// Each tool event has one entry with no matcher: VS Code ignores matchers and would run
// every entry of an event on every tool call. So this entry is spawned for every tool
// call, and most of them cannot reach a guard. It reads stdin, normalises the payload
// and returns before importing a single guard when the call is irrelevant; only a call a
// guard can act on loads the runner (hook-runner.mjs) and its services.
import { fromHarnessInput } from '../adapters/api/hooks/harness-input.mjs'
import { isHookRelevant } from '../domain/hook-relevance-policy.mjs'

const readStdin = async () => {
  let raw = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) raw += chunk
  return raw
}

// The manifest forwards the event name as the first arg. A second arg (matcher) is still
// accepted from older manifests and in-process callers: it names the tool a payload omits.
const [argEvent, argMatcher] = process.argv.slice(2)
let raw = ''
try { raw = await readStdin() } catch { /* the runner reports an unreadable payload */ }

let relevant = true
try {
  const payload = fromHarnessInput(raw ? JSON.parse(raw) : {})
  if (argMatcher && payload.toolName == null) payload.toolName = argMatcher
  const event = argEvent ?? payload.hook_event_name ?? payload.hookEventName ?? payload.hookType ?? payload.hook_type ?? payload.type
  relevant = isHookRelevant({ event, payload, raw })
} catch { /* malformed payload: the runner owns the failure path (audit, state-write refusal) */ }

if (relevant) {
  const { runHook } = await import('./hook-runner.mjs')
  await runHook({ raw, argEvent, argMatcher })
}
