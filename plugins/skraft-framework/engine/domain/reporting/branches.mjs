/**
 * The branch a ref names, as a pull request takes it for its base: `main`, `refs/heads/main`,
 * `origin/main` and `refs/remotes/origin/main` all name `main`. A sha, `HEAD` or a ref with a
 * revision suffix names no branch.
 */

const REMOTE_PREFIX = /^(?:refs\/heads\/|refs\/remotes\/[^/]+\/|origin\/)/
const BRANCH = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/
const SHA = /^[0-9a-f]{7,64}$/i

/** @param {string} ref @returns {string | null} */
export const branchOf = (ref) => {
  const name = ref.replace(REMOTE_PREFIX, '')
  return BRANCH.test(name) && !SHA.test(name) && name !== 'HEAD' ? name : null
}
