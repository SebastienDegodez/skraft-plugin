export const total = (cents: readonly number[]): number => cents.reduce((sum, one) => sum + one, 0)
