// Pure: which pipeline a viewer opened without an explicit slug shows. A repository may
// track several pipelines; the person usually sits on the branch of the one they want.
//
// Order, first match wins:
//   requested  the slug the caller named
//   branch     a pipeline whose last run, or whose reporting scope, is on the current branch
//   name       a pipeline whose slug is a whole word of the branch (feat/123-checkout-pay)
//   active     the pointer the last run recorded (.active-slug), when that pipeline exists
//   only       the one pipeline the repository tracks
// None: no slug, and the viewer lists the pipelines to choose from.
//
// pipelines [{ slug, branch, reportingBranch, updatedAt }]  (see summarizePipeline)

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const isPipelineSlug = (slug) => typeof slug === 'string' && SLUG_PATTERN.test(slug)

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The slug is the branch's last segment, or a run of whole words in it.
const namesSlug = (branch, slug) => {
  const leaf = String(branch).split('/').at(-1).toLowerCase()
  return new RegExp(`(^|-)${escape(slug)}($|-)`).test(leaf)
}

const newestFirst = (a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))

export const selectPipeline = ({ requested = null, branch = null, active = null, pipelines = [] }) => {
  if (requested !== null && requested !== undefined) return { slug: requested, reason: 'requested' }
  const known = [...pipelines].sort(newestFirst)
  if (branch) {
    const onBranch = known.find((pipeline) => pipeline.branch === branch || pipeline.reportingBranch === branch)
    if (onBranch) return { slug: onBranch.slug, reason: 'branch' }
    // The longest slug the branch names wins: feat/checkout-pay names both checkout and checkout-pay.
    const named = known.filter((pipeline) => namesSlug(branch, pipeline.slug))
      .sort((a, b) => b.slug.length - a.slug.length)[0]
    if (named) return { slug: named.slug, reason: 'name' }
  }
  if (active && known.some((pipeline) => pipeline.slug === active)) return { slug: active, reason: 'active' }
  if (known.length === 1) return { slug: known[0].slug, reason: 'only' }
  return { slug: null, reason: known.length === 0 ? 'none' : 'ambiguous' }
}

// What a chooser shows of one pipeline, from its state.json and run.json (either may be null).
export const summarizePipeline = ({ slug, state = null, run = null }) => ({
  slug,
  currentPhase: state?.currentPhase ?? null,
  done: state?.currentPhase === 'DONE',
  runStatus: run?.status ?? null,
  story: run?.story ?? null,
  branch: run?.branch ?? null,
  reportingBranch: state?.userPreferences?.reporting?.branch || null,
  updatedAt: run?.updatedAt ?? state?.phaseHistory?.[state?.currentPhase]?.startedAt ?? null,
})

// The view a viewer shows while no pipeline is chosen.
export const pipelineChooserView = ({ branch = null, reason, pipelines = [] }) => ({
  chooser: true,
  branch,
  reason,
  pipelines: [...pipelines].sort(newestFirst),
})
