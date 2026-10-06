// Pure: what a pipeline cost, from the usage each dispatch reported (run journal).
//
// Copilot reports GitHub AI credits (1 credit = 0.01 USD, GitHub Copilot billing docs);
// Claude Code reports US dollars. Euros only when a rate is given (eurPerUsd): a rate is
// a fact of the day, never a default of the code. Tokens are summed whatever the host.

export const USD_PER_CREDIT = 0.01

const round = (value, digits) => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits)

export const usdOf = (usage) => {
  if (typeof usage?.usd === 'number') return usage.usd
  if (typeof usage?.credits === 'number') return usage.credits * USD_PER_CREDIT
  return null
}

const add = (a, b) => (b === null || b === undefined ? a : (a ?? 0) + b)

const totalOf = (dispatches, eurPerUsd) => {
  let credits = null
  let usd = null
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let requests = 0
  let reported = 0
  let durationMs = 0
  for (const dispatch of dispatches) {
    durationMs += dispatch.durationMs ?? 0
    const usage = dispatch.usage
    if (!usage) continue
    reported += 1
    credits = add(credits, typeof usage.credits === 'number' ? usage.credits : null)
    usd = add(usd, usdOf(usage))
    inputTokens += usage.inputTokens ?? 0
    outputTokens += usage.outputTokens ?? 0
    cacheReadTokens += usage.cacheReadTokens ?? 0
    requests += usage.requests ?? 0
  }
  return {
    dispatches: dispatches.length,
    reported,
    credits: round(credits, 2),
    usd: round(usd, 4),
    eur: usd !== null && typeof eurPerUsd === 'number' ? round(usd * eurPerUsd, 4) : null,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    requests,
    durationMs,
  }
}

// dispatches — run journal dispatches; phases — the phase order shown; eurPerUsd — or null
export const pipelineCost = ({ dispatches = [], phases = [], eurPerUsd = null }) => {
  const rate = typeof eurPerUsd === 'number' && eurPerUsd > 0 ? eurPerUsd : null
  const groups = [...phases, ...new Set(dispatches.map((d) => d.phase).filter((p) => p && !phases.includes(p)))]
  return {
    eurPerUsd: rate,
    total: totalOf(dispatches, rate),
    byPhase: groups.map((phase) => ({ phase, ...totalOf(dispatches.filter((d) => d.phase === phase), rate) })),
    dispatches: dispatches.map((d) => {
      const usd = usdOf(d.usage)
      return {
        at: d.at,
        phase: d.phase,
        role: d.role,
        agent: d.agent,
        durationMs: d.durationMs ?? null,
        ok: d.ok,
        model: d.usage?.model ?? null,
        tokens: d.usage ? (d.usage.inputTokens ?? 0) + (d.usage.outputTokens ?? 0) : null,
        credits: typeof d.usage?.credits === 'number' ? round(d.usage.credits, 2) : null,
        usd: round(usd, 4),
        eur: usd !== null && rate ? round(usd * rate, 4) : null,
      }
    }),
  }
}
