import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	architectureRuleProblems, coreRoots, coreSourceFiles, hasRuntimeCode, isCoreFile, mockHits,
} from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/gate-policy.mjs'

test('core is any production source under a folder whose last word is domain or application', () => {
	for (const file of ['src/todos/application/ListTodos.ts', 'src/domain/Z.ts', 'src/billing-domain/rules.tsx', 'src/Checkout.Application/x.mts']) assert.equal(isCoreFile(file), true, file)
	for (const file of ['src/todos/ui/List.tsx', 'src/app/App.tsx', 'src/todos/application/ListTodos.test.ts', 'src/todos/application/types.d.ts', 'src/todos/application/x.css', 'src/todos/application/__tests__/a.ts', 'tests/unit/todos/application/a.ts', 'src/domainx/a.ts']) assert.equal(isCoreFile(file), false, file)
	assert.deepEqual(coreSourceFiles(['src/b/domain/x.ts', 'src/a/application/y.ts', 'src/a/ui/z.tsx']), ['src/a/application/y.ts', 'src/b/domain/x.ts'])
	assert.deepEqual(coreRoots(['src/b/domain/x.ts', 'src/b/domain/deep/w.ts', 'src/a/application/y.ts']), ['src/a/application', 'src/b/domain'])
})

test('erased TypeScript forms are type-only too', () => {
	for (const source of ["import { type Todo } from './t'\nexport interface G {\n  list(): Promise<Todo[]>\n}\n", "export { type Todo } from './t'\n", 'export declare const todo: string\n', "declare module 'x' {\n  export const y: number\n}\n", "export type * from './t'\n"]) {
		assert.equal(hasRuntimeCode(source), false, source)
	}
	assert.equal(hasRuntimeCode("import { type A, b } from './t'\nexport const c = b\n"), true)
})

test('a type-only file has no runtime code; anything executable does', () => {
	assert.equal(hasRuntimeCode("import type { A } from './a'\n\nexport interface Gateway {\n  list(): Promise<A[]>\n}\n\nexport type View = {\n  readonly id: string\n}\n"), false)
	assert.equal(hasRuntimeCode('// only a comment\nexport type Id = string\n'), false)
	assert.equal(hasRuntimeCode('export type Id = string\nexport const none: Id = ""\n'), true)
	assert.equal(hasRuntimeCode('export class ListTodos {}\n'), true)
	assert.equal(hasRuntimeCode('export enum Status { Open, Done }\n'), true)
})

test('aliasing or destructuring vi and jest does not hide a double', () => {
	const hits = mockHits('t.ts', "import { describe, it, vi as v } from 'vitest'\nconst { fn } = vi\nconst w = vi\nimport * as t from 'vitest'\nimport { jest } from '@jest/globals'\nimport { describe, expect } from 'vitest'\n")
	assert.deepEqual(hits.map((hit) => Number(hit.split(':')[1])), [1, 2, 3, 4, 5])
})

test('Vitest doubles, mocking libraries and MSW are mock hits; a hand-written fake is not', () => {
	assert.equal(mockHits('t.ts', "vi.mock('../x')\nconst spy = vi.spyOn(a, 'b')\nimport { mock } from 'vitest-mock-extended'\n").length, 3)
	assert.deepEqual(mockHits('t.ts', 'class InMemoryTodoGateway {}\nconst saved: string[] = []\n'), [])
})

test('the architecture gate wants both boundaries rules as errors', () => {
	assert.deepEqual(architectureRuleProblems({ 'boundaries/dependencies': [2, {}], 'boundaries/no-unknown-files': 'error' }), [])
	assert.deepEqual(architectureRuleProblems({ 'boundaries/element-types': ['error'], 'boundaries/no-unknown-files': [2] }), [])
	assert.equal(architectureRuleProblems({ 'boundaries/dependencies': [1, {}] }).length, 2)
})
