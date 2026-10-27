/**
 * WorkflowSource — the DOT workflows the plugin ships (`workflows/`).
 *
 * @typedef {{ builtIn: () => Promise<string>, called: (file: string) => Promise<string | null> }} WorkflowSource
 *   builtIn: `workflows/pipeline.skraft.dot`. called: the workflow a call node names, `workflows/<file>`
 *   (a file name the workflow checked, never a path); null when the plugin has none.
 */
export {}
