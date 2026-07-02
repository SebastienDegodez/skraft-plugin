import { mandatorySkillsFor, missingSkills, extractReadSkills } from '../domain/skill-policy.mjs'
import { expectedArtifactsFor, missingArtifacts, parseReviewVerdict, requiresVerifiedCommit } from '../domain/artifact-policy.mjs'
import { validatePipelineState } from '../domain/state-schema.mjs'
import { isOk } from '../domain/result.mjs'
import { allow, block } from '../adapters/api/hooks/decision.mjs'

// Determines whether agentName is the current phase's specialist or reviewer.
const roleOf = (agentName, phaseAgents) => {
  if (!phaseAgents) return null
  if (phaseAgents.specialist === agentName) return 'specialist'
  if (phaseAgents.reviewer === agentName) return 'reviewer'
  return null
}

// Matches ProjectSlug (domain/value-objects.mjs) — guards path construction below
// against directory traversal via a malformed projectSlug (e.g. "../../etc").
const SAFE_PROJECT_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

// G4/G5 completion guard: fail-closed. Only runs when the state/filesystem ports
// are wired and a projectSlug is given — unconfigured deployments skip it entirely
// (the SubagentStop skill check above still applies unconditionally).
const checkCompletion = async ({ config, agentName, projectSlug, stateReader, filesystem, commitVerifier }) => {
  if (!SAFE_PROJECT_SLUG_RE.test(projectSlug)) {
    return {
      blocked: true,
      message: 'Completion blocked: projectSlug is not a valid slug',
      audit: { eventType: 'CompletionChecked', agentName, projectSlug, decision: 'BLOCK', reason: 'invalid_project_slug' }
    }
  }

  let raw
  try {
    raw = await stateReader.read(projectSlug)
  } catch (error) {
    return {
      blocked: true,
      message: 'Completion blocked: recorded pipeline state could not be read',
      audit: { eventType: 'CompletionChecked', agentName, projectSlug, decision: 'BLOCK', reason: 'state_unreadable', detail: error?.message }
    }
  }

  const validated = validatePipelineState(raw)
  if (!isOk(validated)) {
    return {
      blocked: true,
      message: 'Completion blocked: recorded pipeline state is invalid',
      audit: { eventType: 'CompletionChecked', agentName, projectSlug, decision: 'BLOCK', reason: 'state_invalid' }
    }
  }

  const state = validated.value
  const phase = state.currentPhase
  const role = roleOf(agentName, config?.phaseAgents?.[phase])
  if (!role) return null // agentName isn't this phase's specialist/reviewer — nothing to complete

  const recordedPaths = (role === 'specialist' ? state.phaseArtifacts[phase] : state.reviewArtifacts[phase]) ?? []
  const expected = expectedArtifactsFor(agentName, config)
  const missing = missingArtifacts(expected, recordedPaths)
  if (missing.length > 0) {
    return {
      blocked: true,
      message: `Completion blocked: missing expected artifact(s) for ${agentName}: ${missing.join(', ')}`,
      audit: { eventType: 'CompletionChecked', agentName, projectSlug, phase, role, decision: 'BLOCK', reason: 'artifact_missing', missing }
    }
  }

  // G5: the reviewer's recorded verdict must match what it actually wrote to disk.
  // Recorded paths are relative to the project's own tracking directory.
  if (role === 'reviewer' && filesystem) {
    for (const path of recordedPaths) {
      let content
      try {
        content = await filesystem.readFile(`${projectSlug}/${path}`)
      } catch (error) {
        return {
          blocked: true,
          message: `Completion blocked: review artifact could not be read: ${path}`,
          audit: { eventType: 'CompletionChecked', agentName, projectSlug, phase, role, decision: 'BLOCK', reason: 'review_unreadable', path, detail: error?.message }
        }
      }
      const parsedVerdict = parseReviewVerdict(content)
      const recordedVerdict = state.verdicts[phase]
      if (!parsedVerdict || parsedVerdict !== recordedVerdict) {
        return {
          blocked: true,
          message: `Completion blocked: review verdict in ${path} does not match the recorded verdict`,
          audit: { eventType: 'CompletionChecked', agentName, projectSlug, phase, role, decision: 'BLOCK', reason: 'verdict_mismatch', path, parsedVerdict, recordedVerdict }
        }
      }
    }
  }

  // G5: DELIVER never advances without a verified git commit.
  if (role === 'specialist' && requiresVerifiedCommit(phase)) {
    if (!commitVerifier) {
      return {
        blocked: true,
        message: 'Completion blocked: DELIVER requires a verified git commit',
        audit: { eventType: 'CompletionChecked', agentName, projectSlug, phase, role, decision: 'BLOCK', reason: 'commit_verifier_unavailable' }
      }
    }
    const commitStatus = await commitVerifier.verify()
    if (!commitStatus?.clean) {
      return {
        blocked: true,
        message: 'Completion blocked: DELIVER requires a verified git commit (working tree not clean)',
        audit: { eventType: 'CompletionChecked', agentName, projectSlug, phase, role, decision: 'BLOCK', reason: 'commit_unverified' }
      }
    }
  }

  return {
    blocked: false,
    audit: { eventType: 'CompletionChecked', agentName, projectSlug, phase, role, decision: 'ALLOW', reason: 'complete' }
  }
}

// SubagentStop guard. Two independent checks, either can block:
// - G2/G3 skill guard: reads the transcript, extracts all SKILL.md reads, blocks if
//   any mandatory skill was never loaded. Fail-open on transcript unavailability
//   (ADR-006): monitoring failure ≠ compliance signal.
// - G4/G5 completion guard: fail-closed artifact + verdict + commit check before
//   the phase is allowed to advance (never progress on a simple LLM assertion).
export const createSubagentStopService = ({ config, transcriptReaderFactory, auditWriter, clock, stateReader, filesystem, commitVerifier }) => ({
  handle: async ({ agentName, transcript, projectSlug } = {}) => {
    try {
      const skillEntries = mandatorySkillsFor(agentName, config)
      if (skillEntries.length > 0) {
        const requiredNames = skillEntries.map((s) => s.name)
        const now = clock.now()

        let readSkills
        try {
          const content = await transcriptReaderFactory({ transcript }).read()
          readSkills = extractReadSkills(content)
        } catch {
          // ADR-006: transcript unavailable is a monitoring failure, not a compliance signal
          await auditWriter.write({
            eventType: 'SkillComplianceChecked',
            agentName,
            decision: 'ALLOW',
            reason: 'transcript_unavailable',
            missingSkills: [],
            timestamp: now
          }).catch(() => {})
          return allow()
        }

        const missing = missingSkills(readSkills, requiredNames)
        const decision = missing.length > 0 ? 'BLOCK' : 'ALLOW'

        await auditWriter.write({
          eventType: 'SkillComplianceChecked',
          agentName,
          decision,
          missingSkills: missing,
          reason: missing.length === 0 ? 'all_present' : 'skill_absent',
          timestamp: now
        }).catch(() => {})

        if (missing.length > 0) {
          return block(`Mandatory skill not loaded: ${missing[0]}`)
        }
      }

      if (stateReader && projectSlug) {
        const completion = await checkCompletion({ config, agentName, projectSlug, stateReader, filesystem, commitVerifier })
        if (completion) {
          await auditWriter.write(completion.audit).catch(() => {})
          if (completion.blocked) return block(completion.message)
        }
      }

      return allow()
    } catch {
      // Fail-open: any unexpected crash must not block the agent (ADR-006)
      return allow()
    }
  }
})
