import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

export const createJsonStateReader = (basePath) => ({
  read: async (projectSlug) => {
    const raw = await readFile(`${basePath}/${projectSlug}/state.json`, 'utf8')
    return JSON.parse(raw)
  },
  write: async (projectSlug, state) => {
    const path = `${basePath}/${projectSlug}/state.json`
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(state, null, 2), 'utf8')
  }
})
