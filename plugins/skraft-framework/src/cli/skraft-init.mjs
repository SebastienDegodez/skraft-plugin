#!/usr/bin/env node
// `/skraft-init` writes skraft-config.json at the root of the working copy, never overwriting
// what the developer wrote:
//
//   node skraft-init.mjs components
//     one component per project found (3 levels deep, hidden folders and node_modules aside)
//   node skraft-init.mjs mutation --pipeline <true|false> [--set <component>=<command>]...
//     true: DELIVER runs G6 on every story; false: the developer runs /skraft-mutation
//
// Run it from the root of the working copy. Exit: 0 written · 2 refused, nothing written.
import { realpathSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addComponents, detectStack, familyOf, setMutation } from '../domain/config-init-policy.mjs'

const CONFIG_FILE = 'skraft-config.json'
const DEPTH = 3
const USAGE = 'usage: skraft-init.mjs components | mutation --pipeline <true|false> [--set <component>=<command>]...'

class Refusal extends Error {}

async function readConfig(cwd) {
	const content = await readFile(join(cwd, CONFIG_FILE), 'utf8').catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)))
	if (content === null) return {}
	try {
		return JSON.parse(content)
	} catch {
		throw new Refusal(`${CONFIG_FILE} is not valid JSON; fix it by hand first`)
	}
}

const writeConfig = (cwd, config) => writeFile(join(cwd, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`)

// The projects under cwd: a folder holding a marker is one; a folder below it is another only
// when its stack family differs (a React front end under a .NET solution).
async function projects(cwd) {
	const found = []
	const visit = async (relative, depth, families) => {
		const entries = await readdir(join(cwd, relative), { withFileTypes: true })
		const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
		const manifest = files.includes('package.json') ? await readFile(join(cwd, relative, 'package.json'), 'utf8').catch(() => null) : null
		const stack = detectStack({ files, read: () => manifest })
		let below = families
		if (stack !== null && !families.includes(familyOf(stack))) {
			found.push({ root: relative, stack })
			below = [...families, familyOf(stack)]
		}
		if (depth >= DEPTH) return
		const folders = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules').map((entry) => entry.name).sort()
		for (const name of folders) await visit(relative === '.' ? name : `${relative}/${name}`, depth + 1, below)
	}
	await visit('.', 0, [])
	return found
}

async function components(cwd) {
	const raw = await readConfig(cwd)
	if (raw.components !== undefined && !Array.isArray(raw.components)) throw new Refusal('components must be a list')
	const { config, added } = addComponents(raw, await projects(cwd), basename(cwd))
	if (added.length === 0 && Array.isArray(raw.components)) return [`${CONFIG_FILE}: every project found is already listed (${raw.components.length} components)`]
	await writeConfig(cwd, config)
	return [`${CONFIG_FILE}: ${added.length ? `added: ${added.map(({ name, stack, root }) => `${name} (${stack}, ${root})`).join(', ')}` : 'no project found'}`]
}

function parseMutation(argv) {
	let pipeline
	const commands = []
	for (let index = 0; index < argv.length; index += 2) {
		const [flag, value] = [argv[index], argv[index + 1]]
		if (value === undefined) throw new Refusal(USAGE)
		if (flag === '--pipeline') pipeline = value === 'true' ? true : value === 'false' ? false : value
		else if (flag === '--set') {
			const at = value.indexOf('=')
			if (at < 1) throw new Refusal(`--set takes <component>=<command>: ${value}`)
			commands.push({ component: value.slice(0, at), command: value.slice(at + 1) })
		} else throw new Refusal(USAGE)
	}
	return { pipeline, commands }
}

async function mutation(cwd, argv) {
	const { config, problems } = setMutation(await readConfig(cwd), parseMutation(argv))
	if (problems.length) throw new Refusal(problems.join('; '))
	await writeConfig(cwd, config)
	const declared = config.components.filter((component) => component.commands?.mutation).map(({ name, commands }) => `${name}: ${commands.mutation}`)
	return [
		config.mutation.pipeline ? 'mutation: in the pipeline, G6 runs on every story' : 'mutation: not in the pipeline; the developer runs /skraft-mutation',
		...(declared.length ? declared : ['no component declares commands.mutation yet']),
	]
}

export async function runInit(argv, { cwd = process.cwd() } = {}) {
	try {
		const [command, ...rest] = argv
		if (command === 'components' && rest.length === 0) return { exitCode: 0, lines: await components(cwd) }
		if (command === 'mutation') return { exitCode: 0, lines: await mutation(cwd, rest) }
		throw new Refusal(USAGE)
	} catch (error) {
		if (!(error instanceof Refusal)) throw error
		return { exitCode: 2, lines: [`skraft init refused: ${error.message}`] }
	}
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
	const result = await runInit(process.argv.slice(2))
	process.stdout.write(`${result.lines.join('\n')}\n`)
	process.exitCode = result.exitCode
}
