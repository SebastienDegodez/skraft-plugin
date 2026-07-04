#!/usr/bin/env node
import { main } from './check-freshness.mjs'

// Thin executable shim (glue, like build-config-bin.mjs): argv → main → exit code.
process.exit(main(process.argv.slice(2)))
