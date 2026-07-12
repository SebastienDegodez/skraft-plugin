// Minimal Mustache-subset renderer — zero dependency.
//
// The renderer itself lives in plugins/src/domain/template-renderer.mjs (it is
// also the renderer behind the shipped `artifact` CLI,
// plugins/src/cli/artifact.mjs), so both consumers share one implementation
// instead of drifting. This module just re-exports it for scripts/render-template.mjs
// and scripts/artifact.mjs.
export { render } from '../../plugins/src/domain/template-renderer.mjs'
