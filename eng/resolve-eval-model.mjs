#!/usr/bin/env node
// Resolve the agent model one evaluation must run on, and print it.
//
// Three sources, highest precedence first:
//   1. MODEL in the environment  - one run, every eval, no exceptions. This is
//      what the CI model-comparison matrix sets, and an arm that silently let a
//      spec opt out of the model under test would not be an arm at all.
//   2. `defaults.model` in the spec - the eval's own pin. Use it when a skill is
//      only meaningful on a particular model, and say why in a comment there.
//   3. DEFAULT_MODEL - the repository default for everything else.
//
// The spec is read with Vally's own loader rather than a YAML shortcut: this
// repository has twice shipped a spec whose meaning changed because a plain
// scalar containing ": " parsed as a mapping, and a grep-based reader would not
// have noticed either time.
import { loadEvalSpec } from '@microsoft/vally'

const [specPath, fallback] = process.argv.slice(2)

if (!specPath || !fallback) {
  console.error('usage: resolve-eval-model.mjs <eval.yaml> <default-model>')
  process.exit(2)
}

const envModel = (process.env.MODEL ?? '').trim()
if (envModel) {
  process.stdout.write(envModel)
  process.exit(0)
}

// A spec that cannot be read is not this script's failure to report: the run is
// about to load it anyway and will say so properly. Fall back rather than
// stopping the whole portfolio on a parse error.
let pinned = ''
try {
  const loaded = await loadEvalSpec(specPath)
  const spec = loaded?.spec ?? loaded
  const value = spec?.defaults?.model
  if (typeof value === 'string' && value.trim()) pinned = value.trim()
} catch {
  pinned = ''
}

process.stdout.write(pinned || fallback)
