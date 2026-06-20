export const andSpec = (a, b) => ({
  isSatisfiedBy: (candidate) => a.isSatisfiedBy(candidate) && b.isSatisfiedBy(candidate)
})

export const orSpec = (a, b) => ({
  isSatisfiedBy: (candidate) => a.isSatisfiedBy(candidate) || b.isSatisfiedBy(candidate)
})

export const notSpec = (a) => ({
  isSatisfiedBy: (candidate) => !a.isSatisfiedBy(candidate)
})
