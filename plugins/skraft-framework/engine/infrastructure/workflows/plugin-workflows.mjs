/**
 * The DOT workflows the plugin ships, `<pluginRoot>/workflows/<name>.skraft.dot`. No Node API here.
 * @param {{ files: Pick<import('../tracking/tracking-store.mjs').FileFunctions, 'read' | 'join'>, pluginRoot: string }} options
 * @returns {import('../../application/ports/workflow-source.mjs').WorkflowSource}
 */
export const createPluginWorkflows = ({ files, pluginRoot }) => Object.freeze({
  builtIn: async () => {
    const text = await files.read(files.join(pluginRoot, 'workflows', 'pipeline.skraft.dot'))
    if (text === null) throw new Error('the plugin has no workflows/pipeline.skraft.dot')
    return text
  },
  called: (/** @type {string} */ name) => files.read(files.join(pluginRoot, 'workflows', `${name}.skraft.dot`)),
})
