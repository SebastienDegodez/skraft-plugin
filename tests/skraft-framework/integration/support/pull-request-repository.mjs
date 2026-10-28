// A real working copy checked out on the head of a pull request of a .NET project, the forge a
// fake gh on a PATH of its own (no test reaches a forge), and the scripted LLM that answers the
// review's lenses and the refuter from their briefs. No doubles of the engine's ports.
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { answerYaml } from '../../unit/support/answer-yaml.mjs'
import { commitAll, envWithPath, git, tempFolder, toolFolders } from './workspace.mjs'

export const NUMBER = 12
export const TEST_FILE = 'tests/Checkout.UnitTest/CheckoutTests.cs'
export const COMMENT_URL = `https://github.example.com/acme/shop/issues/${NUMBER}#issuecomment-901`

const TESTS = (assertion) => [
  'public class CheckoutTests',
  '{',
  '    [Fact]',
  '    public void Discounts_orders_above_100()',
  '    {',
  '        var total = new Checkout().Total(100m);',
  `        ${assertion}`,
  '    }',
  '}',
  '',
].join('\n')

// gh answers from gh-state.json beside it and keeps each argv in gh-calls.jsonl.
const FAKE_GH = [
  "import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'",
  "import { dirname, join } from 'node:path'",
  "import { fileURLToPath } from 'node:url'",
  'const here = dirname(fileURLToPath(import.meta.url))',
  'const args = process.argv.slice(2)',
  "appendFileSync(join(here, 'gh-calls.jsonl'), `${JSON.stringify(args)}\\n`)",
  "const state = JSON.parse(readFileSync(join(here, 'gh-state.json'), 'utf8'))",
  "const save = () => writeFileSync(join(here, 'gh-state.json'), JSON.stringify(state))",
  "const said = (text) => { process.stdout.write(`${text}\\n`); process.exit(0) }",
  "const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)",
  "if (args[0] === '--version') said('gh version 2.62.0')",
  "if (args[0] === 'auth') process.exit(state.signedIn ? 0 : 1)",
  "if (args[1] === 'view' && Number(args[2]) !== state.pull?.number) { process.stderr.write(`GraphQL: Could not resolve to a PullRequest with the number of ${args[2]}.\\n`); process.exit(1) }",
  "if (args[1] === 'view') said(JSON.stringify(state.pull))",
  "if (args.at(-1) === 'user') said('sebastien')",
  "const urlOf = (id) => `https://${option('hostname')}/acme/shop/issues/${state.pull.number}#issuecomment-${id}`",
  "const body = () => readFileSync(option('field').slice('body=@'.length), 'utf8')",
  "const edited = /\\/issues\\/comments\\/(\\d+)$/.exec(args.at(-1))",
  "if (edited) { const comment = state.comments.find((one) => one.id === Number(edited[1])); comment.body = body(); save(); said(urlOf(comment.id)) }",
  "if (option('method') === 'POST') { const id = 901 + state.comments.length; state.comments.push({ id, body: body() }); save(); said(urlOf(id)) }",
  "if (args.includes('--paginate')) said(state.comments.map((one) => JSON.stringify({ user: { login: 'sebastien' }, body: one.body, html_url: urlOf(one.id) })).join('\\n'))",
  'process.exit(2)',
  '',
].join('\n')

/**
 * The working copy: `main` holds the checkout tests, the branch `discount` weakens their
 * assertion and is checked out; the fake gh knows pull request #12 from `discount` into `main`.
 * @param {import('node:test').TestContext} t
 * @param {{ signedIn?: boolean, config?: object | null }} [options] config: skraft-config.json, none when null
 */
export const pullRequestRepository = (t, { signedIn = true, config = null } = {}) => {
  const root = tempFolder(t, 'skraft-review-')
  const cwd = join(root, 'shop')
  mkdirSync(join(cwd, 'tests', 'Checkout.UnitTest'), { recursive: true })
  writeFileSync(join(cwd, 'Shop.sln'), '')
  writeFileSync(join(cwd, TEST_FILE), TESTS('Assert.Equal(90m, total);'))
  if (config !== null) writeFileSync(join(cwd, 'skraft-config.json'), JSON.stringify(config))
  const base = commitAll(cwd)
  git(cwd, 'remote', 'add', 'origin', 'https://github.example.com/acme/shop.git')
  git(cwd, 'update-ref', 'refs/remotes/origin/main', base)
  git(cwd, 'checkout', '-q', '-b', 'discount')
  writeFileSync(join(cwd, TEST_FILE), TESTS('Assert.NotNull(total);'))
  git(cwd, 'commit', '-q', '-am', 'test: relax the discount check')
  const head = git(cwd, 'rev-parse', 'HEAD')
  const pull = { number: NUMBER, url: `https://github.example.com/acme/shop/pull/${NUMBER}`, title: 'Discount at checkout', body: 'Applies a discount.', baseRefName: 'main', baseRefOid: base, headRefName: 'discount', headRefOid: head }
  const forge = fakeGh(root, { signedIn, pull, comments: [] })
  return { root, cwd, base, head, forge, env: envWithPath([forge.bin, ...toolFolders()]) }
}

/** @param {string} root @param {object} state */
const fakeGh = (root, state) => {
  const bin = join(root, 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'gh.mjs'), FAKE_GH)
  writeFileSync(join(bin, 'gh-calls.jsonl'), '')
  writeFileSync(join(bin, 'gh-state.json'), JSON.stringify(state))
  writeFileSync(join(bin, 'gh.cmd'), `@"${process.execPath}" "%~dp0gh.mjs" %*\r\n`)
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "${join(bin, 'gh.mjs')}" "$@"\n`)
  chmodSync(join(bin, 'gh'), 0o755)
  const current = () => JSON.parse(readFileSync(join(bin, 'gh-state.json'), 'utf8'))
  return {
    bin,
    state: current,
    /** Changes what gh answers from now on. @param {object} patch */
    set: (patch) => writeFileSync(join(bin, 'gh-state.json'), JSON.stringify({ ...current(), ...patch })),
    calls: () => readFileSync(join(bin, 'gh-calls.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)),
  }
}

/** The finding test-integrity gives on the weakened assertion. */
export const WEAKENED = Object.freeze({ id: 'F1', gate: 'G9', severity: 'blocker', location: `${TEST_FILE}:7`, description: 'Assert.Equal(90m, total) became Assert.NotNull(total)' })

/**
 * The scripted LLM of a review: a lens answers from its brief's heading, test-integrity with the
 * finding on the weakened assertion when its brief says it has no `.feature` nor test plan, every
 * other lens passes; the refuter confirms.
 * @returns {{ act: (prompt: string) => string, briefs: string[] }}
 */
export const reviewLlm = () => {
  const briefs = []
  return {
    briefs,
    act: (prompt) => {
      briefs.push(prompt)
      if (prompt.startsWith('## Skraft finding check')) return answerYaml({ verdict: 'confirmed', reason: 'the patch shows it' })
      const lens = /^## Skraft review lens: ([a-z-]+)/.exec(prompt)[1]
      const degraded = lens === 'test-integrity' && prompt.includes('- No `.feature` file and no test plan among these inputs')
      return answerYaml({ lens, verdict: degraded ? 'fail' : 'pass', findings: degraded ? [WEAKENED] : [] })
    },
  }
}
