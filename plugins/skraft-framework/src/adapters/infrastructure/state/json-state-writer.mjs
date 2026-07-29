import { readFile, writeFile, rename, unlink, readdir, mkdir, copyFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { Ok, Err } from '../../../domain/result.mjs'

// Atomic state writer. Cross-platform (macOS + Windows via fs.rename).
// Atomicity protocol:
//   1. serialize state → JSON string
//   2. writeFile(state.json.tmp.{ts}) ← temp, same dir
//   3. copyFile(state.json → state.json.bak.{ts}) ← backup current (if exists)
//   4. rotate: keep ≤3 backups, delete oldest
//   5. rename(tmp → state.json) ← atomic (POSIX/MoveFileExW)
export const createJsonStateWriter = (basePath) => ({
  write: async (projectSlug, state) => {
    const stateDir = join(basePath, projectSlug)
    const statePath = join(stateDir, 'state.json')
    const ts = Date.now()
    const tmpPath = join(stateDir, `state.json.tmp.${ts}`)
    let tmpCreated = false

    try {
      await mkdir(stateDir, { recursive: true })

      const json = JSON.stringify(state, null, 2)
      await writeFile(tmpPath, json, 'utf8')
      tmpCreated = true

      // Backup current state.json if it exists
      try {
        await access(statePath)
        const bakPath = join(stateDir, `state.json.bak.${ts}`)
        await copyFile(statePath, bakPath)

        // Rotate: keep ≤3 backups, delete oldest
        const allFiles = await readdir(stateDir)
        const baks = allFiles
          .filter(f => /^state\.json\.bak\.\d+$/.test(f))
          .sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()))
        while (baks.length > 3) {
          await unlink(join(stateDir, baks.shift()))
        }
      } catch (bakErr) {
        if (bakErr.code !== 'ENOENT') throw bakErr
        // No existing state.json → no backup needed
      }

      // Atomic rename tmp → state.json (cross-platform)
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
