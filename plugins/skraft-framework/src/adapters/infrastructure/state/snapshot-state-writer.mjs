import { Ok, Err } from '../../../domain/result.mjs'

// StateWriter (ports/infrastructure/state-writer.mjs) for hosts that can write a file but
// neither rename nor delete one — the Claude Code mod, whose $.fs has read, write, exists.
// json-state-writer.mjs (temp file + rename) stays the writer of Node hosts.
//
// Protocol, per write:
//   1. serialize state → JSON
//   2. when state.json exists and the phase changes, copy it to state.json.bak.{ms}: one
//      backup per phase transition, so their number is bounded by the phase order (the
//      host cannot rotate them); recovery (recovery-policy.mjs) reads the same names
//   3. write state.json
//   4. read it back: a torn write is IO_ERROR, and the last backup is where recovery starts
// files — { exists(path), read(path), write(path, text) } on absolute '/'-separated paths
// now  — () => milliseconds since the epoch (TimeProvider)
// No Node API here. Never throws.
const phaseOf = (text) => {
  try { return JSON.parse(text)?.currentPhase ?? null } catch { return undefined }
}

export const createSnapshotStateWriter = ({ files, trackingRoot, now }) => Object.freeze({
  write: async (projectSlug, state) => {
    const statePath = `${trackingRoot}/${projectSlug}/state.json`
    const json = JSON.stringify(state, null, 2)
    try {
      if (await files.exists(statePath)) {
        const current = await files.read(statePath)
        if (phaseOf(current) !== (state?.currentPhase ?? null)) {
          await files.write(`${statePath}.bak.${now()}`, current)
        }
      }
      await files.write(statePath, json)
      if ((await files.read(statePath)) !== json) {
        return Err({ code: 'IO_ERROR', reason: `${statePath} does not read back as written` })
      }
      return Ok(undefined)
    } catch (error) {
      return Err({ code: 'IO_ERROR', reason: String(error?.message ?? error) })
    }
  },
})
