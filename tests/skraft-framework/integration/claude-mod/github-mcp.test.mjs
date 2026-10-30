import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { actsAs, scriptedModHost } from './support/scripted-mod-host.mjs'
import { pullRequestRepository, reviewLlm } from '../support/pull-request-repository.mjs'

const MCP_COMMENT = 'https://github.com/acme/shop/pull/12#issuecomment-5001'

/** `$.process.run` on the repository's PATH, where gh is the fake forge. @param {NodeJS.ProcessEnv} env */
const runOn = (env) => ([program, ...args], init = {}) => new Promise((resolve, reject) => {
  const child = spawn(program, args, { cwd: init.cwd, env, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' && program === 'gh' })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.once('error', reject)
  child.once('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
})

/**
 * The session's GitHub MCP server as Claude Code 2.1.291 gives it to a mod: its tools listed by
 * `$.tool.list` as `mcp__github__<tool>`, called by `$.mcp.call`, which `refuse` may reject.
 * @param {object} pull the pull request gh knows @param {{ refuse?: string, tools?: unknown[] }} [options]
 */
const githubServer = (pull, { refuse, tools } = {}) => {
  const called = []
  const comments = []
  const answers = {
    pull_request_read: () => ({ number: pull.number, title: pull.title, body: pull.body, html_url: 'https://github.com/acme/shop/pull/12', base: { ref: pull.baseRefName, sha: pull.baseRefOid }, head: { ref: pull.headRefName, sha: pull.headRefOid } }),
    get_me: () => ({ login: 'sebastien' }),
    issue_read: () => comments,
    add_issue_comment: ({ body }) => {
      comments.push({ id: 5001, body, html_url: MCP_COMMENT, user: { login: 'sebastien' } })
      return { id: '5001', url: MCP_COMMENT }
    },
  }
  return {
    called,
    comments,
    tools: async () => tools ?? [{ name: 'Bash' }, ...Object.keys(answers).map((tool) => ({ name: `mcp__github__${tool}` }))],
    call: async (server, tool, args) => {
      called.push(`${server} ${tool}`)
      if (refuse !== undefined) throw new Error(refuse)
      return { content: [{ type: 'text', text: JSON.stringify(answers[tool](args)) }], isError: false }
    },
  }
}

/** The mod on the pull request's working copy, its remote on github.com, gh the fake forge, `$.mcp` the server. @param {import('node:test').TestContext} t @param {object} [options] */
const modOnGithub = async (t, options) => {
  const repo = pullRequestRepository(t)
  execFileSync('git', ['remote', 'set-url', 'origin', 'https://github.com/acme/shop.git'], { cwd: repo.cwd })
  const mod = await scriptedModHost({ cwd: repo.cwd, otherwise: actsAs(reviewLlm()) })
  const own = mod.host.run
  const onPath = runOn(repo.env)
  mod.host.run = (argv, init) => (argv[0] === 'node' ? own(argv, init) : onPath(argv, init))
  const server = githubServer(repo.forge.state().pull, options)
  mod.host.mcp = server
  return { repo, mod, server }
}

/** What gh was asked about the pull request and its comments. @param {ReturnType<typeof pullRequestRepository>} repo */
const ghOnForge = (repo) => repo.forge.calls().filter((args) => args[0] === 'pr' || args[0] === 'api')

test('/skraft review 12 --publish in Claude Code reads the pull request and keeps its comment through the session\'s GitHub MCP server, gh asked nothing of the forge', async (t) => {
  const { repo, mod, server } = await modOnGithub(t)

  await mod.command('review 12 --publish')
  const outcome = await mod.settled()

  assert.deepEqual([outcome.status, outcome.comment, outcome.unpublished], ['NEEDS_REWORK', MCP_COMMENT, null])
  assert.deepEqual(server.called, ['github pull_request_read', 'github get_me', 'github issue_read', 'github add_issue_comment'])
  assert.ok(server.comments[0].body.startsWith('### skraft review · #12 — NEEDS_REWORK (pass 1)'), server.comments[0].body)
  assert.deepEqual(ghOnForge(repo), [])
})

for (const [name, options] of Object.entries({
  'not granted': { refuse: "refused: Claude requested permissions to use mcp__github__pull_request_read, but you haven't granted it yet." },
  'not connected': { refuse: 'no connected MCP tool "pull_request_read" on a server named "github"' },
  'not listed': { tools: [{ name: 'Bash' }, { name: 'mcp__skraft__run_pipeline' }] },
})) {
  test(`a GitHub MCP server ${name}: the review goes to gh, which keeps the comment, and no host text reaches the outcome`, async (t) => {
    const { repo, mod } = await modOnGithub(t, options)

    await mod.command('review 12 --publish')
    const outcome = await mod.settled()

    assert.deepEqual([outcome.status, outcome.comment, outcome.unpublished], ['NEEDS_REWORK', 'https://github.com/acme/shop/issues/12#issuecomment-901', null])
    assert.equal(repo.forge.state().comments.length, 1)
    assert.ok(ghOnForge(repo).some((args) => args[0] === 'pr' && args[1] === 'view'))
    assert.ok(!JSON.stringify([outcome, mod.notes, mod.published]).includes('granted'))
  })
}
