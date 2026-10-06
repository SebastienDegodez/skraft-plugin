import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { join, dirname, relative, sep } from 'node:path'

// TrackingStore (ports/infrastructure/tracking-store.mjs) on the local file system.
// trackingRoot — absolute {trackingRoot}; cwd — the session repository, for prefix().
const toPosix = (path) => path.split(sep).join('/')

const listFiles = async (root) => {
  const out = []
  const walk = async (dir) => {
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) out.push(toPosix(relative(root, path)))
    }
  }
  await walk(root)
  return out.sort()
}

export const createFsTrackingStore = ({ trackingRoot, cwd }) => Object.freeze({
  exists: async (slug, path) => {
    try { return (await stat(join(trackingRoot, slug, path))).isFile() } catch { return false }
  },
  read: (slug, path) => readFile(join(trackingRoot, slug, path), 'utf8'),
  list: (slug) => listFiles(join(trackingRoot, slug)),
  projects: async () => {
    let entries
    try { entries = await readdir(trackingRoot, { withFileTypes: true }) } catch { return [] }
    const out = []
    for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
      for (const marker of ['state.json', 'run.json']) {
        try {
          if ((await stat(join(trackingRoot, entry.name, marker))).isFile()) { out.push(entry.name); break }
        } catch { /* not this marker */ }
      }
    }
    return out.sort()
  },
  write: async (slug, path, text) => {
    const target = join(trackingRoot, slug, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, text, 'utf8')
  },
  prefix: (slug) => `${toPosix(relative(cwd, join(trackingRoot, slug)))}/`,
})
