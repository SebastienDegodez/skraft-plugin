const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** @param {unknown} value @returns {value is string} */
export const isSlug = (value) => typeof value === 'string' && KEBAB.test(value)

/**
 * The slug of a branch: lowercase, every run of other characters than letters and digits one
 * hyphen, none at either end (`feat/Checkout_Refund` → `feat-checkout-refund`).
 * @param {string} branch
 */
export const branchSlug = (branch) => branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
