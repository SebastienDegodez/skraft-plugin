#!/usr/bin/env node
import { main } from './resolve-model.mjs'

// Thin executable shim (glue, like hook.mjs): wire argv → main → exit code.
process.exit(main(process.argv.slice(2)))
