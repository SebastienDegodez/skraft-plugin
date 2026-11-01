import { fileURLToPath } from 'node:url'

// Webpack/Rspack aliases to code that lives outside docs/website (never copied into it):
//   @skraft/flow          animated DELIVER figures (eng/docs/flow, PR #454)
//   @skraft/flow-figure   their pure core (eng/docs/flow/core), as the adapter imports it
//   @skraft/flows         their data (docs/flows, PR #454)
//   @skraft/engine-domain the engine's pure domain code, for the workflow viewer
// An alias to a folder that does not exist yet only fails when something imports it.
const fromRepo = (path) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url))

export default function aliasesPlugin() {
  return {
    name: 'skraft-aliases',
    configureWebpack() {
      return {
        resolve: {
          alias: {
            '@skraft/flow-figure': fromRepo('eng/docs/flow/core'),
            '@skraft/flow': fromRepo('eng/docs/flow'),
            '@skraft/flows': fromRepo('docs/flows'),
            '@skraft/engine-domain': fromRepo('plugins/skraft-framework/engine/domain'),
          },
        },
      }
    },
  }
}
