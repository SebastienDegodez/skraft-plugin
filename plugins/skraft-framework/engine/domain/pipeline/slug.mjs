const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** @param {unknown} value @returns {value is string} */
export const isSlug = (value) => typeof value === 'string' && KEBAB.test(value)
