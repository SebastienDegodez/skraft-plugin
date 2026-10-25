/**
 * The branch a ref names, as a pull request takes it for its base: `main`, `refs/heads/main`,
 * `<remote>/main` and `refs/remotes/<remote>/main` all name `main` for any remote of the
 * repository; another prefix is part of the branch's name. A sha, `HEAD` or a ref with a
 * revision suffix names no branch.
 */

const REF_PREFIX = /^(?:refs\/heads\/|refs\/remotes\/)/
const BRANCH = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/
const SHA = /^[0-9a-f]{7,64}$/i

/** @param {string} ref @param {string[]} remotes the repository's remote names @returns {string | null} */
export const branchOf = (ref, remotes) => {
  const bare = ref.replace(REF_PREFIX, '')
  const remote = remotes.find((candidate) => bare.startsWith(`${candidate}/`))
  const name = remote === undefined ? bare : bare.slice(remote.length + 1)
  return BRANCH.test(name) && !SHA.test(name) && name !== 'HEAD' ? name : null
}
