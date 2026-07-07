import { writeFile, rename, unlink, readdir, mkdir, copyFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { Ok, Err } from '../../../domain/result.mjs'

// Atomic writer for the repo-wide skraft-config.json. Cross-platform (macOS + Windows
// via fs.rename). Mirrors json-state-writer's atomicity + rotating-backup protocol:
//   1. serialize → JSON
//   2. writeFile(skraft-config.json.tmp.{ts})
//   3. copyFile(current → skraft-config.json.bak.{ts}) if it exists
//   4. rotate: keep <=3 backups
//   5. rename(tmp → skraft-config.json) — atomic
export const createJsonConfigWriter = (basePath) => ({
  write: async (config) => {
    const statePath = join(basePath, 'skraft-config.json')
    const ts = Date.now()
    const tmpPath = join(basePath, `skraft-config.json.tmp.${ts}`)
    let tmpCreated = false

    try {
      await mkdir(basePath, { recursive: true })

      const json = JSON.stringify(config, null, 2)
      await writeFile(tmpPath, json, 'utf8')
      tmpCreated = true

      try {
        await access(statePath)
        const bakPath = join(basePath, `skraft-config.json.bak.${ts}`)
        await copyFile(statePath, bakPath)

        const allFiles = await readdir(basePath)
        const baks = allFiles
          .filter(f => /^skraft-config\.json\.bak\.\d+$/.test(f))
          .sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()))
        while (baks.length > 3) {
          await unlink(join(basePath, baks.shift()))
        }
      } catch (bakErr) {
        if (bakErr.code !== 'ENOENT') throw bakErr
      }

      await rename(tmpPath, statePath)
      tmpCreated = false
      return Ok(undefined)
    } catch (err) {
      if (err.code === 'EXDEV') {
        return Err({ code: 'IO_ERROR', reason: 'cross-device rename not supported; ensure basePath is on a single filesystem' })
      }
      return Err({ code: 'IO_ERROR', reason: err.message })
    } finally {
      if (tmpCreated) {
        await unlink(tmpPath).catch(() => {})
      }
    }
  },
})
