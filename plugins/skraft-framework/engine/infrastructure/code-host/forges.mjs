import { createGhCodeHost, createGhPullRequests } from './gh-code-host.mjs'
import { createAzCodeHost, createAzPullRequests } from './az-code-host.mjs'

/**
 * The adapters of each forge skraft reaches, by forge, through any host's CommandRunner: GitHub's
 * on `git` and `gh`, Azure DevOps's on `git` and `az`. No Node API here.
 * @param {{ commandRunner: import('../../application/ports/command-runner.mjs').CommandRunner }} options
 * @returns {Record<'github' | 'azure-devops', { codeHost: import('../../application/ports/code-host.mjs').CodeHost, pullRequests: import('../../application/ports/pull-requests.mjs').PullRequests }>}
 */
export const createForges = ({ commandRunner }) => Object.freeze({
  github: Object.freeze({ codeHost: createGhCodeHost({ commandRunner }), pullRequests: createGhPullRequests({ commandRunner }) }),
  'azure-devops': Object.freeze({ codeHost: createAzCodeHost({ commandRunner }), pullRequests: createAzPullRequests({ commandRunner }) }),
})
