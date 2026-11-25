// A delivery run publishes no research: the design that it reads already did. The shared pipeline
// asks this module, which skraft-design writes otherwise.

/** Nothing to publish: the run goes on. */
export const publishResearch = async () => ({ ok: true })
