/**
 * WorkflowSource — the DOT workflows the plugin ships (`workflows/<name>.skraft.dot`).
 *
 * @typedef {{ builtIn: () => Promise<string>, called: (name: string) => Promise<string | null> }} WorkflowSource
 *   builtIn: `workflows/pipeline.skraft.dot`. called: the workflow a call node names by its base
 *   name, `workflows/<name>.skraft.dot` (a name the workflow checked, never a path); null when the
 *   plugin has none.
 */
export {}
