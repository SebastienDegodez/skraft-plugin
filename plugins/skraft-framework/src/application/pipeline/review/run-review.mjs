import { Ok, Err } from '../../../domain/result.mjs'
import { ARTIFACTS, normalize, validate } from '../../../domain/artifact-registry.mjs'
import {
  planLenses,
  recordedLensInputs,
  reviewInputPaths,
  storyOfEvidenceLog,
} from '../../../domain/pipeline/review/review-lenses.mjs'
import { composeLensBrief } from '../../../domain/pipeline/review/lens-brief.mjs'
import { inconclusiveLens, parseLensResult } from '../../../domain/pipeline/review/lens-result.mjs'
import { codeReviewData, decideReview } from '../../../domain/pipeline/review/review-verdict-policy.mjs'
import { renderArtifact } from '../../render-artifact.mjs'

// Use case RunReview: a phase review as code. RunPipeline calls it in place of the reviewer
// dispatch when the review mode is "code". In order:
//   1. prepare what the lenses read, beside the review: the evidence check result, the
//      covered commits, the patch and the changed-file list since the phase base
//   2. plan the lenses (domain review-lenses: every core lens, each conditional lens whose
//      trigger fires on the diff)
//   3. run each lens; an answer that is not its { lens, verdict, defects } document is
//      refused once, then recorded inconclusive
//   4. decide the verdict (domain review-verdict-policy: the severity matrix)
//   5. render reviews/{date}/{phase}-review-{N}.md with the review-verdict template
// The agents only report defects: the plan, the verdict and the review file are this code.
//
// Driven ports: trackingStore (list, write, prefix), sourceControl (headSha, range, commit, diff, changedFiles),
// agentRunner (the run's journaled runner), templateReader, progress.
// Outcome: Ok({ status, escalation, lenses }) once the review file is written;
//          Err({ code, reason }) otherwise, and the run stops — none of these is the
//          engineer's to fix, so none becomes a rework:
//            REVIEW_INPUTS     no phase base, no HEAD, or git could not produce the diff
//            LENS_UNAVAILABLE  the host does not have the lens
//            LENS_NO_ANSWER    the lens answered nothing, twice
//            INVALID_REVIEW    the review data does not validate

const MAX_LENS_ATTEMPTS = 2
const ADR_INDEX = 'docs/adr/decisions-index.md'

export const createRunReview = ({ trackingStore, sourceControl, agentRunner, templateReader, progress }) => {
  const prepareInputs = async ({ slug, phase, state, date, verification }) => {
    const base = state.phaseHistory?.[phase]?.baseSha ?? null
    const head = await sourceControl.headSha()
    if (!base || !head) return Err({ code: 'REVIEW_INPUTS', reason: `the ${phase} review needs the phase base and HEAD (base ${base ?? 'none'}, HEAD ${head ?? 'none'}); check the repository's git state, then resume` })
    const patch = await sourceControl.diff(base, head)
    const nameStatus = await sourceControl.changedFiles(base, head)
    if (patch === null || nameStatus === null) return Err({ code: 'REVIEW_INPUTS', reason: `git could not produce the diff ${base}..${head} the ${phase} lenses read; check the repository, then resume` })

    const recorded = recordedLensInputs(state.phaseArtifacts, await trackingStore.list(slug))
    const paths = reviewInputPaths({ date, story: storyOfEvidenceLog(recorded.evidenceLog) })
    const written = {}
    const write = async (kind, text) => {
      await trackingStore.write(slug, paths[kind], text)
      written[kind] = paths[kind]
    }
    if (verification) await write('qgVerify', `${JSON.stringify({ verdict: verification.verdict, findings: verification.findings }, null, 2)}\n`)
    const messages = []
    for (const sha of await sourceControl.range(base, head)) messages.push(`commit ${sha}\n${(await sourceControl.commit(sha))?.message ?? ''}`)
    await write('commits', messages.length > 0 ? `${messages.join('\n')}\n` : `no commit between ${base} and ${head}\n`)
    await write('patch', patch)
    await write('files', nameStatus)
    return Ok({ head, recorded, written, patch, nameStatus })
  }

  // [{ kind, path }] a lens reads, repository-relative; path null when nothing is on record.
  const inputsOf = (lens, { slug, recorded, written }) => {
    const tracked = (path) => (path ? `${trackingStore.prefix(slug)}${path}` : null)
    return lens.inputs.flatMap((kind) => {
      if (kind === 'adrIndex') return [{ kind, path: ADR_INDEX }]
      if (kind === 'feature') return recorded.feature.length > 0 ? recorded.feature.map((path) => ({ kind, path: tracked(path) })) : [{ kind, path: null }]
      if (Object.hasOwn(written, kind)) return [{ kind, path: tracked(written[kind]) }]
      return [{ kind, path: tracked(recorded[kind] ?? null) }]
    })
  }

  // A malformed answer is refused once, then the lens is inconclusive (the reviewer's rule);
  // a lens that answers nothing at all, twice, stops the review: that is the host's failure.
  const runLens = async (lens, { slug, story, phase, label, inputs }) => {
    let refused = null
    let answered = false
    for (let attempt = 1; attempt <= MAX_LENS_ATTEMPTS; attempt += 1) {
      const prompt = composeLensBrief({ lens, phase, slug, story, inputs, retry: refused })
      const answer = await agentRunner.run({ agent: lens.agent, phase, role: 'lens', label: `${label}:${lens.name}:${attempt}`, prompt })
      if (answer?.unavailable) return Err({ code: 'LENS_UNAVAILABLE', reason: answer.error ?? `${lens.agent} is not available on this host` })
      answered ||= Boolean(answer?.ok)
      const parsed = answer?.ok ? parseLensResult(answer.text, lens.name) : Err(`the lens returned no answer${answer?.error ? ` — ${answer.error}` : ''}`)
      if (parsed.ok) return parsed
      refused = parsed.error
      progress.log(`  ${lens.name}: answer refused (${refused})`)
    }
    if (!answered) return Err({ code: 'LENS_NO_ANSWER', reason: `${lens.agent} answered nothing in ${MAX_LENS_ATTEMPTS} dispatches (${refused}); check the host, then resume` })
    return Ok(inconclusiveLens(lens.name, refused))
  }

  const render = async (data) => {
    const normalized = normalize('review-verdict', data)
    const valid = validate('review-verdict', normalized)
    if (!valid.ok) return Err({ code: 'INVALID_REVIEW', reason: JSON.stringify({ missing: valid.missing, invalid: valid.invalid }) })
    const template = await templateReader.read(ARTIFACTS['review-verdict'].template)
    return Ok(renderArtifact('review-verdict', normalized, { readTemplate: () => template }))
  }

  // reviewPath — tracking-relative path of the review to write; label — unique per review,
  // so a host that memoizes identical dispatches keeps each lens call of each review apart.
  const review = async ({ slug, story = null, state, phase, reviewPath, date, label, verification = null }) => {
    const inputs = await prepareInputs({ slug, phase, state, date, verification })
    if (!inputs.ok) return inputs
    const prepared = inputs.value
    const lenses = planLenses({ phase, nameStatus: prepared.nameStatus, patch: prepared.patch })
    progress.log(`review (code): ${lenses.map(({ name }) => name).join(', ')}`)
    const results = []
    for (const lens of lenses) {
      const result = await runLens(lens, { slug, story, phase, label, inputs: inputsOf(lens, { slug, ...prepared }) })
      if (!result.ok) return result
      results.push(result.value)
      progress.log(`  ${lens.name}: ${result.value.verdict}`)
    }
    const decision = decideReview(results)
    const rendered = await render(codeReviewData({ lensResults: results, decision, reviewedSha: prepared.head }))
    if (!rendered.ok) return rendered
    await trackingStore.write(slug, reviewPath, rendered.value)
    return Ok(Object.freeze({ status: decision.status, escalation: decision.escalation, lenses: Object.freeze(results) }))
  }

  return Object.freeze({ review })
}
