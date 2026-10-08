#!/usr/bin/env node
// Initializes a Clean Architecture project structure for .NET, from the current directory.
// Node, no shell: the same on Linux, macOS and Windows.
//
// Usage:   node init-project.mjs <ProjectName>
// Example: node init-project.mjs Ordering
// SKRAFT_DOTNET replaces the `dotnet` executable (a .mjs path runs through this Node).
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEMPLATES = fileURLToPath(new URL('../templates/', import.meta.url))
const TEMPLATE_FILES = [
	['Domain/IDomainMarker.cs', 'src/{p}.Domain/IDomainMarker.cs'],
	['Application/IApplicationMarker.cs', 'src/{p}.Application/IApplicationMarker.cs'],
	['Application/Shared/ICommandHandler.cs', 'src/{p}.Application/Shared/ICommandHandler.cs'],
	['Application/Shared/IQueryHandler.cs', 'src/{p}.Application/Shared/IQueryHandler.cs'],
	['Application/Shared/ICommandBus.cs', 'src/{p}.Application/Shared/ICommandBus.cs'],
	['Application/Shared/IQueryBus.cs', 'src/{p}.Application/Shared/IQueryBus.cs'],
	['Infrastructure/IInfrastructureMarker.cs', 'src/{p}.Infrastructure/IInfrastructureMarker.cs'],
	['Infrastructure/CQRS/CommandBus.cs', 'src/{p}.Infrastructure/CQRS/CommandBus.cs'],
	['Infrastructure/CQRS/QueryBus.cs', 'src/{p}.Infrastructure/CQRS/QueryBus.cs'],
	['Infrastructure/DependencyInjection.cs', 'src/{p}.Infrastructure/DependencyInjection.cs'],
	['Api/IApiMarker.cs', 'src/{p}.Api/IApiMarker.cs'],
	['IntegrationTests/ArchitectureTests.cs', 'tests/{p}.IntegrationTests/ArchitectureTests.cs'],
]

function dotnet(args, cwd) {
	const custom = process.env.SKRAFT_DOTNET
	const [command, prefix] = custom && /\.(mjs|cjs|js)$/.test(custom) ? [process.execPath, [custom]] : [custom || 'dotnet', []]
	const result = spawnSync(command, [...prefix, ...args], { cwd, stdio: 'inherit', shell: false })
	if (result.error) throw new Error(`dotnet could not start: ${result.error.message}`)
	if (result.status !== 0) throw new Error(`dotnet ${args.join(' ')} exited ${result.status}`)
}

export function initProject(name, { cwd = process.cwd(), log = (line) => process.stdout.write(`${line}\n`) } = {}) {
	if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name ?? '')) throw new Error('Project name required: a C# identifier such as Ordering')
	const p = (path) => path.replaceAll('{p}', name)
	const project = (layer) => p(`src/{p}.${layer}/{p}.${layer}.csproj`)
	const tests = (kind) => p(`tests/{p}.${kind}/{p}.${kind}.csproj`)

	log(`🚀 Initializing Clean Architecture project: ${name}`)
	log('\n📦 Creating solution...')
	dotnet(['new', 'sln', '-n', name], cwd)

	log('\n📁 Creating source projects...')
	for (const [layer, template] of [['Domain', 'classlib'], ['Application', 'classlib'], ['Infrastructure', 'classlib'], ['Api', 'web']]) {
		dotnet(['new', template, '-n', p(`{p}.${layer}`), '-o', p(`src/{p}.${layer}`), '-f', 'net10.0'], cwd)
		rmSync(join(cwd, p(`src/{p}.${layer}/Class1.cs`)), { force: true })
		dotnet(['sln', 'add', project(layer)], cwd)
	}

	log('\n🧪 Creating test projects...')
	for (const kind of ['UnitTests', 'IntegrationTests']) {
		dotnet(['new', 'xunit', '-n', p(`{p}.${kind}`), '-o', p(`tests/{p}.${kind}`), '-f', 'net10.0'], cwd)
		dotnet(['sln', 'add', tests(kind)], cwd)
	}

	log('\n🔗 Configuring project references...')
	// Each layer references its inner neighbour only; the rest is transitive.
	for (const [from, to] of [
		[project('Application'), project('Domain')],
		[project('Infrastructure'), project('Application')],
		[project('Api'), project('Infrastructure')],
		[tests('UnitTests'), project('Application')],
		[tests('UnitTests'), project('Domain')],
		[tests('IntegrationTests'), project('Api')],
		[tests('IntegrationTests'), project('Domain')],
		[tests('IntegrationTests'), project('Application')],
		[tests('IntegrationTests'), project('Infrastructure')],
	]) dotnet(['add', from, 'reference', to], cwd)

	log('\n📦 Adding NuGet packages...')
	for (const [target, pkg] of [
		[project('Infrastructure'), 'Microsoft.Extensions.DependencyInjection.Abstractions'],
		[tests('IntegrationTests'), 'Microsoft.AspNetCore.Mvc.Testing'],
		[tests('IntegrationTests'), 'NetArchTest.Rules'],
	]) dotnet(['add', target, 'package', pkg], cwd)

	log('\n📂 Creating directory structure...')
	for (const dir of ['src/{p}.Domain/Shared', 'src/{p}.Application/Shared', 'src/{p}.Infrastructure/Shared',
		'tests/{p}.UnitTests/Application', 'tests/{p}.IntegrationTests/Api']) mkdirSync(join(cwd, p(dir)), { recursive: true })

	log('\n📄 Creating marker interfaces, CQRS files and architecture tests from templates...')
	for (const [template, destination] of TEMPLATE_FILES) {
		const target = join(cwd, p(destination))
		mkdirSync(dirname(target), { recursive: true })
		writeFileSync(target, readFileSync(join(TEMPLATES, template), 'utf8').replaceAll('[ProjectName]', name))
	}

	log('\n🔨 Building solution...')
	dotnet(['build'], cwd)
	log(`\n✅ Clean Architecture project ${name} initialized.`)
	log(`Next: business rules in src/${name}.Domain, each feature as a folder in every layer project (src/${name}.Application/<Feature>/, ...),`)
	log("architecture tests with: dotnet test --filter 'FullyQualifiedName~IntegrationTests'")
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
	try {
		if (process.argv.length !== 3) throw new Error('Usage: node init-project.mjs <ProjectName>')
		initProject(process.argv[2])
	} catch (error) {
		process.stderr.write(`❌ ${error.message}\n`)
		process.exitCode = 1
	}
}
