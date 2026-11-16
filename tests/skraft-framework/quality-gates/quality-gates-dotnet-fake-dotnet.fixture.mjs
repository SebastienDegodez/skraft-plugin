// A fake `dotnet` for the .NET gate scripts, run through SKRAFT_DOTNET on every OS.
//   test: copies FAKE_DOTNET_COVERAGE_REPORTS (JSON array of Cobertura files) into
//         --results-directory and exits FAKE_DOTNET_TEST_EXIT.
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const option = (name) => {
	const index = args.indexOf(name)
	return index >= 0 ? args[index + 1] : undefined
}

if (args[0] === 'test') {
	const results = option('--results-directory')
	JSON.parse(process.env.FAKE_DOTNET_COVERAGE_REPORTS ?? '[]').forEach((report, index) => {
		mkdirSync(join(results, `run-${index + 1}`), { recursive: true })
		copyFileSync(report, join(results, `run-${index + 1}`, 'coverage.cobertura.xml'))
	})
	process.stdout.write('Passed!\n')
	process.exit(Number(process.env.FAKE_DOTNET_TEST_EXIT ?? 0))
}
process.exit(90)
