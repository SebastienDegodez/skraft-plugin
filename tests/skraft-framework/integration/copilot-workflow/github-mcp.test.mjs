import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { runSkraftReviewWorkflow } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/skraft-review-workflow.mjs'
import { createHostConfirmation } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/host-confirmation.mjs'
import { createSessionMcp } from '../../../../plugins/skraft-framework/engine/drivers/copilot-workflow/session-mcp.mjs'
import { actsAs, confirmingSession, PLUGIN_ROOT, simulatedContext } from './simulated-host.mjs'
import { pullRequestRepository, reviewLlm } from '../support/pull-request-repository.mjs'

const SERVER = 'github-mcp-server'
const MCP_COMMENT = 'https://github.com/acme/shop/pull/12#issuecomment-5001'

/**
 * The joined session's GitHub MCP server, as Copilot CLI 1.0.102-1 gives it to the extension: listed
 * by `rpc.mcp.list`, its tools run by `rpc.tools.execute` as `<server>-<tool>`; `answer` gives the
 * result of each call. `executed` keeps each tool name called.
 * @param {object} pull the pull request gh knows @param {{ list?: () => Promise<unknown>, answer?: (name: string) => object | null }} [options]
 */
const githubServer = (pull, { list, answer } = {}) => {
  const executed = []
  const comments = []
  const tools = {
    [`${SERVER}-pull_request_read`]: () => ({ number: pull.number, title: pull.title, body: pull.body, html_url: 'https://github.com/acme/shop/pull/12', base: { ref: pull.baseRefName, sha: pull.baseRefOid }, head: { ref: pull.headRefName, sha: pull.headRefOid } }),
    [`${SERVER}-get_me`]: () => ({ login: 'sebastien' }),
    [`${SERVER}-issue_read`]: () => comments,
    [`${SERVER}-add_issue_comment`]: ({ body }) => {
      comments.push({ id: 5001, body, html_url: MCP_COMMENT, user: { login: 'sebastien' } })
      return { id: '5001', url: MCP_COMMENT }
    },
    [`${SERVER}-update_issue_comment`]: ({ body }) => {
      comments[0].body = body
      return { id: '5001', url: MCP_COMMENT }
    },
  }
  const execute = async ({ name, arguments: args }) => {
    executed.push(name)
    const given = answer?.(name)
    if (given) return given
    return tools[name] ? { resultType: 'success', textResultForLlm: JSON.stringify(tools[name](args)) } : { resultType: 'failure', textResultForLlm: `Tool '${name}' does not exist.` }
  }
  return { executed, comments, rpc: { mcp: { list: list ?? (async () => ({ servers: [{ name: SERVER, status: 'connected' }] })) }, tools: { execute } } }
}

/**
 * The Copilot host of a review whose remote is on github.com, gh the fake forge on its PATH, the
 * person confirming, and the session's MCP servers those of `server`.
 * @param {import('node:test').TestContext} t @param {(repo: ReturnType<typeof pullRequestRepository>) => object} serverOf
 */
const onGithub = (t, serverOf) => {
  const repo = pullRequestRepository(t)
  execFileSync('git', ['remote', 'set-url', 'origin', 'https://github.com/acme/shop.git'], { cwd: repo.cwd })
  const path = process.env.PATH
  process.env.PATH = repo.env.PATH
  t.after(() => { process.env.PATH = path })
  const person = confirmingSession()
  const server = serverOf(repo)
  const session = { ...person, rpc: { ...person.rpc, ...server.rpc } }
  const host = { cwd: repo.cwd, pluginRoot: PLUGIN_ROOT, home: `${repo.cwd}-home`, confirmation: createHostConfirmation({ session: () => session }), mcp: createSessionMcp({ session: () => session }) }
  return { repo, server, host }
}

/** What gh was asked about the pull request and its comments, beyond which repository is the default. @param {ReturnType<typeof pullRequestRepository>} repo */
const ghOnForge = (repo) => repo.forge.calls().filter((args) => args[0] === 'pr' || args[0] === 'api')

test('a review in Copilot reads its pull request and keeps its comment through the session\'s GitHub MCP server, gh asked nothing of the forge', async (t) => {
  const { repo, server, host } = onGithub(t, (repo) => githubServer(repo.forge.state().pull))
  const { ctx } = simulatedContext({ args: { pr: 12, publish: true }, otherwise: actsAs(reviewLlm()) })

  const outcome = await runSkraftReviewWorkflow(ctx, host)

  assert.deepEqual([outcome.status, outcome.comment, outcome.unpublished], ['NEEDS_REWORK', MCP_COMMENT, null])
  assert.deepEqual(server.executed, [`${SERVER}-pull_request_read`, `${SERVER}-get_me`, `${SERVER}-issue_read`, `${SERVER}-add_issue_comment`])
  assert.ok(server.comments[0].body.startsWith('### skraft review · #12 — NEEDS_REWORK (pass 1)'), server.comments[0].body)
  assert.deepEqual(ghOnForge(repo), [])
})

const FALLBACKS = {
  refused: (repo) => githubServer(repo.forge.state().pull, { answer: () => ({ resultType: 'rejected', textResultForLlm: 'The user rejected this tool call.' }) }),
  failed: (repo) => githubServer(repo.forge.state().pull, { answer: () => ({ resultType: 'failure', textResultForLlm: 'boom: secret-token' }) }),
  unlisted: (repo) => githubServer(repo.forge.state().pull, { list: async () => { throw new Error('MCP server "github-mcp-server" is not connected') } }),
  failing: (repo) => githubServer(repo.forge.state().pull, { list: async () => ({ servers: [{ name: SERVER, status: 'failed' }] }) }),
  thrown: (repo) => githubServer(repo.forge.state().pull, { answer: () => { throw new Error('secret-token') } }),
}

for (const [name, serverOf] of Object.entries(FALLBACKS)) {
  test(`a GitHub MCP server that is ${name}: the review goes to gh, which keeps the comment, and no host text reaches the outcome`, async (t) => {
    const { repo, host } = onGithub(t, serverOf)
    const { ctx, logs } = simulatedContext({ args: { pr: 12, publish: true }, otherwise: actsAs(reviewLlm()) })

    const outcome = await runSkraftReviewWorkflow(ctx, host)

    assert.deepEqual([outcome.status, outcome.comment, outcome.unpublished], ['NEEDS_REWORK', 'https://github.com/acme/shop/issues/12#issuecomment-901', null], name)
    assert.deepEqual(repo.forge.state().comments.length, 1, name)
    assert.ok(ghOnForge(repo).some((args) => args[0] === 'pr' && args[1] === 'view'), name)
    assert.ok(!JSON.stringify([outcome, logs]).includes('secret-token'), name)
  })
}
