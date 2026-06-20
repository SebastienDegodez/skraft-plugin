import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

const parseEnvConfig = (env) => {
  const config = {}
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('SKRAFT_')) {
      const configKey = key.slice(7).toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      config[configKey] = value
    }
  }
  return config
}

const tryReadJson = async (path) => {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch { return null }
}

export const loadConfig = async (options = {}) => {
  const cwd = options.cwd ?? process.cwd()
  const home = options.home ?? homedir()
  const env = options.env ?? process.env

  const envConfig = parseEnvConfig(env)
  const globalConfig = await tryReadJson(join(home, '.skraft', 'config.json')) ?? {}
  const projectConfig = await tryReadJson(join(cwd, '.skraftrc.json')) ??
                        await tryReadJson(join(cwd, 'skraft.config.json')) ?? {}

  return { ...envConfig, ...globalConfig, ...projectConfig }
}
