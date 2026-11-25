// The architecture context a delivery binds (architecture/context.json): what its agents and lenses
// read of the merged design. A design run binds none: its agents get no context line, and its lenses
// read rules that say they apply only when the review context lists the file.
export const ARCHITECTURE_CONTEXT_RULES = Object.freeze([
  '- When architecture/context.json is listed in the inputs or review context, read it before architecture documents; it scopes every DESIGN requirement in agent and skill instructions.',
  '- mode=merged: resolve every architecture source path through its documents mapping, relative to the run tracking folder; never substitute working-copy architecture. Unlisted architecture documents are not required.',
  '- mode=absent: no prior DESIGN document or ADR is required. Derive the smallest implementation structure from the issue criteria and existing code; do not invent ADRs or block merely because architecture is absent.',
])

const MANIFEST = /[/\\]architecture[/\\]context\.json$/

/** @param {string[]} inputs */
export const architectureContextLines = (inputs) => {
  const manifest = inputs.find((path) => MANIFEST.test(path))
  return manifest === undefined ? [] : [`- Architecture context: ${manifest}`, ...ARCHITECTURE_CONTEXT_RULES]
}
