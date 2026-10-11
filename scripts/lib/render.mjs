// Minimal Mustache-subset renderer — zero dependency.
//
// The renderer itself lives in eng/lib/template-renderer.mjs. This module just re-exports
// it for scripts/render-template.mjs and scripts/artifact.mjs.
export { render } from '../../eng/lib/template-renderer.mjs'
