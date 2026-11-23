const start = async ({ architecture, pipeline }, { issue }) => {
  const brief = await architecture.find(issue)
  if (brief?.status === 'changed') return changed(brief)
  if (brief !== null && brief.status !== 'current') return refused(brief)
  const outcome = await pipeline.start({ issue, entry: 'distill', architecture: brief?.path ?? null })
  return brief === null ? { ...outcome, notice: 'No architecture brief found for this story.' } : outcome
}

const refused = (brief) => ({
  status: 'blocked',
  code: brief.code ?? (brief.status === 'stale' ? 'architecture-stale' : 'architecture-unmerged'),
  reason: brief.reason ?? 'The architecture brief cannot be used for delivery.',
})

const changed = (brief) => ({
  status: 'waiting', code: 'architecture-changed', architecture: brief.path,
  question: { key: 'architecture-refresh', text: 'The issue body changed since design. Keep the brief or redo design?', options: ['KEEP', 'REDESIGN'] },
})

export const createDeliveryStart = (dependencies) => Object.freeze({
  start: (request) => start(dependencies, request),
})
