// Stands in for the project's `eslint` module: calculateConfigForFile returns the rules of
// .fake-tools.json — `rules` for every file, overridden per file by `rulesByFile`.
import { existsSync, readFileSync } from 'node:fs'
import { relative } from 'node:path'

const defaults = { 'boundaries/dependencies': [2, { default: 'disallow' }], 'boundaries/no-unknown-files': [2] }

export class ESLint {
	constructor({ cwd = process.cwd() } = {}) {
		this.cwd = cwd
		this.scenario = existsSync('.fake-tools.json') ? JSON.parse(readFileSync('.fake-tools.json', 'utf8')) : {}
	}

	async calculateConfigForFile(file) {
		const name = relative(this.cwd, file.startsWith('/') ? file : `${this.cwd}/${file}`).split('\\').join('/')
		return { rules: this.scenario.rulesByFile?.[name] ?? this.scenario.rules ?? defaults }
	}
}
