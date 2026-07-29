#!/usr/bin/env node
import { main } from './build-config.mjs'

// Thin executable shim (glue, like resolve-model-bin.mjs): argv → main → exit code.
process.exit(main(process.argv.slice(2)))
