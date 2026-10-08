import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { BUNDLES, pluginRoot } from '../../../scripts/sync-skill-copies.mjs'

// Each copy bundled in a skill must pass the very suite that proves the plugin CLI.
const suites = {
	'src/cli/qg-verify.mjs': { variable: 'SKRAFT_QG_VERIFY_CLI', files: ['../quality-gates/qg-verify.acceptance.test.mjs'], cli: 'cli/qg-verify.mjs' },
	'src/cli/report.mjs': {
		variable: 'SKRAFT_REPORT_CLI',
		files: ['../reporting/report-cli.acceptance.test.mjs', '../reporting/report-mcp-cli.acceptance.test.mjs', '../reporting/report-mcp-recovery.acceptance.test.mjs'],
		cli: 'cli/report.mjs',
	},
}

for (const { entry, targets } of BUNDLES) {
	const suite = suites[entry]
	for (const target of targets) {
		test(`${target} passes the acceptance suite of ${entry}`, () => {
			const files = suite.files.map((file) => fileURLToPath(new URL(file, import.meta.url)))
			// Inside a test, NODE_TEST_CONTEXT makes a nested `node --test` run nothing and exit 0.
			const env = { ...process.env, [suite.variable]: join(pluginRoot, target, suite.cli) }
			delete env.NODE_TEST_CONTEXT
			const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { encoding: 'utf8', env })
			const summary = run.stdout.split('\n').filter((line) => /^not ok|^# (pass|fail)/.test(line.trim())).join('\n')
			assert.equal(run.status, 0, summary + run.stderr.slice(-2000))
			assert.match(run.stdout, /^# pass [1-9]\d*$/m, `the suite ran no test:\n${run.stdout.slice(-2000)}${run.stderr.slice(-2000)}`)
			assert.match(run.stdout, /^# fail 0$/m)
		})
	}
}
