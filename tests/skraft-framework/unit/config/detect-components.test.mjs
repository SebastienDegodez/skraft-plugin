import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createConfigureComponents } from '../../../../plugins/skraft-framework/engine/application/config/configure-components-usecase.mjs'
import { InMemoryUserSettings, InMemoryWorkspace } from '../support/in-memory-host.mjs'

const configure = async (files, request = {}) => {
  const workspace = new InMemoryWorkspace(files)
  const result = await createConfigureComponents({ workspace, userSettings: new InMemoryUserSettings() }).configure({ workingCopyName: 'PaymentAuthorization', ...request })
  return { workspace, result }
}

/** The components init writes to skraft-config.json for these files. */
const proposed = async (files, request) => (await configure(files, request)).workspace.config().components

const REACT = JSON.stringify({ scripts: { build: 'vite build', lint: 'eslint .', test: 'vitest run' }, dependencies: { react: '^19.0.0' }, devDependencies: { vitest: '^3.0.0' } })
const DOTNET_COMMANDS = { build: 'dotnet build --nologo', test: 'dotnet test --nologo', format: 'dotnet format --verify-no-changes', mutation: 'dotnet stryker --since:{baseSha}' }
const PYTHON_COMMANDS = { build: 'python -m compileall -q .', test: 'python -m pytest -q -p no:cacheprovider' }

test('a .NET repository alone gives one component with the .NET default commands', async () => {
  const { workspace, result } = await configure({
    'PaymentAuthorization.slnx': '<Solution />',
    'src/Payment.Domain/Payment.Domain.csproj': '<Project />',
    'tests/Payment.UnitTests/Payment.UnitTests.csproj': '<Project />',
  })

  assert.equal(result.ok, true, result.reason)
  assert.deepEqual(workspace.config(), {
    components: [{ name: 'payment-authorization', root: '.', stack: 'dotnet', paths: { src: ['src/'], tests: ['tests/'] }, commands: DOTNET_COMMANDS }],
  })
  assert.equal(result.reason, 'skraft-config.json: payment-authorization (dotnet, .)')
})

test('a .NET API and a React front in one working copy give two components', async () => {
  const components = await proposed({
    'services/payment-api/Payment.sln': '',
    'services/payment-api/src/Payment.Api/Payment.Api.csproj': '',
    'web/package.json': REACT,
    'web/src/main.tsx': '',
    'web/node_modules/left-pad/package.json': '{}',
  })

  assert.deepEqual(components.map(({ name, root, stack, paths, commands }) => ({ name, root, stack, paths, commands })), [
    {
      name: 'payment-api', root: 'services/payment-api', stack: 'dotnet', paths: { src: ['src/'], tests: [] },
      commands: DOTNET_COMMANDS,
    },
    { name: 'web', root: 'web', stack: 'react', paths: { src: ['src/'], tests: ['src/'] }, commands: { build: 'npm run build', lint: 'npm run lint', test: 'npm test' } },
  ])
})

test('a React front inside a .NET solution folder is its own component; a project under a project of its family is not', async () => {
  const components = await proposed({
    'Payment.sln': '',
    'src/Payment.Api/Payment.Api.csproj': '',
    'src/web/package.json': REACT,
    'src/web/ui/package.json': '{}',
    'src/web/ui/tsconfig.json': '{}',
    'src/web/scripts/package.json': '{}',
    'src/payment-web/package.json': '{}',
    'src/payment-web/tsconfig.json': '{}',
    'src/payment-web/admin/package.json': REACT,
  })

  assert.deepEqual(components.map(({ name, root, stack }) => [name, root, stack]), [
    ['payment-authorization', '.', 'dotnet'],
    ['payment-web', 'src/payment-web', 'typescript'],
    ['web', 'src/web', 'react'],
  ])
})

test('a neighbour repository named at init becomes a component with its root relative to the working copy', async () => {
  const components = await proposed({
    'Payment.sln': '',
    '../payment-web/package.json': JSON.stringify({ devDependencies: { typescript: '^5.6.0', vitest: '^3.0.0' } }),
    '../payment-web/src/index.ts': '',
  }, { folders: ['../payment-web/'] })

  assert.deepEqual(components.map(({ name, root, stack, commands }) => [name, root, stack, commands]), [
    ['payment-authorization', '.', 'dotnet', DOTNET_COMMANDS],
    ['payment-web', '../payment-web', 'typescript', { build: 'npx tsc --noEmit', test: 'npx vitest run' }],
  ])
})

test('Java, Python and plain JavaScript projects get their own stacks, paths and commands', async () => {
  const components = await proposed({
    'payment-spring/pom.xml': '<project><modules><module>payment-domain</module><module>payment-app</module><module>payment-unit-test</module><module>tests</module></modules></project>',
    'payment-spring/payment-domain/pom.xml': '<project />',
    'payment-fastapi/pyproject.toml': '[project]\nname = "payment"\n',
    'payment-fastapi/src/payment/__init__.py': '',
    'payment-fastapi/tests/test_payment.py': '',
    'scripts/package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
  })

  assert.deepEqual(components.map(({ name, stack, paths, commands }) => [name, stack, paths, commands]), [
    ['payment-fastapi', 'python', { src: ['src/'], tests: ['tests/'] }, { build: 'python -m compileall -q src', test: 'python -m pytest -q -p no:cacheprovider' }],
    ['payment-spring', 'java', { src: ['payment-domain/', 'payment-app/'], tests: ['payment-unit-test/', 'tests/'] }, { build: 'mvn -B -q -DskipTests package', test: 'mvn -B -q test' }],
    ['scripts', 'javascript', { src: ['./'], tests: ['./'] }, { test: 'npm test' }],
  ])
})

test('init keeps every component and key the developer wrote, and adds only the projects not listed yet', async () => {
  const written = {
    trackingLayout: 'namespaced',
    baseBranch: 'develop',
    components: [{ name: 'api', root: 'services/payment-api', stack: 'dotnet', commands: { test: 'dotnet test --filter Category!=Slow' } }],
  }
  const { workspace, result } = await configure({
    'skraft-config.json': JSON.stringify(written),
    'services/payment-api/Payment.sln': '',
    'web/package.json': REACT,
    'tools/api/package.json': '{}',
  })

  assert.equal(result.ok, true, result.reason)
  assert.deepEqual(workspace.config(), {
    ...written,
    components: [
      written.components[0],
      { name: 'api-2', root: 'tools/api', stack: 'javascript', paths: { src: ['./'], tests: ['./'] }, commands: {} },
      { name: 'web', root: 'web', stack: 'react', paths: { src: ['./'], tests: ['./'] }, commands: { build: 'npm run build', lint: 'npm run lint', test: 'npm test' } },
    ],
  })

  const again = await createConfigureComponents({ workspace, userSettings: new InMemoryUserSettings() }).configure({ workingCopyName: 'x' })
  assert.deepEqual([again.ok, again.reason], [true, 'skraft-config.json already lists every project found (3 components)'])
})

test('init lists the developer\'s skraft-config.local.json in .gitignore once, creating the file or adding a line to it', async () => {
  const created = await configure({ 'Payment.sln': '' })
  const appended = await configure({ 'Payment.sln': '', '.gitignore': 'bin/\nobj/' })
  const kept = await configure({ 'Payment.sln': '', '.gitignore': 'bin/\r\n  /skraft-config.local.json\r\n' })

  assert.equal(await created.workspace.read('.gitignore'), 'skraft-config.local.json\n')
  assert.equal(await appended.workspace.read('.gitignore'), 'bin/\nobj/\nskraft-config.local.json\n')
  assert.equal(await kept.workspace.read('.gitignore'), 'bin/\r\n  /skraft-config.local.json\r\n')
  await createConfigureComponents({ workspace: created.workspace, userSettings: new InMemoryUserSettings() }).configure({ workingCopyName: 'x' })
  assert.equal(await created.workspace.read('.gitignore'), 'skraft-config.local.json\n')
  const empty = await configure({ 'Payment.sln': '', '.gitignore': '' })
  assert.equal(await empty.workspace.read('.gitignore'), 'skraft-config.local.json\n')
  const ended = await configure({ 'Payment.sln': '', '.gitignore': 'bin/\n' })
  assert.equal(await ended.workspace.read('.gitignore'), 'bin/\nskraft-config.local.json\n')
  const listedFirst = await configure({ 'Payment.sln': '', '.gitignore': 'skraft-config.local.json\nbin/\n' })
  assert.equal(await listedFirst.workspace.read('.gitignore'), 'skraft-config.local.json\nbin/\n')
})

test('an invalid skraft-config.json is reported and left untouched', async () => {
  const { workspace, result } = await configure({ 'skraft-config.json': '{"components":[{"name":"API","root":"","stack":"cobol"}]}', 'Payment.sln': '' })

  assert.equal(result.ok, false)
  assert.equal(
    result.reason,
    'skraft-config.json is invalid: components[0].name must be kebab-case, got "API"; component API: root must be a path relative to the working copy; component API: stack must be one of dotnet, java, python, typescript, javascript, react',
  )
  assert.equal(await workspace.read('skraft-config.json'), '{"components":[{"name":"API","root":"","stack":"cobol"}]}')
  assert.equal(await workspace.read('.gitignore'), null)
})

test('a Maven or Gradle project that ships its wrapper is built with it', async () => {
  const components = await proposed({ 'orders/pom.xml': '<project />', 'orders/mvnw': '', 'billing/build.gradle.kts': '', 'billing/gradlew': '' })

  assert.deepEqual(components.map(({ name, paths, commands }) => [name, paths, commands]), [
    ['billing', { src: ['src/main/'], tests: ['src/test/'] }, { build: './gradlew build -x test', test: './gradlew test' }],
    ['orders', { src: ['src/main/'], tests: ['src/test/'] }, { build: './mvnw -B -q -DskipTests package', test: './mvnw -B -q test' }],
  ])
})

test('a neighbour folder that is absolute or missing is refused, and nothing is written', async () => {
  const absolute = await configure({ 'Payment.sln': '' }, { folders: ['/srv/payment-web'] })
  assert.deepEqual([absolute.result.ok, absolute.result.reason], [false, '--add /srv/payment-web is not relative to the working copy'])
  const drive = await configure({ 'Payment.sln': '' }, { folders: ['C:\\payment-web'] })
  assert.equal(drive.result.reason, '--add C:\\payment-web is not relative to the working copy')
  const missing = await configure({ 'Payment.sln': '' }, { folders: ['../payment-web'] })
  assert.deepEqual([missing.result.reason, await missing.workspace.read('skraft-config.json')], ['--add ../payment-web is not a folder', null])
})

const NO_COMMANDS = {}
for (const [behaviour, files, expected] of [
  ['a setup.py without a src folder is a Python project built from its root', { 'setup.py': '' },
    { stack: 'python', paths: { src: ['./'], tests: [] }, commands: PYTHON_COMMANDS }],
  ['a setup.cfg is a Python project; its test folder holds the tests', { 'setup.cfg': '', 'test/test_payment.py': '' },
    { stack: 'python', paths: { src: ['./'], tests: ['test/'] }, commands: PYTHON_COMMANDS }],
  ['a requirements.txt is a Python project', { 'requirements.txt': '' },
    { stack: 'python', paths: { src: ['./'], tests: [] }, commands: PYTHON_COMMANDS }],
  ['a build.gradle without a wrapper is a Java project built with gradle in the Maven layout', { 'build.gradle': '' },
    { stack: 'java', paths: { src: ['src/main/'], tests: ['src/test/'] }, commands: { build: 'gradle build -x test', test: 'gradle test' } }],
  ['a .csproj without a solution is a .NET project; its test folder holds the tests', { 'Payment.csproj': '', 'test/PaymentTests.cs': '' },
    { stack: 'dotnet', paths: { src: ['./'], tests: ['test/'] }, commands: DOTNET_COMMANDS }],
  ['a tsconfig.json makes a package TypeScript, type-checked and without a test command', { 'package.json': '{}', 'tsconfig.json': '{}' },
    { stack: 'typescript', paths: { src: ['./'], tests: ['./'] }, commands: { build: 'npx tsc --noEmit' } }],
  ['a package with jest is tested with jest, from its __tests__ folder', { 'package.json': JSON.stringify({ devDependencies: { jest: '^29.0.0' } }), '__tests__/pay.test.js': '' },
    { stack: 'javascript', paths: { src: ['./'], tests: ['__tests__/'] }, commands: { test: 'npx jest' } }],
  ['a package keeps its tests in its tests folder', { 'package.json': '{}', 'src/pay.js': '', 'tests/pay.test.js': '' },
    { stack: 'javascript', paths: { src: ['src/'], tests: ['tests/'] }, commands: NO_COMMANDS }],
  ['a package keeps its tests in its test folder', { 'package.json': '{}', 'test/pay.test.js': '' },
    { stack: 'javascript', paths: { src: ['./'], tests: ['test/'] }, commands: NO_COMMANDS }],
  ['a package.json that is not JSON is a JavaScript project without commands', { 'package.json': '{ "name": ' },
    { stack: 'javascript', paths: { src: ['./'], tests: ['./'] }, commands: NO_COMMANDS }],
  ['a file named like a test folder is not a test folder', { 'package.json': '{}', test: '#!/bin/sh' },
    { stack: 'javascript', paths: { src: ['./'], tests: ['./'] }, commands: NO_COMMANDS }],
  ['a folder with the markers of every stack is a .NET project', { 'Payment.sln': '', 'pom.xml': '<project />', 'pyproject.toml': '', 'package.json': '{}' },
    { stack: 'dotnet', paths: { src: ['./'], tests: [] }, commands: DOTNET_COMMANDS }],
  ['without .NET, a Maven project with Python and JavaScript markers is a Java project', { 'pom.xml': '<project />', 'pyproject.toml': '', 'package.json': '{}' },
    { stack: 'java', paths: { src: ['src/main/'], tests: ['src/test/'] }, commands: { build: 'mvn -B -q -DskipTests package', test: 'mvn -B -q test' } }],
  ['without .NET or Java, a Python project with a package.json is a Python project', { 'pyproject.toml': '', 'package.json': '{}' },
    { stack: 'python', paths: { src: ['./'], tests: [] }, commands: PYTHON_COMMANDS }],
  ['a folder named like a project file is not a project', { 'requirements.txt/notes.md': '' }, null],
  ['a backup of a solution is not a project', { 'Payment.sln.bak': '' }, null],
  ['the user settings of a .NET project are not a project', { 'Payment.csproj.user': '' }, null],
]) {
  test(behaviour, async () => {
    const components = await proposed(Object.fromEntries(Object.entries(files).map(([path, text]) => [`payment/${path}`, text])))

    assert.deepEqual(components.map(({ stack, paths, commands }) => ({ stack, paths, commands })), expected === null ? [] : [expected])
  })
}

test('a working copy without any project gets a configuration without components', async () => {
  const { workspace, result } = await configure({ 'README.md': '# Payment' })

  assert.deepEqual([result.ok, result.reason], [true, 'no project found; skraft-config.json lists no component'])
  assert.deepEqual(workspace.config(), { components: [] })
})

test('projects in folders of the same name get numbered names', async () => {
  const { workspace, result } = await configure({ 'web/package.json': '{}', 'apps/web/package.json': '{}', 'tools/web/package.json': '{}' })

  assert.deepEqual(workspace.config().components.map(({ name, root }) => [name, root]), [['web', 'apps/web'], ['web-2', 'tools/web'], ['web-3', 'web']])
  assert.equal(result.reason, 'skraft-config.json: web (javascript, apps/web), web-2 (javascript, tools/web), web-3 (javascript, web)')
})

test('a project more than three folders deep is not proposed', async () => {
  const components = await proposed({ 'services/payment/api/pom.xml': '<project />', 'services/payment/legacy/api/pom.xml': '<project />' })

  assert.deepEqual(components.map(({ root }) => root), ['services/payment/api'])
})

test('installed dependencies and hidden folders are not searched for projects', async () => {
  const components = await proposed({
    'Payment.sln': '',
    'node_modules/left-pad/package.json': '{}',
    '.tools/web/package.json': '{}',
  })

  assert.deepEqual(components.map(({ name, root }) => [name, root]), [['payment-authorization', '.']])
})

for (const [workingCopyName, name] of [['__Payment__Web__', 'payment-web'], ['---', 'app']]) {
  test(`a working copy named ${workingCopyName} gives the component name ${name}`, async () => {
    const components = await proposed({ 'Payment.sln': '' }, { workingCopyName })

    assert.deepEqual(components.map((component) => component.name), [name])
  })
}
