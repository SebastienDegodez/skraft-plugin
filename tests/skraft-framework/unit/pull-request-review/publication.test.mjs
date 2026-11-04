import { test } from 'node:test'
import assert from 'node:assert/strict'
import { API } from '../support/pipeline-host.mjs'
import { finding, lenses, PULL_REQUEST, refutes, REVIEWS, reviewHost, says, SLUG, TEST_FILE, weakensAssertion } from './support.mjs'

const CONSENT = 'May skraft keep one comment on the pull request it reviews with skraft review --pr --publish, rewritten at each review, with the verdict and the findings? It is posted as you. ACCEPTED or DECLINED; the answer is kept in ~/.skraft/config.json for this repository, for every later review.'
const URL = 'https://github.example.com/acme/shop/pull/12#issuecomment-901'
const HEADER = '| Status | Severity | Lens | Location | Finding | Why |'
const RULE = '| --- | --- | --- | --- | --- | --- |'
const LONG_CLAIM = 'the assertion that checked the discount above 100 is gone, so a refactoring of Apply can drop the rule unseen'
const LONG_REASON = 'Discount.cs:3 names the threshold in a constant, MinimumOrder, which the test file quotes word for word'
const FR_HEADER = '| Statut | Sévérité | Lentille | Emplacement | Constat | Pourquoi |'
const CLAIM_100 = 'the discount applies after the tax is computed, which skews the total of every order above 100 euros'
const KEPT = (accepted) => ({ reviewComments: { 'github.com/acme/shop': { accepted, questionVersion: 1 } } })

/** A pull request whose head commit the working copy stands on. @param {Parameters<typeof reviewHost>[0]} [options] */
const reviewed = (options) => {
  const host = reviewHost(options)
  weakensAssertion(host.git)
  return host
}

/** The pull request's head moved to the working copy's last commit. @param {ReturnType<typeof reviewHost>} host @param {string} sha */
const pushed = (host, sha) => { host.pullRequests.pullRequests[0] = { ...PULL_REQUEST, head: { ref: 'discount', sha } } }

test('--publish twice keeps one comment on the pull request, rewritten with each pass; the consent is asked once and kept in ~/.skraft/config.json for the repository, nothing written in the working copy', async () => {
  const host = reviewed({ answers: [{ answer: 'ACCEPTED' }] })
  host.agentRunner.review = lenses({
    'test-integrity': [says('test-integrity', 'fail', [finding('F1', 'blocker', 'the assertion @alice wrote is gone', { gate: 'G9', location: `${TEST_FILE}:14` }), finding('F2', 'low', 'name the total', { gate: 'G9', location: `${TEST_FILE}:20` })])],
    'cold-reader': [says('cold-reader', 'pass', [finding('F1', 'low', 'name the discount', { gate: 'C2' })])],
    refuter: [refutes('confirmed'), refutes('confirmed', 'the total has no name'), refutes('refuted', 'Discount.cs names it')],
  })

  const first = await host.review({ publish: true })

  assert.deepEqual([first.status, first.comment, first.unpublished], ['NEEDS_REWORK', URL, null])
  assert.deepEqual(host.human.questions.map(({ key, kind, text, options, refusals, header }) => [key, kind, text, options, refusals, header]), [['review_consent-1', 'review-consent', CONSENT, ['ACCEPTED', 'DECLINED'], [], 'PR comment']])
  assert.deepEqual(host.userSettings.json(), KEPT(true))
  assert.equal(await host.workspace.read('skraft-config.json'), null)
  assert.equal(host.pullRequests.comments[0].body, [
    '### skraft review · #12 — NEEDS_REWORK (pass 1)', '',
    'Review: 2 to fix, 1 refuted', '',
    HEADER, RULE,
    `| To fix | blocker | test-integrity F1 G9 | \`${TEST_FILE}:14\` | the assertion \`@alice\` wrote is gone | confirmed: confirmed by the patch |`,
    `| To fix | low | test-integrity F2 G9 | \`${TEST_FILE}:20\` | name the total | confirmed: the total has no name |`,
    '',
    '<details><summary>1 refuted</summary>',
    '',
    HEADER, RULE,
    '| Refuted | low | cold-reader F1 C2 | `src/Checkout.cs:12` | name the discount | Discount.cs names it |',
    '',
    '</details>', '',
    '<sub>skraft-review pr=12</sub>', '',
  ].join('\n'))
  assert.equal(await host.reviews.read(SLUG, 'comment.md'), host.pullRequests.comments[0].body)

  host.git.commit('test: restore the discount check', [TEST_FILE])
  pushed(host, 'root-2')
  const second = await host.review({ publish: true })

  assert.deepEqual([second.status, second.pass, second.comment], ['APPROVED', 2, URL])
  assert.equal(host.pullRequests.comments.length, 1)
  assert.ok(host.pullRequests.comments[0].body.startsWith('### skraft review · #12 — APPROVED (pass 2)\n\nAPPROVED: every lens passed\n\n<sub>skraft-review pr=12</sub>\n'), host.pullRequests.comments[0].body)
  assert.equal(host.human.questions.length, 1)
  assert.deepEqual(host.pullRequests.calls.filter((call) => call.startsWith('keep')), ['keep comment #12', 'keep comment #12 #issuecomment-901'])
  const kept = host.events().filter((event) => event.type.startsWith('question.') || event.type.startsWith('review.comment'))
  assert.deepEqual(kept.map(({ type, key, answer, by, pass, url }) => [type, key, answer, by, pass, url]), [
    ['question.asked', 'review_consent-1', undefined, undefined, undefined, undefined],
    ['question.answered', 'review_consent-1', 'ACCEPTED', 'host', undefined, undefined],
    ['review.commented', undefined, undefined, undefined, 1, URL],
    ['review.commented', undefined, undefined, undefined, 2, URL],
  ])
})

test('a consent declined at the host is kept, nothing is posted, and a later --publish asks nothing', async () => {
  const host = reviewed({ answers: [{ answer: 'declined' }] })

  const first = await host.review({ publish: true })

  const reason = 'not published: you declined to keep a review comment on github.com/acme/shop (~/.skraft/config.json)'
  assert.deepEqual([first.status, first.comment, first.unpublished], ['APPROVED', null, reason])
  assert.deepEqual(host.userSettings.json(), KEPT(false))
  assert.deepEqual(host.events().at(-1), { type: 'review.comment-skipped', at: '2026-10-20T09:00:00.000Z', prev: host.events().at(-1).prev, pass: 1, reason, sig: host.events().at(-1).sig })

  const second = await host.review({ publish: true })

  assert.equal(second.unpublished, reason)
  assert.equal(host.human.questions.length, 1)
  assert.deepEqual(host.pullRequests.comments, [])
})

test('a consent nobody answers keeps nothing and posts nothing; the verdict stands', async () => {
  const host = reviewed()

  const outcome = await host.review({ publish: true })

  assert.deepEqual([outcome.status, outcome.comment, outcome.unpublished], ['APPROVED', null, 'not published: nobody answered review_consent-1; run skraft review --pr 12 --publish where you can answer it'])
  assert.equal(host.userSettings.text, null)
  assert.deepEqual(host.pullRequests.comments, [])
  assert.deepEqual(host.events().filter((event) => event.type === 'question.answered'), [])

  const again = await host.review({ publish: true })

  assert.equal(again.unpublished, 'not published: nobody answered review_consent-2; run skraft review --pr 12 --publish where you can answer it')
  assert.deepEqual(host.human.questions.map(({ key }) => key), ['review_consent-1', 'review_consent-2'])
})

test('an answer the question does not take keeps nothing and posts nothing', async () => {
  const host = reviewed({ answers: [{ answer: 'MAYBE' }] })

  const outcome = await host.review({ publish: true })

  assert.equal(outcome.unpublished, 'not published: nobody answered review_consent-1; run skraft review --pr 12 --publish where you can answer it')
  assert.equal(host.userSettings.text, null)
})

test('a fork with no skraft-config.json: --publish writes nothing in the working copy, and the second pass is not asked again', async () => {
  const host = reviewed({ config: null, answers: [{ answer: 'ACCEPTED' }], user: '{ "models": {} }' })
  const before = [...host.workspace.files.entries()]

  await host.review({ publish: true })
  host.git.commit('test: restore the discount check', [TEST_FILE])
  pushed(host, 'root-2')
  const second = await host.review({ publish: true })

  assert.equal(second.comment, URL)
  assert.equal(host.human.questions.length, 1)
  assert.deepEqual([...host.workspace.files.entries()], before)
  assert.deepEqual(host.userSettings.json(), { models: {}, ...KEPT(true) })
})

test('an answer kept for another repository, or for an earlier question, is no answer for this one', async () => {
  const other = { reviewComments: { 'github.com/acme/other': { accepted: true, questionVersion: 1 }, 'github.com/acme/shop': { accepted: true, questionVersion: 0 }, 'github.com/acme/none': null } }
  const host = reviewed({ user: JSON.stringify(other), answers: [{ answer: 'ACCEPTED' }] })

  await host.review({ publish: true })

  assert.equal(host.human.questions.length, 1)
  assert.deepEqual(host.userSettings.json().reviewComments, { 'github.com/acme/other': { accepted: true, questionVersion: 1 }, 'github.com/acme/shop': { accepted: true, questionVersion: 1 }, 'github.com/acme/none': null })

  const empty = reviewed({ user: JSON.stringify({ reviewComments: { 'github.com/acme/shop': null } }), answers: [{ answer: 'ACCEPTED' }] })
  await empty.review({ publish: true })
  assert.equal(empty.human.questions.length, 1)
})

test('the repository\'s skraft-config.json answer wins over the developer\'s: false posts nothing, true posts without asking', async () => {
  const refused = reviewed({ config: { components: [API], publish: { reviewComment: false } }, user: JSON.stringify(KEPT(true)) })
  const allowed = reviewed({ config: { components: [API], publish: { reviewComment: true } }, user: JSON.stringify(KEPT(false)) })

  const no = await refused.review({ publish: true })
  const yes = await allowed.review({ publish: true })

  assert.deepEqual([no.comment, no.unpublished], [null, 'not published: skraft-config.json sets publish.reviewComment to false'])
  assert.deepEqual([yes.comment, yes.unpublished], [URL, null])
  assert.deepEqual([refused.human.questions, allowed.human.questions], [[], []])
})

test('a forge that cannot name the repository keeps no consent and posts nothing', async () => {
  const host = reviewed({ forge: { repository: null } })

  const outcome = await host.review({ publish: true })

  assert.equal(outcome.unpublished, 'not published: the forge does not name the repository of the working copy\'s remote, so no consent can be kept for it')
  assert.deepEqual(host.human.questions, [])
})

test('a consent already given posts at once; a forge that refuses the comment leaves the verdict and says why', async () => {
  const host = reviewed({ config: { components: [API], publish: { reviewComment: true } }, forge: { fails: { comment: 'gh could not comment issue #12 on acme/shop' } } })

  const outcome = await host.review({ publish: true })

  assert.deepEqual([outcome.status, outcome.comment, outcome.unpublished], ['APPROVED', null, 'not published: gh could not comment issue #12 on acme/shop'])
  assert.deepEqual(host.human.questions, [])
  assert.equal(host.events().at(-1).type, 'review.comment-skipped')
})

test('without --publish the comment is only rendered beside the review: no consent asked, nothing posted', async () => {
  const host = reviewed()

  const outcome = await host.review()

  assert.deepEqual([outcome.comment, outcome.unpublished], [null, null])
  assert.ok((await host.reviews.read(SLUG, 'comment.md')).startsWith('### skraft review · #12 — APPROVED (pass 1)\n'))
  assert.deepEqual(host.human.questions, [])
  assert.deepEqual(host.pullRequests.calls, ['unavailable', 'find #12'])
  assert.equal(outcome.file, `${REVIEWS}/reviews/verdict-1/verdict.yaml`)
})

test('a stopped review publishes nothing', async () => {
  const host = reviewed({ config: { components: [API], publish: { reviewComment: true } } })
  host.agentRunner.review = () => ({ ok: false, text: '', unavailable: true, error: 'the host has no agents' })

  const outcome = await host.review({ publish: true })

  assert.deepEqual([outcome.status, outcome.comment, outcome.unpublished], ['stopped', null, null])
  assert.deepEqual(host.pullRequests.comments, [])
})

test('the comment is one table by status: what to fix, what one lens alone found to decide, the refuted ones folded, a low one among them, with the refuter\'s reason, long texts cut', async () => {
  const host = reviewed({ config: { components: [API], publish: { reviewComment: true } } })
  host.agentRunner.review = lenses({
    'test-integrity': [says('test-integrity', 'fail', [
      finding('F1', 'blocker', LONG_CLAIM, { gate: 'G9', location: `${TEST_FILE}:14` }),
      finding('F2', 'high', 'the discount rule has no test', { gate: 'G7', location: `${TEST_FILE}:20` }),
    ])],
    'cold-reader': [says('cold-reader', 'fail', [finding('F1', 'medium', 'Apply hides the threshold', { gate: 'C1', location: 'src/Discount.cs:3' }), finding('F2', 'low', 'name the total', { gate: 'C2' })])],
    'architecture-boundaries': [says('architecture-boundaries', 'pass', [finding('F1', 'low', 'name the rate', { gate: 'G10', location: 'src/Discount.cs:5' })])],
    refuter: [refutes('confirmed', 'the patch drops the assertion'), refutes('unverifiable', 'no rule names the discount test'), refutes('refuted', 'Discount.cs:5 names the rate'), refutes('refuted', LONG_REASON), refutes('confirmed', 'the total has no name')],
  })

  await host.review({ publish: true })

  assert.equal(host.pullRequests.comments[0].body, [
    '### skraft review · #12 — NEEDS_REWORK (pass 1)', '',
    'Review: 3 to fix, 2 refuted', '',
    HEADER, RULE,
    `| To fix | blocker | test-integrity F1 G9 | \`${TEST_FILE}:14\` | the assertion that checked the discount above 100 is gone, so a refactoring of Apply can drop the r… | confirmed: the patch drops the assertion |`,
    `| To fix | high | test-integrity F2 G7 | \`${TEST_FILE}:20\` | the discount rule has no test | not verified: no rule names the discount test |`,
    '| To fix | low | cold-reader F2 C2 | `src/Checkout.cs:12` | name the total | confirmed: the total has no name |',
    '',
    '<details><summary>2 refuted</summary>',
    '',
    HEADER, RULE,
    '| Refuted | low | architecture-boundaries F1 G10 | `src/Discount.cs:5` | name the rate | Discount.cs:5 names the rate |',
    '| Refuted | medium | cold-reader F1 C1 | `src/Discount.cs:3` | Apply hides the threshold | Discount.cs:3 names the threshold in a constant, MinimumOrder, which the test file quotes word for… |',
    '',
    '</details>',
    '',
    '<sub>skraft-review pr=12</sub>', '',
  ].join('\n'))
})

test('the comment on a French pull request is in French: what one lens alone found and the refuter refuted is to decide; on the next pass a refutation carried over is folded, a finding new on an unchanged line is a note, a claim of 100 characters is shown whole; each pass shows its own findings', async () => {
  const french = { ...PULL_REQUEST, title: 'Remise au panier', body: 'Applique une remise de 10 % sur les commandes de plus de 100 euros, pour les clients qui ont un compte.' }
  const lines = Array.from({ length: 12 }, (_, n) => `        // ligne ${n + 1}`).join('\n')
  const host = reviewed({ pullRequest: french, files: { [TEST_FILE]: `${lines}\n` }, config: { components: [API], publish: { reviewComment: true } } })
  host.agentRunner.review = lenses({
    'test-integrity': [
      says('test-integrity', 'fail', [
        finding('F1', 'high', 'the threshold is not tested', { gate: 'G7', location: `${TEST_FILE}:3` }),
        finding('F2', 'medium', 'the rounding is not tested', { gate: 'G7', location: `${TEST_FILE}:5` }),
      ]),
      says('test-integrity', 'fail', [
        finding('F1', 'high', 'the threshold is still not tested', { gate: 'G7', location: `${TEST_FILE}:3` }),
        finding('F3', 'high', 'the currency is not tested', { gate: 'G7', location: `${TEST_FILE}:8` }),
        finding('F4', 'low', 'name the total', { gate: 'G7' }),
        finding('F5', 'medium', 'Apply hides the threshold', { gate: 'G9', location: 'src/Discount.cs:2' }),
        finding('F6', 'high', CLAIM_100, { gate: 'G9', location: 'src/Discount.cs:4' }),
      ]),
      says('test-integrity', 'pass', [finding('F3', 'low', 'the currency could be tested', { gate: 'G7', location: `${TEST_FILE}:8` })]),
    ],
    refuter: [
      refutes('refuted', 'line 3 tests 100 and 101'), refutes('refuted', 'line 5 rounds'),
      refutes('confirmed', 'the total has no name'), refutes('confirmed', 'Apply names no threshold'), refutes('unverifiable', 'no rule names the order'),
      refutes('refuted', 'line 8 tests the currency'),
    ],
  })

  await host.review({ publish: true })

  assert.equal(host.pullRequests.comments[0].body, [
    '### skraft review · #12 — APPROVED (passe 1)', '',
    'Revue : 2 à trancher', '',
    FR_HEADER, RULE,
    `| À trancher | high | test-integrity F1 G7 | \`${TEST_FILE}:3\` | the threshold is not tested | une seule lentille, contre celles qui sont passées ; réfuté : line 3 tests 100 and 101 |`,
    `| À trancher | medium | test-integrity F2 G7 | \`${TEST_FILE}:5\` | the rounding is not tested | une seule lentille, contre celles qui sont passées ; réfuté : line 5 rounds |`, '',
    '<sub>skraft-review pr=12</sub>', '',
  ].join('\n'))

  await host.review({ publish: true })

  assert.equal(host.pullRequests.comments[0].body, [
    '### skraft review · #12 — NEEDS_REWORK (passe 2)', '',
    'Revue : 3 à corriger, 1 note, 1 réfuté', '',
    FR_HEADER, RULE,
    '| À corriger | low | test-integrity F4 G7 | `src/Checkout.cs:12` | name the total | confirmé : the total has no name |',
    '| À corriger | medium | test-integrity F5 G9 | `src/Discount.cs:2` | Apply hides the threshold | confirmé : Apply names no threshold |',
    `| À corriger | high | test-integrity F6 G9 | \`src/Discount.cs:4\` | ${CLAIM_100} | non vérifié : no rule names the order |`,
    `| Note | high | test-integrity F3 G7 | \`${TEST_FILE}:8\` | the currency is not tested | nouveau sur une ligne inchangée depuis la passe 1 |`,
    '',
    '<details><summary>1 réfuté</summary>',
    '',
    FR_HEADER, RULE,
    `| Réfuté | high | test-integrity F1 G7 | \`${TEST_FILE}:3\` | the threshold is still not tested | line 3 tests 100 and 101 (réfuté à la passe 1) |`,
    '',
    '</details>',
    '',
    '<sub>skraft-review pr=12</sub>', '',
  ].join('\n'))

  await host.review({ publish: true })

  assert.equal(host.pullRequests.comments[0].body, [
    '### skraft review · #12 — APPROVED (passe 3)', '',
    'Revue : 1 réfuté', '',
    '<details><summary>1 réfuté</summary>',
    '',
    FR_HEADER, RULE,
    `| Réfuté | low | test-integrity F3 G7 | \`${TEST_FILE}:8\` | the currency could be tested | line 8 tests the currency |`,
    '',
    '</details>', '',
    '<sub>skraft-review pr=12</sub>', '',
  ].join('\n'))
})

test('a review comment is commented once read back at its URL; one the forge does not show is verification-failed, one whose answer is lost unknown: neither is said published', async () => {
  for (const azure of [false, true]) {
    const kept = reviewed({ azure, config: { components: [API], publish: { reviewComment: true } } })
    await kept.review({ publish: true })
    assert.deepEqual(kept.events().filter(({ type }) => type === 'forge.write').map(({ write, subject, outcome, reason }) => [write, subject, outcome, reason]), [['review-comment', '12', 'applied', null]])

    const unseen = reviewed({ azure, config: { components: [API], publish: { reviewComment: true } }, forge: { unseen: ['comment'] } })
    const hidden = await unseen.review({ publish: true })
    const reason = `the forge said it kept the comment on #12, but reading it back at ${unseen.pullRequests.comments[0].url} does not show it`
    assert.deepEqual([hidden.comment, hidden.unpublished], [null, `not published: ${reason}`])
    assert.equal(unseen.events().find(({ type }) => type === 'forge.write').outcome, 'verification-failed')

    const cut = reviewed({ azure, config: { components: [API], publish: { reviewComment: true } }, forge: { cut: { comment: 'gh got no answer within 120 s' } } })
    const lost = await cut.review({ publish: true })
    assert.deepEqual([lost.comment, lost.unpublished], [null, 'not published: gh got no answer within 120 s'])
    assert.deepEqual(cut.events().filter(({ type }) => type === 'forge.write' || type.startsWith('review.comment')).map(({ type, outcome }) => [type, outcome]), [['forge.write', 'unknown'], ['review.comment-skipped', undefined]])
  }
})
