import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createConfigureComponents } from '../../../../plugins/skraft-framework/engine/application/configure-components.mjs'
import { InMemoryWorkspace } from '../support/in-memory-host.mjs'

const configure = (files, request = {}) => {
  const workspace = new InMemoryWorkspace(files)
  return { workspace, outcome: createConfigureComponents({ workspace }).configure({ workingCopyName: 'PaymentAuthorization', ...request }) }
}

const REACT = JSON.stringify({ scripts: { build: 'vite build', lint: 'eslint .', test: 'vitest run' }, dependencies: { react: '^19.0.0' }, devDependencies: { vitest: '^3.0.0' } })

test('a .NET repository alone gives one component with the .NET default commands', async () => {
  const { workspace, outcome } = configure({
    'PaymentAuthorization.slnx': '<Solution />',
    'src/Payment.Domain/Payment.Domain.csproj': '<Project />',
    'tests/Payment.UnitTests/Payment.UnitTests.csproj': '<Project />',
  })

  const result = await outcome

  assert.equal(result.ok, true, result.reason)
  assert.deepEqual(workspace.config(), {
    components: [{
      name: 'payment-authorization',
      root: '.',
      stack: 'dotnet',
      paths: { src: ['src/'], tests: ['tests/'] },
      commands: {
        build: 'dotnet build --nologo',
        test: 'dotnet test --nologo',
        format: 'dotnet format --verify-no-changes',
        mutation: 'dotnet stryker --since:{baseSha}',
      },
    }],
  })
  assert.equal(result.reason, 'skraft-config.json: payment-authorization (dotnet, .)')
})

test('a .NET API and a React front in one working copy give two components', async () => {
  const { workspace, outcome } = configure({
    'services/payment-api/Payment.sln': '',
    'services/payment-api/src/Payment.Api/Payment.Api.csproj': '',
    'web/package.json': REACT,
    'web/src/main.tsx': '',
    'web/node_modules/left-pad/package.json': '{}',
  })

  await outcome

  assert.deepEqual(workspace.config().components.map(({ name, root, stack, paths, commands }) => ({ name, root, stack, paths, commands })), [
    {
      name: 'payment-api', root: 'services/payment-api', stack: 'dotnet', paths: { src: ['src/'], tests: [] },
      commands: { build: 'dotnet build --nologo', test: 'dotnet test --nologo', format: 'dotnet format --verify-no-changes', mutation: 'dotnet stryker --since:{baseSha}' },
    },
    { name: 'web', root: 'web', stack: 'react', paths: { src: ['src/'], tests: ['src/'] }, commands: { build: 'npm run build', lint: 'npm run lint', test: 'npm test' } },
  ])
})

test('a React front inside a .NET solution folder is its own component; a project under a project of its family is not', async () => {
  const { workspace, outcome } = configure({
    'Payment.sln': '',
    'src/Payment.Api/Payment.Api.csproj': '',
    'src/web/package.json': REACT,
  })

  await outcome

  assert.deepEqual(workspace.config().components.map(({ name, root, stack }) => [name, root, stack]), [
    ['payment-authorization', '.', 'dotnet'],
    ['web', 'src/web', 'react'],
  ])
})

test('a neighbour repository named at init becomes a component with its root relative to the working copy', async () => {
  const { workspace, outcome } = configure({
    'Payment.sln': '',
    '../payment-web/package.json': JSON.stringify({ devDependencies: { typescript: '^5.6.0', vitest: '^3.0.0' } }),
    '../payment-web/src/index.ts': '',
  }, { folders: ['../payment-web/'] })

  await outcome

  assert.deepEqual(workspace.config().components.map(({ name, root, stack, commands }) => [name, root, stack, commands]), [
    ['payment-authorization', '.', 'dotnet', { build: 'dotnet build --nologo', test: 'dotnet test --nologo', format: 'dotnet format --verify-no-changes', mutation: 'dotnet stryker --since:{baseSha}' }],
    ['payment-web', '../payment-web', 'typescript', { build: 'npx tsc --noEmit', test: 'npx vitest run' }],
  ])
})

test('Java, Python and plain JavaScript projects get their own stacks, paths and commands', async () => {
  const { workspace, outcome } = configure({
    'payment-spring/pom.xml': '<project><modules><module>payment-domain</module><module>payment-app</module><module>payment-unit-test</module></modules></project>',
    'payment-spring/payment-domain/pom.xml': '<project />',
    'payment-fastapi/pyproject.toml': '[project]\nname = "payment"\n',
    'payment-fastapi/src/payment/__init__.py': '',
    'payment-fastapi/tests/test_payment.py': '',
    'scripts/package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
  })

  await outcome

  assert.deepEqual(workspace.config().components.map(({ name, stack, paths, commands }) => [name, stack, paths, commands]), [
    ['payment-fastapi', 'python', { src: ['src/'], tests: ['tests/'] }, { build: 'python -m compileall -q src', test: 'python -m pytest -q -p no:cacheprovider' }],
    ['payment-spring', 'java', { src: ['payment-domain/', 'payment-app/'], tests: ['payment-unit-test/'] }, { build: 'mvn -B -q -DskipTests package', test: 'mvn -B -q test' }],
    ['scripts', 'javascript', { src: ['./'], tests: ['./'] }, { test: 'npm test' }],
  ])
})

test('init keeps every component and key the developer wrote, and adds only the projects not listed yet', async () => {
  const written = {
    trackingLayout: 'namespaced',
    baseBranch: 'develop',
    components: [{ name: 'api', root: 'services/payment-api', stack: 'dotnet', commands: { test: 'dotnet test --filter Category!=Slow' } }],
  }
  const { workspace, outcome } = configure({
    'skraft-config.json': JSON.stringify(written),
    'services/payment-api/Payment.sln': '',
    'web/package.json': REACT,
  })

  const result = await outcome

  assert.equal(result.ok, true, result.reason)
  assert.deepEqual(workspace.config(), {
    ...written,
    components: [written.components[0], { name: 'web', root: 'web', stack: 'react', paths: { src: ['./'], tests: ['./'] }, commands: { build: 'npm run build', lint: 'npm run lint', test: 'npm test' } }],
  })

  const again = await createConfigureComponents({ workspace }).configure({ workingCopyName: 'x' })
  assert.deepEqual([again.ok, again.reason], [true, 'skraft-config.json already lists every project found (2 components)'])
})

test('an invalid skraft-config.json is reported and left untouched', async () => {
  const { workspace, outcome } = configure({ 'skraft-config.json': '{"components":[{"name":"API","root":"","stack":"cobol"}]}', 'Payment.sln': '' })

  const result = await outcome

  assert.equal(result.ok, false)
  assert.equal(
    result.reason,
    'skraft-config.json is invalid: components[0].name must be kebab-case, got "API"; component API: root must be a path relative to the working copy; component API: stack must be one of dotnet, java, python, typescript, javascript, react',
  )
  assert.equal(await workspace.read('skraft-config.json'), '{"components":[{"name":"API","root":"","stack":"cobol"}]}')
})

test('a Maven or Gradle project that ships its wrapper is built with it', async () => {
  const { workspace, outcome } = configure({ 'orders/pom.xml': '<project />', 'orders/mvnw': '', 'billing/build.gradle.kts': '', 'billing/gradlew': '' })

  await outcome

  assert.deepEqual(workspace.config().components.map(({ name, commands }) => [name, commands]), [
    ['billing', { build: './gradlew build -x test', test: './gradlew test' }],
    ['orders', { build: './mvnw -B -q -DskipTests package', test: './mvnw -B -q test' }],
  ])
})

test('a neighbour folder that is absolute or missing is refused, and nothing is written', async () => {
  const absolute = configure({ 'Payment.sln': '' }, { folders: ['/srv/payment-web'] })
  assert.deepEqual([(await absolute.outcome).ok, (await absolute.outcome).reason], [false, '--add /srv/payment-web is not relative to the working copy'])
  const drive = configure({ 'Payment.sln': '' }, { folders: ['C:\\payment-web'] })
  assert.equal((await drive.outcome).reason, '--add C:\\payment-web is not relative to the working copy')
  const missing = configure({ 'Payment.sln': '' }, { folders: ['../payment-web'] })
  assert.deepEqual([(await missing.outcome).reason, await missing.workspace.read('skraft-config.json')], ['--add ../payment-web is not a folder', null])
})
