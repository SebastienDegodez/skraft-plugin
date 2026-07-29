import { writeFile, rename, unlink, readdir, mkdir, copyFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { Ok, Err } from '../../../domain/result.mjs'

// Atomic writer for the DELIVER execution log at {basePath}/{slug}/execution-log.json.
// Cross-platform (macOS + Windows via fs.rename). Mirrors json-state-writer's atomicity +
// rotating-backup protocol:
//   1. serialize → JSON
//   2. writeFile(execution-log.json.tmp.{ts})
//   3. copyFile(current → execution-log.json.bak.{ts}) if it exists
//   4. rotate: keep <=3 backups
//   5. rename(tmp → execution-log.json) — atomic
export const createJsonExecutionLogWriter = (basePath) => ({
  write: async (slug, log) => {
    const logDir = join(basePath, slug)
    const logPath = join(logDir, 'execution-log.json')
    const ts = Date.now()
    const tmpPath = join(logDir, `execution-log.json.tmp.${ts}`)
    let tmpCreated = false

    try {
      await mkdir(logDir, { recursive: true })

      const json = JSON.stringify(log, null, 2)
      await writeFile(tmpPath, json, 'utf8')
      tmpCreated = true

      try {
        await access(logPath)
        const bakPath = join(logDir, `execution-log.json.bak.${ts}`)
        await copyFile(logPath, bakPath)

        const allFiles = await readdir(logDir)
        const baks = allFiles
          .filter(f => /^execution-log\.json\.bak\.\d+$/.test(f))
          .sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()))
        while (baks.length > 3) {
          await unlink(join(logDir, baks.shift()))
        }
      } catch (bakErr) {
        if (bakErr.code !== 'ENOENT') throw bakErr
      }

      await rename(tmpPath, logPath)
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
