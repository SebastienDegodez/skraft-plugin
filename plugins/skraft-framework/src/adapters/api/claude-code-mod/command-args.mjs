// Driving adapter helper of the Claude Code mod: "/skraft checkout #42 Pay by card" →
// { slug, story }, the input of the RunPipeline use case.
export const parseSkraftArgs = (args) => {
  const words = String(args ?? '').trim().split(/\s+/).filter(Boolean)
  const slug = words.shift() ?? null
  const issue = words[0]?.match(/^#?(\d+)$/) ? Number(words.shift().replace('#', '')) : null
  const title = words.join(' ') || null
  return { slug, story: issue || title ? { issue, title } : null }
}
