/**
 * @param {string} text
 * @returns {unknown} what the text holds, undefined when it is no JSON
 */
// Stryker disable BlockStatement: an empty catch returns undefined too
export const parsedJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
// Stryker restore BlockStatement

/** @param {unknown} value @returns {value is Record<string, any>} */
export const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
