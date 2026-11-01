import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseYaml } from '../../../../eng/lib/yaml-parser.mjs'

// Loads data/citations.yml and data/personas.yml as global data. Read them in a component with
//   usePluginData('skraft-data')  ->  { citations: [...], personas: [...] }
// The repository's YAML reader takes a list under a key, so each file is read as `items:`.
const readList = (file) => {
  const text = readFileSync(fileURLToPath(new URL(`../../data/${file}`, import.meta.url)), 'utf8')
  const indented = text.split('\n').map((line) => `  ${line}`).join('\n')
  return parseYaml(`items:\n${indented}`).items
}

export default function skraftDataPlugin() {
  return {
    name: 'skraft-data',
    async loadContent() {
      return { citations: readList('citations.yml'), personas: readList('personas.yml') }
    },
    async contentLoaded({ content, actions }) {
      actions.setGlobalData(content)
    },
    getPathsToWatch() {
      return ['data/*.yml'].map((pattern) => fileURLToPath(new URL(`../../${pattern}`, import.meta.url)))
    },
  }
}
