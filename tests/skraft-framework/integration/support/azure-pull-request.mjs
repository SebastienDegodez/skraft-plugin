import { NUMBER } from './pull-request-repository.mjs'

/** The Azure Repos remote the review tests point the working copy's origin to. */
export const AZURE_REMOTE = 'https://dev.azure.com/acme/Shop%20Team/_git/payment'

/**
 * The pull request of the working copy `pullRequestRepository` makes, as Azure Repos answers it.
 * @param {{ head: string, base: string }} repo
 */
export const azurePullRequestOf = ({ head, base }) => ({
  pullRequestId: NUMBER, title: 'Discount at checkout', description: 'Applies a discount.',
  sourceRefName: 'refs/heads/discount', targetRefName: 'refs/heads/main',
  lastMergeSourceCommit: { commitId: head }, lastMergeTargetCommit: { commitId: base },
  repository: { name: 'payment', project: { name: 'Shop Team' } },
  url: `https://dev.azure.com/acme/Shop%20Team/_apis/git/repositories/payment/pullRequests/${NUMBER}`,
})

/** The thread the first review pass posts, as the in-memory server numbers it. */
export const THREAD_URL = `https://dev.azure.com/acme/Shop%20Team/_apis/git/repositories/payment/pullRequests/${NUMBER}/threads/41/comments/1`
