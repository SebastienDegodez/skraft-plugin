#!/usr/bin/env node
// G5 for TypeScript: the layer and feature boundaries. The project's resolved ESLint config
// must hold the boundaries rules as errors for its sources, then ESLint runs on them with no
// warning allowed. A project without those rules fails: clean-architecture-react ships them.
import { realpathSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SOURCE, architectureRuleProblems, parseArgs } from './gate-policy.mjs'
import { ensure, packageRoot, repositoryRoot, resolveBin, runNode, sha256, sourceFiles } from './ts-toolchain.mjs'

export async function runArchitectureGate(input, { run = runNode } = {}) {
	const lines = []
	let exitCode = 2
	let prefix
	try {
		const root = await repositoryRoot(input.root)
		const evidence = resolve(root, input.evidence)
		await mkdir(evidence, { recursive: true })
		prefix = join(evidence, 'qg-arch')
		for (const stale of [`${prefix}.stdout`, `${prefix}.exit`, `${prefix}.stdout.sha256`, prefix]) await rm(stale, { recursive: true, force: true })
		await mkdir(prefix)
		const pkg = await packageRoot(root, input.package)
		const eslint = resolveBin(pkg, 'eslint')
		const src = input.src ?? 'src'
		const sample = (await sourceFiles(pkg, src)).find((name) => SOURCE.test(name) && !/\.d\.[cm]?ts$/.test(name))
		ensure(sample, `No source file under ${src}`)
		exitCode = 1

		const printed = await run(eslint, ['--print-config', sample], { cwd: pkg, stdout: join(prefix, 'print-config.stdout'), stderr: join(prefix, 'print-config.stderr') })
		ensure(printed.code === 0, `eslint --print-config ${sample} failed (exit ${printed.code ?? printed.signal ?? printed.error})`)
		const config = JSON.parse(await readFile(join(prefix, 'print-config.stdout'), 'utf8'))
		const missing = architectureRuleProblems(config.rules)
		ensure(missing.length === 0, `The ESLint config of ${sample} lacks the architecture rules: ${missing.join('; ')}`)

		const lint = await run(eslint, [src, '--max-warnings', '0'], { cwd: pkg, stdout: join(prefix, 'lint.stdout') })
		const output = (await readFile(join(prefix, 'lint.stdout'), 'utf8')).trimEnd()
		if (output) lines.push(...output.split(/\r?\n/).slice(-60))
		ensure(lint.code === 0 && !lint.signal && !lint.error, `ESLint reports architecture or lint errors in ${src} (exit ${lint.code ?? lint.signal ?? lint.error})`)
		lines.push(`boundaries rules active for ${src}; ESLint clean with no warning`)
		exitCode = 0
	} catch (error) {
		lines.push(`architecture gate ${exitCode === 2 ? 'blocked' : 'failed'}: ${error.message}`)
	} finally {
		if (prefix) {
			const text = `${lines.join('\n')}\n`
			await writeFile(`${prefix}.stdout`, text).catch(() => {})
			await writeFile(`${prefix}.exit`, `${exitCode}\n`).catch(() => {})
			await writeFile(`${prefix}.stdout.sha256`, `${sha256(text)}\n`).catch(() => {})
		}
	}
	return { exitCode, lines }
}

async function main() {
	let result
	try {
		const input = parseArgs(process.argv.slice(2), { options: ['root', 'package', 'evidence', 'src'] })
		for (const required of ['root', 'evidence']) ensure(input[required], `--${required} is required`)
		result = await runArchitectureGate(input)
	} catch (error) {
		result = { exitCode: 2, lines: [`architecture gate blocked: ${error.message}`] }
	}
	process.stdout.write(`${result.lines.join('\n')}\n`)
	process.exitCode = result.exitCode
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) await main()
