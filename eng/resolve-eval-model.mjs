#!/usr/bin/env node
// Resolve the agent model one evaluation must run on, or the judge, and print it.
//
//   resolve-eval-model.mjs <eval.yaml>   the agent model of that eval
//   resolve-eval-model.mjs --judge       the judge of every eval
//   resolve-eval-model.mjs --comparison-judge
//                                        the judge of a model comparison
//
// eng/eval-models.json is the only place a versioned model is written: it maps
// each family to a model, names the default family and pins the judge. A spec
// names a family, never a model.
//
// Agent model, highest precedence first:
//   1. MODEL in the environment  - one run, every eval, no exceptions. This is
//      what the CI model-comparison matrix sets, and an arm that silently let a
//      spec opt out of the model under test would not be an arm at all. A
//      declared family resolves to its model; any other value is a model typed
//      at dispatch and is kept.
//   2. `defaults.model` in the spec - the eval's family. A name the file does
//      not declare is refused: a typo would otherwise run on a model nobody
//      chose.
//   3. the declared default family.
//
// Judge: JUDGE_MODEL in the environment (resolved the same way), else the
// declared judge (`judge`, or `comparisonJudge` for a model comparison). The
// two stay apart so neither series of verdicts changes yardstick.
//
// The spec is read with Vally's own loader rather than a YAML shortcut: this
// repository has twice shipped a spec whose meaning changed because a plain
// scalar containing ": " parsed as a mapping, and a grep-based reader would not
// have noticed either time.
import { readFileSync } from 'node:fs'

const DECLARED_PATH = 'eng/eval-models.json'
const declared = JSON.parse(readFileSync(new URL('./eval-models.json', import.meta.url), 'utf8'))

const fromEnv = (name) => {
  const value = (process.env[name] ?? '').trim()
  if (!value) return ''
  return Object.hasOwn(declared.families, value) ? declared.families[value] : value
}

// Loaded only to read a spec: the judges resolve without node_modules.
const evalSpecLoader = async () => {
  try {
    return (await import('@microsoft/vally')).loadEvalSpec
  } catch {
    console.error('resolve-eval-model: @microsoft/vally is not installed; run `npm install` at the repository root')
    process.exit(1)
  }
}

// A spec that cannot be read is not this script's failure to report: the run is
// about to load it anyway and will say so properly. Fall back rather than
// stopping the whole portfolio on a parse error.
const specFamily = async (specPath) => {
  const loadEvalSpec = await evalSpecLoader()
  try {
    const loaded = await loadEvalSpec(specPath)
    const value = (loaded?.spec ?? loaded)?.defaults?.model
    return typeof value === 'string' ? value.trim() : ''
  } catch {
    return ''
  }
}

const agentModel = async (specPath) => {
  const forced = fromEnv('MODEL')
  if (forced) return forced
  const family = (await specFamily(specPath)) || declared.default
  if (Object.hasOwn(declared.families, family)) return declared.families[family]
  console.error(`${specPath} pins "${family}", which ${DECLARED_PATH} declares no family for; name one of: ${Object.keys(declared.families).join(', ')}`)
  process.exit(1)
}

const [target] = process.argv.slice(2)

if (!target) {
  console.error('usage: resolve-eval-model.mjs <eval.yaml> | --judge | --comparison-judge')
  process.exit(2)
}

const JUDGES = { '--judge': declared.judge, '--comparison-judge': declared.comparisonJudge }

process.stdout.write(Object.hasOwn(JUDGES, target) ? fromEnv('JUDGE_MODEL') || JUDGES[target] : await agentModel(target))
