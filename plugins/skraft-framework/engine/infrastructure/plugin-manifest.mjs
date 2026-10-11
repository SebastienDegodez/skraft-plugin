import { readFileSync } from 'node:fs'

/**
 * @param {URL} manifestUrl location of the plugin's `plugin.json`
 * @returns {string}
 */
export const readPluginVersion = (manifestUrl) =>
  // Stryker disable next-line StringLiteral: equivalent, JSON.parse decodes the Buffer read without an encoding as UTF-8
  JSON.parse(readFileSync(manifestUrl, 'utf8')).version
