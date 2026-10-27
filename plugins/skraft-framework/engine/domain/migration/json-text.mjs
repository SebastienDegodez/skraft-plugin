/**
 * @param {string} text
 * @returns {unknown} what the text holds, undefined when it is no JSON
 */
export const parsedJson = (text) => {
  try {
    return JSON.parse(text)
    // Stryker disable next-line BlockStatement: an empty catch returns undefined too
  } catch {
    return undefined
  }
}

/** @param {unknown} value @returns {value is Record<string, any>} */
export const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
