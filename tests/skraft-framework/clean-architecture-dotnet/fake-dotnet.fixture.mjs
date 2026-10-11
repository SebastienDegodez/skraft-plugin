// Records every dotnet call; `new … -o <dir>` creates the directory with a Class1.cs.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_DOTNET_LOG, `${JSON.stringify(args)}\n`)
const output = args.indexOf('-o')
if (args[0] === 'new' && output > 0) {
	mkdirSync(args[output + 1], { recursive: true })
	writeFileSync(join(args[output + 1], 'Class1.cs'), '')
}
process.exit(Number(process.env.FAKE_DOTNET_EXIT ?? 0))
