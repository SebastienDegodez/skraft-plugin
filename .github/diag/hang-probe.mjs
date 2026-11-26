// Diagnostic only: if this test process is still alive after PROBE_MS, print what keeps it alive
// (active resources and the child processes it left), then exit 1.
import { spawnSync } from 'node:child_process'
const PROBE_MS = Number(process.env.PROBE_MS ?? 120000)
setTimeout(() => {
  console.log(`\n[hang-probe] pid ${process.pid} still alive after ${PROBE_MS} ms`)
  console.log('[hang-probe] active resources:', JSON.stringify(process.getActiveResourcesInfo()))
  for (const h of process._getActiveHandles()) {
    const kind = h?.constructor?.name
    const extra = kind === 'ChildProcess' ? ` pid=${h.pid} spawnfile=${h.spawnfile} args=${JSON.stringify(h.spawnargs).slice(0, 200)} connected=${h.connected} exitCode=${h.exitCode}` : ''
    console.log(`[hang-probe] handle ${kind}${extra}`)
  }
  const ps = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | Format-Table -AutoSize -Wrap | Out-String -Width 400'], { encoding: 'utf8', timeout: 30000 })
  console.log('[hang-probe] processes:\n' + (ps.stdout ?? '').split('\n').filter((l) => /node|taskkill|powershell|cmd/i.test(l)).join('\n'))
  process.exit(1)
}, PROBE_MS).unref()
