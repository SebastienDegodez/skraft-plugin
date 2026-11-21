// Pure rules of `/skraft-init`: the components a working copy holds and the mutation settings,
// written into skraft-config.json without touching anything else the developer wrote. A minimal
// port of SKRAFT v2's init (stack detection, component naming, merge), mutation only for now.

const SOLUTION = /\.(sln|slnx)$/i
const PROJECT = /\.(csproj|fsproj|vbproj)$/i
const JAVA_MARKERS = ['pom.xml', 'build.gradle', 'build.gradle.kts']
const PYTHON_MARKERS = ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt']
const JS_STACKS = ['react', 'typescript', 'javascript']

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value) => typeof value === 'string' && value.trim().length > 0

function manifest(content) {
	try {
		const json = JSON.parse(content)
		return object(json) ? json : {}
	} catch {
		return {}
	}
}

function javascriptStack(content) {
	const json = manifest(content)
	const dependencies = { ...json.dependencies, ...json.devDependencies }
	if ('react' in dependencies) return 'react'
	return 'typescript' in dependencies || 'vitest' in dependencies ? 'typescript' : 'javascript'
}

// The stack a folder is the project of, from the markers it holds, or null. First found wins.
// folder: { files: names of its files, read: (name) => text of one of them or null }.
export function detectStack({ files, read }) {
	if (files.some((name) => SOLUTION.test(name) || PROJECT.test(name))) return 'dotnet'
	if (JAVA_MARKERS.some((name) => files.includes(name))) return 'java'
	if (PYTHON_MARKERS.some((name) => files.includes(name))) return 'python'
	if (files.includes('package.json')) return javascriptStack(read('package.json'))
	return null
}

// Stacks of one family share a project tree: a package.json under a React app is that app's.
export const familyOf = (stack) => (JS_STACKS.includes(stack) ? 'js' : stack)

// A component name from a folder name: kebab-case, `app` when nothing is left.
export function componentName(folderName) {
	const name = folderName
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
	return name === '' ? 'app' : name
}

// found: [{ root, stack }] as the walk met them. Adds those whose root no component holds yet,
// named after their folder with a name no component holds yet; every other key stays.
export function addComponents(raw, found, workingCopyName) {
	const listed = Array.isArray(raw?.components) ? raw.components : []
	const roots = new Set(listed.map((component) => component?.root))
	const names = new Set(listed.map((component) => component?.name))
	const added = []
	for (const { root, stack } of found) {
		if (roots.has(root)) continue
		roots.add(root)
		const base = componentName(root === '.' ? workingCopyName : root.split('/').at(-1))
		let name = base
		for (let index = 2; names.has(name); index += 1) name = `${base}-${index}`
		names.add(name)
		added.push({ name, root, stack })
	}
	return { config: { ...raw, components: [...listed, ...added] }, added }
}

// Sets `mutation.pipeline` (true: DELIVER runs G6; false: the developer runs /skraft-mutation)
// and each named component's `commands.mutation`. Returns a new config, or null with problems.
export function setMutation(raw, { pipeline, commands }) {
	const problems = []
	if (typeof pipeline !== 'boolean') problems.push('pipeline is true or false')
	if (raw.components !== undefined && !Array.isArray(raw.components)) problems.push('components must be a list')
	const components = Array.isArray(raw.components) ? raw.components.map((component) => ({ ...component })) : []
	for (const { component, command } of commands) {
		const entry = components.find((candidate) => candidate.name === component)
		if (!entry) problems.push(`${component} is not a component of skraft-config.json; run init components first`)
		else if (!text(command)) problems.push(`${component}: the mutation command is empty`)
		else entry.commands = { ...entry.commands, mutation: command.trim() }
	}
	if (problems.length) return { config: null, problems }
	return { config: { ...raw, components, mutation: { ...(object(raw.mutation) ? raw.mutation : {}), pipeline } }, problems }
}
