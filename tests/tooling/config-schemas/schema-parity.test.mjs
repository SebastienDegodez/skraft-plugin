import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIG_FILE, LOCAL_CONFIG_FILE, readConfigLayers } from '../../../plugins/skraft-framework/engine/domain/config/skraft-config.mjs'

// The engine checks skraft-config.json and the developer's own layers itself, with no JSON
// Schema library; the schemas in plugins/skraft-framework/schemas/ give editors the same rules.
// Each fixture is judged by both and its name says the verdict: valid-*.json or invalid-*.json.
// Ajv comes with the engine's dev dependencies: npm ci --prefix plugins/skraft-framework/engine.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCHEMAS = join(ROOT, 'plugins', 'skraft-framework', 'schemas')
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))
const LOCAL_SCHEMA = 'skraft-config.local.schema.json'
const TEAM_SCHEMA = 'skraft-config.schema.json'

const loadAjv = () => {
  try {
    return createRequire(join(ROOT, 'plugins', 'skraft-framework', 'engine', 'package.json'))('ajv/dist/2020').default
  } catch (error) {
    throw new Error(`Ajv is not installed: run npm ci --prefix plugins/skraft-framework/engine (${error.message})`)
  }
}

const schemaText = (name) => JSON.parse(readFileSync(join(SCHEMAS, name), 'utf8'))

const validators = () => {
  const Ajv2020 = loadAjv()
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true })
  ajv.addSchema(schemaText(LOCAL_SCHEMA), LOCAL_SCHEMA)
  ajv.addSchema(schemaText(TEAM_SCHEMA), TEAM_SCHEMA)
  return { local: ajv.getSchema(LOCAL_SCHEMA), team: ajv.getSchema(TEAM_SCHEMA) }
}

/** Whether the engine finds the file itself at fault, the merged configuration aside. */
const LAYERS = {
  local: { file: LOCAL_CONFIG_FILE, texts: (text) => ({ team: null, local: text }) },
  team: { file: CONFIG_FILE, texts: (text) => ({ team: text }) },
}
const domainAccepts = (kind, text) => {
  const reading = readConfigLayers(LAYERS[kind].texts(text))
  return reading.ok || !reading.invalid.some(({ file }) => file === LAYERS[kind].file)
}

const fixtures = (kind) => readdirSync(join(FIXTURES, kind)).filter((name) => name.endsWith('.json')).sort()

for (const kind of ['local', 'team']) {
  test(`the engine and the ${kind === 'local' ? 'local' : 'team'} schema give every ${kind} fixture the verdict its name says`, () => {
    const validate = validators()[kind]
    const verdicts = fixtures(kind).map((name) => {
      const text = readFileSync(join(FIXTURES, kind, name), 'utf8')
      const schema = validate(JSON.parse(text))
      return { name, expected: name.startsWith('valid-'), domain: domainAccepts(kind, text), schema, errors: schema ? [] : validate.errors.map(({ instancePath, message }) => `${instancePath} ${message}`) }
    })
    assert.ok(verdicts.length > 10, `${kind} fixtures: ${verdicts.length}`)
    assert.deepEqual(verdicts.filter(({ expected, domain, schema }) => domain !== expected || schema !== expected), [])
  })
}

test('the example of a developer\'s file names its own schema, and the team schema refuses a key only the developer\'s file may hold', () => {
  const { team } = validators()
  const example = JSON.parse(readFileSync(join(FIXTURES, 'local', 'valid-design-example.json'), 'utf8'))
  assert.equal(example.$schema, `./plugins/skraft-framework/schemas/${LOCAL_SCHEMA}`)
  assert.equal(team(example), true)
  assert.equal(team({ components: [{ name: 'api', root: '.', stack: 'dotnet', model: 'opus' }] }), false)
})
