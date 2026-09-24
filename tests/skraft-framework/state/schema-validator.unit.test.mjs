import { test } from 'node:test'
import assert from 'node:assert/strict'
import { schemaViolations } from '../../../plugins/skraft-framework/src/domain/schema-validator.mjs'

const reasons = (schema, value) => schemaViolations(schema, value).map(({ reason }) => reason)

test('each type names itself when a value does not match it', () => {
  assert.deepEqual(reasons({ type: 'object' }, []), ['the document must be an object'])
  assert.deepEqual(reasons({ type: 'array' }, {}), ['the document must be an array'])
  assert.deepEqual(reasons({ type: 'string' }, 1), ['the document must be a string'])
  assert.deepEqual(reasons({ type: 'integer' }, 1.5), ['the document must be an integer'])
  assert.deepEqual(reasons({ type: 'null' }, 0), ['the document must be null'])
})

test('an object type rejects null and arrays, and accepts a plain object', () => {
  assert.equal(reasons({ type: 'object' }, null).length, 1)
  assert.equal(reasons({ type: 'object' }, []).length, 1)
  assert.deepEqual(reasons({ type: 'object' }, {}), [])
})

test('enum, const and anyOf name what they allow', () => {
  assert.deepEqual(reasons({ enum: ['a', null] }, 'b'), ['the document must be one of a, null'])
  assert.deepEqual(reasons({ const: 'Proposed' }, 'Accepted'), ['the document must be Proposed'])
  assert.deepEqual(reasons({ anyOf: [{ type: 'string' }, { type: 'null' }] }, 1), ['the document has none of the allowed shapes'])
  assert.deepEqual(reasons({ anyOf: [{ type: 'string' }, { type: 'null' }] }, null), [])
})

test('minLength and minimum apply only to strings and numbers', () => {
  assert.deepEqual(reasons({ minLength: 1 }, ''), ['the document must have at least 1 character(s)'])
  assert.deepEqual(reasons({ minLength: 1 }, 0), [])
  assert.deepEqual(reasons({ minimum: 0 }, -1), ['the document must be at least 0'])
  assert.deepEqual(reasons({ minimum: 0 }, '-1'), [])
  assert.deepEqual(reasons({ minimum: 0 }, 0), [])
})

test('violations name the path of the offending value', () => {
  const schema = {
    type: 'object',
    required: ['a'],
    properties: { list: { type: 'array', items: { type: 'object', additionalProperties: false } } },
    additionalProperties: false,
  }
  assert.deepEqual(reasons(schema, { list: [{ x: 1 }], extra: true }), [
    'a is required',
    'list[0].x is not a known field',
    'extra is not a known field',
  ])
})

test('a $ref resolves only within the schema it belongs to', () => {
  const schema = { $defs: { count: { type: 'integer' } }, $ref: '#/$defs/count' }
  assert.deepEqual(reasons(schema, 'x'), ['the document must be an integer'])
  assert.throws(() => schemaViolations({ $defs: { count: {} }, $ref: 'other.json#/$defs/count' }, 1), /unsupported \$ref/)
  assert.throws(() => schemaViolations({ $ref: '#/$defs/missing' }, 1), /unsupported \$ref/)
})
