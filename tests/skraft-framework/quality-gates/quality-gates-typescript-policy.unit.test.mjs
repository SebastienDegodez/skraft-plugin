import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	coreSourceFiles, isCoreFile, mockHits,
} from '../../../plugins/skraft-framework/skills/quality-gates-typescript/scripts/gate-policy.mjs'

test('core is any production source under a folder whose last word is domain or application', () => {
	for (const file of ['src/todos/application/ListTodos.ts', 'src/domain/Z.ts', 'src/billing-domain/rules.tsx', 'src/Checkout.Application/x.mts']) assert.equal(isCoreFile(file), true, file)
	for (const file of ['src/todos/ui/List.tsx', 'src/app/App.tsx', 'src/todos/application/ListTodos.test.ts', 'src/todos/application/types.d.ts', 'src/todos/application/x.css', 'src/todos/application/__tests__/a.ts', 'tests/unit/todos/application/a.ts', 'src/domainx/a.ts']) assert.equal(isCoreFile(file), false, file)
	assert.deepEqual(coreSourceFiles(['src/b/domain/x.ts', 'src/a/application/y.ts', 'src/a/ui/z.tsx']), ['src/a/application/y.ts', 'src/b/domain/x.ts'])
})

test('aliasing or destructuring vi and jest does not hide a double', () => {
	const hits = mockHits('t.ts', "import { describe, it, vi as v } from 'vitest'\nconst { fn } = vi\nconst w = vi\nimport * as t from 'vitest'\nimport { jest } from '@jest/globals'\nimport { describe, expect } from 'vitest'\n")
	assert.deepEqual(hits.map((hit) => Number(hit.split(':')[1])), [1, 2, 3, 4, 5])
})

test('Vitest doubles, mocking libraries and MSW are mock hits; a hand-written fake is not', () => {
	assert.equal(mockHits('t.ts', "vi.mock('../x')\nconst spy = vi.spyOn(a, 'b')\nimport { mock } from 'vitest-mock-extended'\n").length, 3)
	assert.deepEqual(mockHits('t.ts', 'class InMemoryTodoGateway {}\nconst saved: string[] = []\n'), [])
})
