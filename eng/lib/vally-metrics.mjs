import { contrastScore } from './paired-trials.mjs'

const round = (value, precision = 3) => {
	if (value == null || Number.isNaN(value)) return null
	const factor = 10 ** precision
	return Math.round(value * factor) / factor
}

const mean = (values) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : null)

const median = (values) => {
	if (!values.length) return null
	const ordered = [...values].sort((left, right) => left - right)
	const middle = Math.floor(ordered.length / 2)
	return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

const trials = (records) => records.filter((record) => record?.type === 'trial-result')

// The same score the sign test contrasts, with the activation grader taken back
// out. Read raw, the quality delta would inherit the bias the tally was fixed
// to avoid: the baseline arm has no skills mounted, so it fails that grader on
// every trial and the treatment passes it on every trial.
const scoreOf = (record) => contrastScore(record)

const nonActivation = (record) => record.trajectory?.stimulus?.tags?.intent === 'non-activation'

const activationCount = (record, skill) => Number(record.trajectory?.metrics?.skillActivationBreakdown?.[skill] ?? 0)

const efficiencyOf = (records) => {
	const values = trials(records)
	return {
		durationMs: round(median(values.map((record) => Number(record.durationMs ?? 0))), 0),
		tokens: round(median(values.map((record) => Number(record.trajectory?.metrics?.tokenUsage?.totalTokens ?? 0))), 0),
		turns: round(median(values.map((record) => Number(record.trajectory?.metrics?.turnCount ?? 0))), 1),
		toolCalls: round(median(values.map((record) => Number(record.trajectory?.metrics?.toolCallCount ?? 0))), 1),
	}
}

const percentDelta = (baseline, treatment) => (baseline ? round(((treatment - baseline) / baseline) * 100, 1) : null)

/**
 * Identity of a run, used to pair the two arms.
 *
 * Mirrors `keyOf` in paired-trials.mjs: both arms replay the same spec, so the
 * stimulus plus the trial index names the same run on each side, and `itemId`
 * is the fallback for records that predate those fields. Position in the file
 * is not identity — Vally appends a trial the moment it finishes, so line i of
 * one arm is routinely not the counterpart of line i of the other.
 */
const pairingKey = (record) => {
	const stimulus = typeof record.stimulus === 'string' ? record.stimulus : (record.trajectory?.stimulus?.name ?? null)
	const index = record.trialIndex
	if (stimulus != null && index != null) return `${stimulus} ${index}`
	return record.itemId ?? null
}

/**
 * The runs that can price the skill: matched on both arms, skill loaded.
 *
 * `efficiencyOf` takes one median per arm over every trial, so its two sides can
 * land on different scenarios and the skilled side can be carried by runs the
 * skill never touched. These pairs answer the narrower question — what the same
 * run cost with the skill and without it. A non-activation guard leaves with the
 * rest: zero activations there is the correct outcome, but it still prices a
 * baseline against a baseline.
 */
const activatedPairs = (baselineTrials, skilledTrials, skill) => {
	const baselineByKey = new Map()
	for (const record of baselineTrials) {
		const key = pairingKey(record)
		if (key != null && !baselineByKey.has(key)) baselineByKey.set(key, record)
	}

	const pairs = []
	for (const skilled of skilledTrials) {
		const key = pairingKey(skilled)
		const baseline = key == null ? undefined : baselineByKey.get(key)
		if (baseline && activationCount(skilled, skill) > 0) pairs.push({ baseline, skilled })
	}
	return pairs
}

// Null, never a zero delta, when no pair qualifies: a comparison that could not
// be made must not read as a comparison that found no difference.
const pairedEfficiencyOf = (pairs) => {
	if (!pairs.length) return null
	const baseline = efficiencyOf(pairs.map((pair) => pair.baseline))
	const skilled = efficiencyOf(pairs.map((pair) => pair.skilled))
	return {
		// Published so a reader can see how thin the basis is: two pairs is a
		// number to read out loud, not a number to act on.
		pairCount: pairs.length,
		baseline,
		skilled,
		durationDeltaPercent: percentDelta(baseline.durationMs, skilled.durationMs),
		tokenDeltaPercent: percentDelta(baseline.tokens, skilled.tokens),
	}
}

export const buildEvaluationMetrics = (baselineRecords, skilledRecords, skill) => {
	const baseline = trials(baselineRecords)
	const skilled = trials(skilledRecords)
	const expected = skilled.filter((record) => !nonActivation(record))
	const excluded = skilled.filter(nonActivation)
	const actual = expected.filter((record) => activationCount(record, skill) > 0).length
	const unexpected = excluded.filter((record) => activationCount(record, skill) > 0).length
	const baselineEfficiency = efficiencyOf(baseline)
	const skilledEfficiency = efficiencyOf(skilled)
	const baselineQuality = round(mean(baseline.map(scoreOf)))
	const skilledQuality = round(mean(skilled.map(scoreOf)))

	return {
		quality: {
			baseline: baselineQuality,
			skilled: skilledQuality,
			delta: baselineQuality == null || skilledQuality == null ? null : round(skilledQuality - baselineQuality),
		},
		activation: {
			expected: expected.length,
			actual,
			unexpected,
			rate: expected.length ? round(actual / expected.length) : 1,
		},
		efficiency: {
			baseline: baselineEfficiency,
			skilled: skilledEfficiency,
			durationDeltaPercent: percentDelta(baselineEfficiency.durationMs, skilledEfficiency.durationMs),
			tokenDeltaPercent: percentDelta(baselineEfficiency.tokens, skilledEfficiency.tokens),
		},
		// The same shape, restricted to runs present on both arms where the skill
		// actually loaded — the only trials that price the skill rather than the
		// scenario mix. `efficiency` above stays as it was for its consumers.
		efficiencyPaired: pairedEfficiencyOf(activatedPairs(baseline, skilled, skill)),
	}
}