#!/usr/bin/env node
// mutation-boundary.mjs -- run the checked-in boundary Stryker config against the whole solution.
// The bar (80) is a literal here, never a caller argument.
import { isEntry, main } from './dotnet-toolchain.mjs'
import { runMutationGate } from './run-mutation-gate.mjs'

export const runBoundaryGate = (argv) => runMutationGate(argv, {
	expected: 80,
	scope: 'API,Infrastructure',
	prefix: 'qg-mutation-boundary',
	configName: 'stryker-config-boundary.json',
	reportName: 'mutation-report',
	script: 'mutation-boundary.mjs',
})

if (isEntry(import.meta.url)) await main(() => runBoundaryGate(process.argv.slice(2)))
