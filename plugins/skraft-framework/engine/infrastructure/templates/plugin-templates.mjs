/**
 * The templates under the plugin's `assets/templates/`.
 * @param {{ files: Pick<import('../tracking/tracking-store.mjs').FileFunctions, 'read' | 'join'>, pluginRoot: string }} options
 * @returns {import('../../application/ports/template-library.mjs').TemplateLibrary}
 */
export const createPluginTemplates = ({ files, pluginRoot }) => Object.freeze({
  read: (name) => files.read(files.join(pluginRoot, 'assets', 'templates', name)),
})
