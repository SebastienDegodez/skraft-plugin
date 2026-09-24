// Pure validator for the subset of JSON Schema (draft 2020-12) that state.schema.json
// uses (SUPPORTED_KEYWORDS). Annotations (title, description, x-owner) are ignored.
// Returns the violations as [{ path, reason }]; an empty list means the value conforms.

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const TYPES = {
  null: { name: 'null', matches: (value) => value === null },
  string: { name: 'a string', matches: (value) => typeof value === 'string' },
  integer: { name: 'an integer', matches: (value) => Number.isInteger(value) },
  array: { name: 'an array', matches: (value) => Array.isArray(value) },
  object: { name: 'an object', matches: isObject },
}

// Keywords this validator enforces or deliberately ignores; any other keyword in a
// schema it is given would go unchecked.
export const SUPPORTED_KEYWORDS = Object.freeze([
  '$schema', '$defs', '$ref', 'title', 'description', 'x-owner',
  'anyOf', 'enum', 'const', 'type', 'minLength', 'minimum', 'items',
  'required', 'properties', 'additionalProperties',
])
export const SUPPORTED_TYPES = Object.freeze(Object.keys(TYPES))

const name = (path) => path || 'the document'
const child = (path, key) => (path ? `${path}.${key}` : key)
const violation = (path, reason) => [{ path: name(path), reason: `${name(path)} ${reason}` }]

const definition = (root, ref) => {
  const match = /^#\/\$defs\/([^/]+)$/.exec(ref)
  const target = match && root.$defs?.[match[1]]
  if (!target) throw new Error(`unsupported $ref: ${ref}`)
  return target
}

const typeOf = (typeName) => {
  const type = TYPES[typeName]
  if (!type) throw new Error(`unsupported type: ${typeName}`)
  return type
}

// A value no branch accepts: the branch of its own type says why, otherwise the
// allowed types are named.
const anyOfViolation = (branches, outcomes, value, path) => {
  const sameType = branches.findIndex((branch) => branch.type !== undefined && typeOf(branch.type).matches(value))
  if (sameType !== -1) return outcomes[sameType]
  if (branches.every((branch) => branch.type !== undefined)) {
    return violation(path, `must be ${branches.map((branch) => typeOf(branch.type).name).join(' or ')}`)
  }
  return violation(path, 'has none of the allowed shapes')
}

export const schemaViolations = (schema, value, root = schema, path = '') => {
  if (schema.$ref !== undefined) {
    const { $ref, ...rest } = schema
    return [...schemaViolations(definition(root, $ref), value, root, path), ...schemaViolations(rest, value, root, path)]
  }
  if (schema.anyOf !== undefined) {
    const outcomes = schema.anyOf.map((branch) => schemaViolations(branch, value, root, path))
    if (!outcomes.some((outcome) => outcome.length === 0)) return anyOfViolation(schema.anyOf, outcomes, value, path)
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    return violation(path, `must be one of ${schema.enum.map(String).join(', ')}`)
  }
  if (schema.const !== undefined && value !== schema.const) {
    return violation(path, `must be ${String(schema.const)}`)
  }
  if (schema.type !== undefined && !typeOf(schema.type).matches(value)) {
    return violation(path, `must be ${typeOf(schema.type).name}`)
  }
  if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
    return violation(path, `must have at least ${schema.minLength} character(s)`)
  }
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
    return violation(path, `must be at least ${schema.minimum}`)
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    return value.flatMap((item, index) => schemaViolations(schema.items, item, root, `${path}[${index}]`))
  }
  if (!isObject(value)) return []
  const missing = (schema.required ?? [])
    .filter((key) => !Object.hasOwn(value, key))
    .flatMap((key) => violation(child(path, key), 'is required'))
  const entries = Object.entries(value).flatMap(([key, item]) => {
    const declared = schema.properties?.[key]
    if (declared !== undefined) return schemaViolations(declared, item, root, child(path, key))
    if (schema.additionalProperties === false) return violation(child(path, key), 'is not a known field')
    if (isObject(schema.additionalProperties)) return schemaViolations(schema.additionalProperties, item, root, child(path, key))
    return []
  })
  return [...missing, ...entries]
}
