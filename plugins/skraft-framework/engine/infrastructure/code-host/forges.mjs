import { createGhCodeHost, createGhPullRequests } from './gh-code-host.mjs'

/**
 * The adapters of each forge skraft reaches, by forge, through any host's CommandRunner: GitHub's
 * on `git` and `gh`. No Node API here.
 * @param {{ commandRunner: import('../../application/ports/command-runner.mjs').CommandRunner }} options
 * @returns {{ github: { codeHost: import('../../application/ports/code-host.mjs').CodeHost, pullRequests: import('../../application/ports/pull-requests.mjs').PullRequests } }}
 */
export const createForges = ({ commandRunner }) => Object.freeze({
  github: Object.freeze({ codeHost: createGhCodeHost({ commandRunner }), pullRequests: createGhPullRequests({ commandRunner }) }),
})
