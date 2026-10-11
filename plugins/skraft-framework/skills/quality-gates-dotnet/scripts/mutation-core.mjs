#!/usr/bin/env node
// mutation-core.mjs -- run the checked-in core Stryker config against the whole solution.
// The bar (100) is a literal here, never a caller argument.
import { isEntry, main } from './dotnet-toolchain.mjs'
import { runMutationGate } from './run-mutation-gate.mjs'

export const runCoreGate = (argv) => runMutationGate(argv, {
	expected: 100,
	scope: 'Domain,Application',
	prefix: 'qg-mutation',
	configName: 'stryker-config-core.json',
	reportName: 'mutation-report',
	script: 'mutation-core.mjs',
})

if (isEntry(import.meta.url)) await main(() => runCoreGate(process.argv.slice(2)))
