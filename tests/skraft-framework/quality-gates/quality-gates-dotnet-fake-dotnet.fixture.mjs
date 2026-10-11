// A fake `dotnet` for the .NET gate scripts, run through SKRAFT_DOTNET on every OS.
//   stryker --help / init / run: behaves like Stryker.NET 4.14 where the scripts depend on it.
//   test: copies FAKE_DOTNET_COVERAGE_REPORTS (JSON array of Cobertura files) into
//         --results-directory and exits FAKE_DOTNET_TEST_EXIT.
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

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
if (args[0] !== 'stryker') process.exit(90)
// Like Stryker.NET 4.14: --version expects a value (the dashboard project version).
if (args[1] === '--version') { process.stderr.write("Missing value for option 'version'\n"); process.exit(1) }
if (args[1] === '--help') { process.stdout.write('Stryker.NET\n'); process.exit(0) }

if (args[1] === 'init') {
	appendFileSync(process.env.FAKE_DOTNET_INIT_LOG, `${args.join(' ')}\n`)
	const rest = args.slice(2)
	const values = (name) => rest.flatMap((arg, index) => (arg === name ? [rest[index + 1]] : []))
	const config = option('--config-file')
	mkdirSync(dirname(config), { recursive: true })
	// Like Stryker.NET 4.14 init: unset options come out as "" and null.
	writeFileSync(config, `${JSON.stringify({
		'stryker-config': {
			'project-info': { name: '', module: '', version: '' },
			project: '',
			'test-runner': null,
			solution: option('--solution'),
			mutate: values('--mutate'),
			thresholds: { high: Number(option('--threshold-high')), low: Number(option('--threshold-low')), break: Number(option('--break-at')) },
			reporters: values('--reporter'),
			'report-file-name': 'mutation-report',
			'break-on-initial-test-failure': rest.includes('--break-on-initial-test-failure'),
		},
	}, null, 2)}\n`)
	process.exit(0)
}

const config = option('--config-file')
const output = option('--output')
appendFileSync(process.env.FAKE_DOTNET_LOG, `${process.cwd()}\t${config}\t${output}\n`)
const text = readFileSync(config, 'utf8')
// Like Stryker.NET 4.14: an empty project or module name aborts the run.
if (/"(project|module)": *""/.test(text)) { process.stderr.write('Project file cannot be empty.\n'); process.exit(1) }
const reportName = JSON.parse(text)['stryker-config']['report-file-name']
mkdirSync(join(output, 'reports'), { recursive: true })
const name = basename(config)
if (name !== process.env.FAKE_DOTNET_NO_REPORT_CONFIG) {
	const target = join(output, 'reports', `${reportName}.json`)
	if (name === process.env.FAKE_DOTNET_EMPTY_REPORT_CONFIG) {
		const report = JSON.parse(readFileSync(process.env.FAKE_DOTNET_REPORT_FIXTURE, 'utf8'))
		report.files = {}
		writeFileSync(target, JSON.stringify(report))
	} else copyFileSync(process.env.FAKE_DOTNET_REPORT_FIXTURE, target)
}
process.exit(name === process.env.FAKE_DOTNET_FAIL_CONFIG ? 1 : 0)
