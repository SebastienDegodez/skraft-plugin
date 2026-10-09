import { describe, expect, it } from 'vitest'

import { progress } from '../../../../src/todos/application/progress'

describe('progress', () => {
  it('should count what is done out of everything', () => {
    expect(progress([{ id: '1', title: 'Buy milk', status: 'done' }, { id: '2', title: 'Pay rent', status: 'open' }])).toBe('1 of 2 completed')
  })
})
