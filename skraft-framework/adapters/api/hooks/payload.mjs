const snakeToCamel = (str) => {
  const camelized = str.replace(/_([a-zA-Z])/g, (_, c) => c.toUpperCase())
  return camelized.charAt(0).toLowerCase() + camelized.slice(1)
}
const pascalToCamel = (str) => str.charAt(0).toLowerCase() + str.slice(1)

const normaliseKey = (key) => {
  if (key.includes('_')) return snakeToCamel(key)
  if (key.charAt(0) === key.charAt(0).toUpperCase() && key.charAt(0) !== key.charAt(0).toLowerCase()) {
    return pascalToCamel(key)
  }
  return key
}

const normaliseValue = (value) => {
  if (Array.isArray(value)) return value.map(normaliseValue)
  if (value !== null && typeof value === 'object') return normalise(value)
  return value
}

export const normalise = (raw) => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [normaliseKey(k), normaliseValue(v)])
  )
}
