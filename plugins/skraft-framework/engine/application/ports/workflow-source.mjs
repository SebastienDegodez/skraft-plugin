/**
 * WorkflowSource — the DOT workflows the plugin ships (`workflows/<name>.skraft.dot`).
 *
 * @typedef {{ name?: string, builtIn: () => Promise<string>, called: (name: string) => Promise<string | null> }} WorkflowSource
 *   name: the base name of the workflow a run follows, `pipeline` when absent (`mutation` for a
 *   mutation run). builtIn: that workflow, `workflows/<name>.skraft.dot`. called: the workflow a
 *   call node names by its base name, `workflows/<name>.skraft.dot` (a name the workflow checked,
 *   never a path); null when the plugin has none.
 */
export {}
