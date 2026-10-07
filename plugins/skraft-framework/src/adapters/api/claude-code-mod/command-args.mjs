// Driving adapter helper of the Claude Code mod: the /skraft command line → the input of
// a use case.
//   /skraft                                  { command: 'status' }
//   /skraft checkout #42 Pay by card         { command: 'run', slug, story }      RunPipeline
//   /skraft decide checkout <key> <answer…>  { command: 'decide', slug, key, answer }  RecordDecision
//   /skraft close checkout [findings]        { command: 'close', slug, findings }  CloseManually
// `decide` and `close` are reserved: they are never read as a slug.
const SUBCOMMANDS = new Set(['decide', 'close'])

export const parseSkraftArgs = (args) => {
  const words = String(args ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { command: 'status' }
  if (SUBCOMMANDS.has(words[0])) {
    const [command, slug = null, ...rest] = words
    if (command === 'decide') return { command, slug, key: rest[0] ?? null, answer: rest.slice(1).join(' ') || null }
    const findings = rest[0] === undefined ? 0 : (/^\d+$/.test(rest[0]) ? Number(rest[0]) : Number.NaN)
    return { command, slug, findings }
  }
  const slug = words.shift()
  const issue = words[0]?.match(/^#?(\d+)$/) ? Number(words.shift().replace('#', '')) : null
  const title = words.join(' ') || null
  return { command: 'run', slug, story: issue || title ? { issue, title } : null }
}
