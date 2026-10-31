// A host for ReviewPullRequest: the working copy checked out on the pull request's head, its
// forge, its review folder; every port a hand-written double, the lenses a scripted LLM.
import { createReviewPullRequest } from '../../../../plugins/skraft-framework/engine/application/review/review-pull-request-usecase.mjs'
import {
  FakeHasher, FixedClock, InMemoryAgentCatalog, InMemoryAzureMcp, InMemoryCodeHost, InMemoryGit, InMemoryPullRequests, InMemoryRunLock, InMemoryTracking, InMemoryUserSettings, InMemoryWorkflowSource, InMemoryWorkspace,
  ManualTimer, RecordingProgress, ScriptedAgentRunner, ScriptedHuman,
} from '../support/in-memory-host.mjs'
import { API } from '../support/pipeline-host.mjs'

export { finding, lenses, refutes, says } from '../support/pipeline-host.mjs'

export const NUMBER = 12
export const SLUG = `pr-${NUMBER}`
export const REVIEWS = `/work/.copilot-tracking/skraft-reviews/${SLUG}`
export const TEST_FILE = 'tests/Checkout.UnitTest/CheckoutTests.cs'

/** The pull request, its head the working copy's first commit after the base. */
export const PULL_REQUEST = Object.freeze({
  number: NUMBER,
  url: `https://github.example.com/acme/shop/pull/${NUMBER}`,
  title: 'Discount at checkout',
  body: 'Applies a 10% discount to orders above 100.',
  base: Object.freeze({ ref: 'main', sha: 'main-tip' }),
  head: Object.freeze({ ref: 'discount', sha: 'root-1' }),
})

/** The Azure Repos repository the working copy's remote names, in the project Shop Team. */
export const AZURE_REMOTE = 'https://dev.azure.com/acme/Shop%20Team/_git/payment'

/** The pull request as Azure Repos names its page. */
export const AZURE_PULL_REQUEST = Object.freeze({ ...PULL_REQUEST, url: 'https://dev.azure.com/acme/Shop%20Team/_git/payment/pullrequest/12' })

/**
 * The pull request as the REST API of Azure Repos answers it: its branches by full name, the commits of its last merge.
 * @param {typeof PULL_REQUEST} pullRequest @param {{ repository?: string, project?: string, organization?: string }} [where]
 */
export const azureJsonOf = ({ number, title, body, base, head }, { repository = 'payment', project = 'Shop Team', organization = 'https://dev.azure.com/acme' } = {}) => ({
  pullRequestId: number, title, description: body,
  sourceRefName: `refs/heads/${head.ref}`, targetRefName: `refs/heads/${base.ref}`,
  lastMergeSourceCommit: { commitId: head.sha }, lastMergeTargetCommit: { commitId: base.sha },
  repository: { name: repository, project: { name: project } },
  url: `${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${repository}/pullRequests/${number}`,
})

/**
 * @param {{
 *   config?: object | null, files?: Record<string, string>, pullRequest?: object, forge?: object, answers?: Array<object | null>,
 *   catalog?: InMemoryAgentCatalog, workflowSource?: InMemoryWorkflowSource,
 *   user?: string, base?: Record<string, string>, remote?: string, azure?: boolean, mcp?: object | null,
 * }} [options] config: skraft-config.json at the pull request's base, none when null; files: more files of the working copy;
 *   azure: the working copy is on an Azure Repos repository whose forge is the az double (not installed), the pull request its own;
 *   mcp: the host's Azure DevOps MCP server, with these options, none when null;
 *   user: ~/.skraft/config.json; base: more files the base commit holds; remote: the URL of the working copy's remote
 */
/**
 * The review folder as the working copy has it: its own, until a test links it elsewhere; the
 * paths it opens as review state are those a test names, whatever their spelling.
 */
class InMemoryReviewFolder {
  linked = false
  /** @type {Set<string>} */
  opens = new Set()
  /** @type {string[][]} */
  asked = []
  async contained() { return !this.linked }
  async holdsTracked(paths) {
    this.asked.push([...paths].sort())
    return paths.some((path) => this.opens.has(path))
  }
}

/** What az, the double of the forge on Azure Repos, is told: not installed, so that a review it serves shows. */
const AZURE_FORGE = Object.freeze({
  unavailable: 'az, the Azure CLI, is not installed',
  repository: { host: 'dev.azure.com', repository: 'acme/Shop Team/payment' },
  pages: 'https://dev.azure.com/acme/Shop%20Team/_git/payment',
  checkout: (/** @type {number} */ number) => `az repos pr checkout --id ${number}`,
  takesRequestFile: true,
})

export const reviewHost = ({ config = { components: [API] }, files = {}, pullRequest, forge = {}, answers = [], catalog = new InMemoryAgentCatalog(), workflowSource = new InMemoryWorkflowSource(), user, base = {}, remote, azure = false, mcp = null } = {}) => {
  const reviews = new InMemoryTracking({ root: '/work/.copilot-tracking/skraft-reviews' })
  const found = pullRequest ?? (azure ? AZURE_PULL_REQUEST : PULL_REQUEST)
  const git = new InMemoryGit({ repositories: { '.': { mergeBases: { 'main-tip': 'root-0' } } }, remote: remote ?? (azure ? AZURE_REMOTE : undefined) })
  git.holds('main-tip', { ...(config === null ? {} : { 'skraft-config.json': JSON.stringify(config) }), ...base })
  const pullRequests = new InMemoryPullRequests({ pullRequests: [found], ...(azure ? AZURE_FORGE : {}), ...forge })
  pullRequests.read = (file) => reviews.files.get(file.slice(`${reviews.root}/`.length)) ?? ''
  const deps = {
    forges: { [azure ? 'azure-devops' : 'github']: { codeHost: new InMemoryCodeHost(), pullRequests } },
    reviewJournal: reviews,
    reviewFiles: reviews,
    workspace: new InMemoryWorkspace(files),
    userSettings: new InMemoryUserSettings(user),
    sourceControl: git,
    workflowSource,
    agentCatalog: catalog,
    agentRunner: new ScriptedAgentRunner(),
    human: new ScriptedHuman(answers),
    progress: new RecordingProgress(),
    hasher: new FakeHasher(),
    clock: new FixedClock('2026-10-20T09:00:00.000Z'),
    journalKeys: reviews.journalKeys,
    reviewLock: new InMemoryRunLock(reviews),
    reviewFolder: new InMemoryReviewFolder(),
    timer: new ManualTimer(),
  }
  const server = mcp === null ? null : new InMemoryAzureMcp({ pullRequests: { [found.number]: azureJsonOf(found) }, ...mcp })
  if (server !== null) deps.mcpTools = server
  return {
    deps,
    mcp: server,
    git,
    reviews,
    pullRequests,
    agentRunner: deps.agentRunner,
    human: deps.human,
    progress: deps.progress,
    userSettings: deps.userSettings,
    workspace: deps.workspace,
    events: () => reviews.journal(SLUG),
    /** @param {{ publish?: boolean, number?: number }} [request] */
    review: ({ publish = false, number = NUMBER } = {}) => createReviewPullRequest(deps).review({ number, publish, workingCopyName: 'shop' }),
    /** The prompt of a lens agent's last dispatch. @param {string} agent */
    prompt: (agent) => deps.agentRunner.reviewed().findLast((dispatch) => dispatch.agent === agent).prompt,
  }
}

/** The head commit of the pull request: an assertion of the checkout tests weakened. @param {InMemoryGit} git */
export const weakensAssertion = (git) => {
  git.commit('test: relax the discount check', [TEST_FILE])
  git.removes(TEST_FILE, '        Assert.Equal(90, total);')
  git.adds(TEST_FILE, '        Assert.NotNull(total);')
}
