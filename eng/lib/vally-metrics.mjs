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

const scoreOf = (record) => Number(record.gradeResult?.score ?? 0)

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
	}
}