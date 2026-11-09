import { CONFIG_FILE } from './skraft-config.mjs'

/**
 * The infrastructure policy of a component's tests: for each kind of dependency the code under
 * test reaches, what a targeted scenario runs it on, and what the walking skeleton runs it on (the
 * end-to-end run for a React component, whose walking skeleton lives in a back component), with
 * the tool that does it on the component's stack. The plugin's rows hold unless the component
 * overrides one in skraft-config.json; the external gateway row, and React's front-to-back row,
 * follow the component's mocking.strategy. No Node: the mod loads this too.
 *
 * Rows, by dependency kind:
 * - entryPoint: what drives the component — controller, CLI, UI, webhook received, topic consumed.
 * - internalGateway: what the component owns behind it — repository, database, cache.
 * - externalGateway: what another team owns that the component calls — REST, SOAP, GraphQL, gRPC,
 *   Kafka, RabbitMQ, MQTT, WebSocket, webhook sent.
 * - clock: the clock and randomness.
 * - frontToBack, React only: the back end the front end calls.
 *
 * @typedef {'in-process' | 'real' | 'in-memory' | 'testcontainers' | 'microcks' | 'fake' | 'msw'} Mechanism
 * @typedef {'entryPoint' | 'internalGateway' | 'externalGateway' | 'clock' | 'frontToBack'} Row
 * @typedef {'targeted' | 'walkingSkeleton' | 'e2e'} Stage
 * @typedef {Partial<Record<Stage, Mechanism>>} Stages
 * @typedef {Partial<Record<Row, Stages>>} Infrastructure the rows a component overrides, as skraft-config.json writes them
 * @typedef {'plugin' | 'skraft-config.json' | 'skraft-config.json (mocking.strategy)'} PolicySource
 * @typedef {{ row: Row, targeted: Mechanism, walkingSkeleton?: Mechanism, e2e?: Mechanism, tool: string | null, source: PolicySource }} PolicyRow
 *   tool: what runs the row's mechanisms on the component's stack, null when nothing is needed.
 * @typedef {{ row: Row, stages: Stages } | { row: Row, byMocking: Record<'microcks' | 'inprocess', Stages> }} RowDefinition
 * @typedef {import('./skraft-config.mjs').Component} Component
 */

/** What a row may run on. */
export const MECHANISMS = Object.freeze(/** @type {Mechanism[]} */ (['in-process', 'real', 'in-memory', 'testcontainers', 'microcks', 'fake', 'msw']))

/** The mechanisms that need a container runtime: Docker or Podman. */
const CONTAINERS = Object.freeze(['testcontainers', 'microcks'])

/** The row mocking.strategy sets, which no component overrides. */
const SET_BY_MOCKING = 'externalGateway'

/** @type {ReadonlyArray<RowDefinition>} */
const BACK_ROWS = Object.freeze([
  { row: 'entryPoint', stages: { targeted: 'in-process', walkingSkeleton: 'real' } },
  { row: 'internalGateway', stages: { targeted: 'in-memory', walkingSkeleton: 'testcontainers' } },
  { row: 'externalGateway', byMocking: { microcks: { targeted: 'microcks', walkingSkeleton: 'microcks' }, inprocess: { targeted: 'in-process', walkingSkeleton: 'in-process' } } },
  { row: 'clock', stages: { targeted: 'fake', walkingSkeleton: 'fake' } },
])

/** @type {ReadonlyArray<RowDefinition>} */
const FRONT_ROWS = Object.freeze([
  { row: 'entryPoint', stages: { targeted: 'in-process' } },
  { row: 'frontToBack', byMocking: { inprocess: { targeted: 'msw', e2e: 'microcks' }, microcks: { targeted: 'microcks', e2e: 'microcks' } } },
  { row: 'clock', stages: { targeted: 'fake' } },
])

/** What hosts the component in the test process, by stack. */
const IN_PROCESS_TOOLS = Object.freeze({
  dotnet: 'WebApplicationFactory', java: 'MockMvc / @SpringBootTest', python: 'FastAPI TestClient',
  typescript: 'app.inject / supertest', javascript: 'app.inject / supertest', react: 'Testing Library',
})

/** What runs a mechanism whatever the stack. */
const TOOLS = Object.freeze({
  testcontainers: 'Testcontainers', msw: 'MSW',
  microcks: 'Microcks uber native image via Testcontainers, one container per test session',
})

/** What runs Microcks behind a React component's end-to-end run. */
const E2E_MICROCKS = 'Playwright + Microcks'

/** How a line names each row and each stage. */
const ROW_LABELS = Object.freeze({ entryPoint: 'entry point', internalGateway: 'internal gateway', externalGateway: 'external gateway', clock: 'clock', frontToBack: 'front to back' })
const STAGE_LABELS = Object.freeze({ targeted: 'targeted', walkingSkeleton: 'walking skeleton', e2e: 'e2e' })
const STAGES = /** @type {Stage[]} */ (Object.keys(STAGE_LABELS))

/** @param {unknown} stack */
const rowsOf = (stack) => (stack === 'react' ? FRONT_ROWS : BACK_ROWS)

/**
 * The component's policy, row by row in the plugin's order, each with where it comes from.
 * @param {Component} component @returns {PolicyRow[]}
 */
export const effectivePolicy = (component) => rowsOf(component.stack).map((definition) => effectiveRow(component, definition))

/** @param {Component} component @param {RowDefinition} definition @returns {PolicyRow} */
const effectiveRow = ({ stack, mocking, infrastructure }, definition) => {
  const override = infrastructure[definition.row]
  const stages = { ...pluginStages(definition, mocking.strategy), ...override }
  return /** @type {PolicyRow} */ ({ row: definition.row, ...stages, tool: toolOf(stack, stages), source: sourceOf(definition, override, { stack, strategy: mocking.strategy }) })
}

/**
 * The mocking strategy of a component that names none: in process (MSW) for a React front end,
 * Microcks for every other stack.
 * @param {unknown} stack @returns {'microcks' | 'inprocess'}
 */
export const defaultMocking = (stack) => (stack === 'react' ? 'inprocess' : 'microcks')

/** @param {RowDefinition} definition @param {'microcks' | 'inprocess'} strategy @returns {Stages} */
const pluginStages = (definition, strategy) => ('stages' in definition ? definition.stages : definition.byMocking[strategy])

/**
 * Where a row comes from: the component's override, else the plugin, else for a row the mocking
 * strategy sets, the plugin when the strategy is its stack's default and the team's file otherwise.
 * @param {RowDefinition} definition @param {Stages | undefined} override
 * @param {{ stack: Component['stack'], strategy: 'microcks' | 'inprocess' }} mocking
 * @returns {PolicySource}
 */
const sourceOf = (definition, override, { stack, strategy }) => {
  if (override !== undefined) return CONFIG_FILE
  return 'stages' in definition || strategy === defaultMocking(stack) ? 'plugin' : `${CONFIG_FILE} (mocking.strategy)`
}

/** The tools of the row's stages, each once. @param {Component['stack']} stack @param {Stages} stages */
const toolOf = (stack, stages) => {
  const tools = [...new Set(Object.entries(stages).map(([stage, mechanism]) => toolFor(stack, stage, mechanism)))].filter(Boolean)
  return tools.length === 0 ? null : tools.join('; ')
}

/** @param {Component['stack']} stack @param {string} stage @param {Mechanism} mechanism @returns {string | undefined} */
const toolFor = (stack, stage, mechanism) => {
  if (mechanism === 'in-process') return IN_PROCESS_TOOLS[stack]
  if (stage === 'e2e' && mechanism === 'microcks') return E2E_MICROCKS
  return TOOLS[/** @type {keyof typeof TOOLS} */ (mechanism)]
}

/**
 * One line per row, as the brief and doctor show it:
 * `api (dotnet) internal gateway: in-memory (targeted), testcontainers (walking skeleton) — Testcontainers; source plugin`.
 * @param {Component} component @returns {string[]}
 */
export const policyLines = (component) => effectivePolicy(component).map((row) => policyLine(component, row))

/** @param {Component} component @param {PolicyRow} row */
const policyLine = ({ name, stack }, { row, tool, source, ...stages }) => {
  const mechanisms = Object.entries(stages).map(([stage, mechanism]) => `${mechanism} (${STAGE_LABELS[/** @type {Stage} */ (stage)]})`).join(', ')
  return `${name} (${stack}) ${ROW_LABELS[row]}: ${mechanisms}${tool === null ? '' : ` — ${tool}`}; source ${source}`
}

/** Whether a row of the component's policy runs on a container: Docker or Podman must answer. @param {Component} component */
export const needsContainers = (component) => effectivePolicy(component).some((row) => STAGES.some((stage) => CONTAINERS.includes(String(row[stage]))))

/**
 * The rows a component overrides, checked against its stack's rows; {} when it overrides none.
 * @param {unknown} infrastructure @param {{ stack: unknown, label: string }} component @param {string[]} errors
 * @returns {Infrastructure}
 */
export const infrastructureOf = (infrastructure = {}, { stack, label }, errors) => {
  const rows = rowsOf(stack).filter(({ row }) => row !== SET_BY_MOCKING)
  if (!isRecord(infrastructure)) {
    errors.push(`${label}: infrastructure must be an object of rows (allowed: ${rows.map(({ row }) => row).join(', ')})`)
    return {}
  }
  for (const [row, stages] of Object.entries(infrastructure)) checkRow({ row, stages, rows, label }, errors)
  return infrastructure
}

/**
 * @param {{ row: string, stages: unknown, rows: ReadonlyArray<RowDefinition>, label: string }} written
 * @param {string[]} errors
 */
const checkRow = ({ row, stages, rows, label }, errors) => {
  const definition = rows.find((candidate) => candidate.row === row)
  if (row === SET_BY_MOCKING) errors.push(`${label}: infrastructure.${row} is set by mocking.strategy; write "mocking": { "strategy": ... } instead`)
  else if (definition === undefined) errors.push(`${label}: unknown infrastructure row ${row} (allowed: ${rows.map((candidate) => candidate.row).join(', ')})`)
  else checkStages({ at: `${label}: infrastructure.${row}`, stages, fields: fieldsOf(definition) }, errors)
}

/** The stages a row takes. @param {RowDefinition} definition */
const fieldsOf = (definition) => Object.keys('stages' in definition ? definition.stages : definition.byMocking.microcks)

/**
 * @param {{ at: string, stages: unknown, fields: string[] }} written
 * @param {string[]} errors
 */
const checkStages = ({ at, stages, fields }, errors) => {
  if (!isRecord(stages)) {
    errors.push(`${at} must be an object of ${fields.join(', ')}`)
    return
  }
  for (const [field, mechanism] of Object.entries(stages)) {
    if (!fields.includes(field)) errors.push(`${at}: unknown field ${field} (allowed: ${fields.join(', ')})`)
    else if (!MECHANISMS.includes(/** @type {Mechanism} */ (mechanism))) errors.push(`${at}.${field} must be one of ${MECHANISMS.join(', ')}`)
  }
}

/** @param {unknown} value @returns {value is Record<string, any>} */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The runners whose test command writes no JUnit report unless told to, what tells them, and the
 * option to add.
 */
const REPORTING = Object.freeze([
  Object.freeze({ runs: /\bdotnet\s+test\b/, writes: /--logger\b/, add: '--logger trx' }),
  Object.freeze({ runs: /\bpytest\b/, writes: /--junit-?xml\b/, add: '--junitxml=reports/junit.xml' }),
  Object.freeze({ runs: /\bvitest\b/, writes: /junit/, add: '--reporter=default --reporter=junit --outputFile.junit=reports/junit.xml' }),
  Object.freeze({ runs: /\bjest\b/, writes: /junit/, add: 'the jest-junit reporter (--reporters=default --reporters=jest-junit)' }),
])

/**
 * What a component's test command lacks to write the JUnit report the engine reads when it
 * replays a commit; null when it writes one, has none, or runs a runner nothing tells apart.
 * @param {Component} component @returns {string | null}
 */
export const missingReport = ({ commands }) => {
  const line = String(commands.test)
  return REPORTING.find(({ runs, writes }) => runs.test(line) && !writes.test(line))?.add ?? null
}
