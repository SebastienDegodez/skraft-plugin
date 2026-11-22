import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScriptedMachine } from '../support/in-memory-host.mjs'
import { agent, API, green, scripted, SLUG, reworkCycle, TRACKING } from '../support/pipeline-host.mjs'

const upToDeliver = (it) => [agent()(it), agent()(it), agent()(it)]
const reportOf = (host) => host.tracking.files.get(`${SLUG}/run-report.md`)
const sectionOf = (report, title) => report.split(`\n${title}\n\n`)[1].split(/\n\n(?=## |Started at )/)[0]
