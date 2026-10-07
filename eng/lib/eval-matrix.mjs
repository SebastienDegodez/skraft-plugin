// Pure rules behind the CI evaluation matrix: which subjects get their own
// runner, and which are left out on purpose.
//
// One matrix cell per subject is what lets CI run evaluations side by side
// instead of one after another inside a single 150-minute job. The skip list is
// applied here, before any runner starts, so a parked suite costs nothing at all
// rather than a runner that boots, installs the toolchain and then exits on
// "Nothing to run".

/**
 * Names listed in `eng/vally-adapter/skip-evals.txt`, read the same way the
 * runner reads it: blank lines and `#` comments ignored, and an inline reason
 * after `#` stripped so its words are never mistaken for eval names.
 *
 * @param {string} text file content
 * @returns {string[]}
 */
export function parseSkipList(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .flatMap((line) => line.replace(/#.*/, '').trim().split(/\s+/))
    .filter(Boolean)
}

/**
 * The matrix GitHub Actions expands into one job per subject.
 *
 * Each entry carries everything a cell needs and nothing it has to recompute:
 * the runner arguments (`skills <name>` / `agents <name>` — explicit, so a skill
 * and an agent suite that share a directory name never run each other) and a
 * unique artifact name for its evidence.
 *
 * @param {{ skills?: string[], agents?: string[], skip?: string[] }} subjects
 * @returns {{ include: Array<{ kind: 'skill' | 'agent', name: string, args: string, artifact: string }>, skipped: string[] }}
 */
export function evalMatrix({ skills = [], agents = [], skip = [] } = {}) {
  const skipped = new Set(skip)
  const include = []
  const left = []
  const add = (kind, names) => {
    for (const name of [...new Set(names)].sort()) {
      if (skipped.has(name)) {
        left.push(name)
        continue
      }
      include.push({
        kind,
        name,
        args: `${kind === 'skill' ? 'skills' : 'agents'} ${name}`,
        artifact: `eval-part-${kind}-${name}`,
      })
    }
  }
  add('skill', skills)
  add('agent', agents)
  return { include, skipped: left }
}
