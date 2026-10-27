// A fake `gh` over an in-memory GitHub repository: enough of `repo view` and the REST API for the
// publisher. Each call is recorded so a test can assert what reached GitHub.

/**
 * @param {{ repo?: string, issues?: object[], labels?: string[], milestones?: { title: string, number: number }[],
 *   answersAs?: string, failing?: RegExp }} [options] answersAs: the full_name the repository answers with
 */
export const fakeGitHub = ({ repo = 'acme/permis', issues = [], labels = ['bug'], milestones = [], answersAs, failing } = {}) => {
  const state = {
    issues: issues.map((issue) => ({ ...issue })),
    labels: [...labels],
    milestones: milestones.map((m) => ({ ...m })),
    subIssues: /** @type {Array<{ parent: number, child: number }>} */ ([]),
    blockedBy: /** @type {Array<{ issue: number, blocker: number }>} */ ([]),
  }
  const calls = []
  const ok = (data) => ({ status: 0, stdout: data === null ? '' : JSON.stringify(data), stderr: '' })
  const fail = (status, message) => ({ status: 1, stdout: JSON.stringify({ message }), stderr: `gh: ${message} (HTTP ${status})` })
  const byNumber = (number) => state.issues.find((i) => i.number === Number(number))
  const byId = (id) => state.issues.find((i) => i.id === Number(id))

  const routes = [
    ['GET', new RegExp(`^repos/${repo}$`), () => ok({ full_name: answersAs ?? repo })],
    ['GET', new RegExp(`^repos/${repo}/issues\\?`), () => ok([state.issues.filter((i) => i.labels.includes('skraft-backlog'))])],
    ['GET', new RegExp(`^repos/${repo}/labels\\?`), () => ok([state.labels.map((name) => ({ name }))])],
    ['GET', new RegExp(`^repos/${repo}/milestones\\?`), () => ok([state.milestones])],
    ['POST', new RegExp(`^repos/${repo}/labels$`), (body) => { state.labels.push(body.name); return ok({ name: body.name }) }],
    ['POST', new RegExp(`^repos/${repo}/milestones$`), (body) => {
      const milestone = { title: body.title, number: state.milestones.length + 1, due_on: body.due_on }
      state.milestones.push(milestone)
      return ok(milestone)
    }],
    ['POST', new RegExp(`^repos/${repo}/issues$`), (body) => {
      const number = 100 + state.issues.length + 1
      const issue = { number, id: 9000 + number, title: body.title, body: body.body, labels: body.labels, milestone: body.milestone ?? null, repository_url: `https://api.github.com/repos/${repo}` }
      state.issues.push(issue)
      return ok(issue)
    }],
    ['POST', new RegExp(`^repos/${repo}/issues/(\\d+)/sub_issues$`), (body, [, parent]) => {
      if (!byNumber(parent) || !byId(body.sub_issue_id)) return fail(404, 'Not Found')
      if (state.subIssues.some((l) => l.parent === Number(parent) && l.child === byId(body.sub_issue_id).number)) return fail(422, 'Sub issue already exists')
      state.subIssues.push({ parent: Number(parent), child: byId(body.sub_issue_id).number })
      return ok({})
    }],
    ['POST', new RegExp(`^repos/${repo}/issues/(\\d+)/dependencies/blocked_by$`), (body, [, issue]) => {
      if (!byNumber(issue) || !byId(body.issue_id)) return fail(404, 'Not Found')
      state.blockedBy.push({ issue: Number(issue), blocker: byId(body.issue_id).number })
      return ok({})
    }],
  ]

  /** @param {string[]} args @param {string} [input] */
  const run = (args, input) => {
    calls.push({ args, input })
    if (args[0] === 'repo' && args[1] === 'view') return ok({ nameWithOwner: repo, defaultBranchRef: { name: 'main' } })
    if (args[0] !== 'api') return fail(400, `unsupported gh ${args.join(' ')}`)
    const method = args.includes('--method') ? args[args.indexOf('--method') + 1] : 'GET'
    const path = args.find((arg, index) => index > 0 && /^repos\//.test(arg))
    if (failing?.test(`${method} ${path}`)) return fail(500, 'Server Error')
    for (const [verb, pattern, handler] of routes) {
      const match = verb === method ? pattern.exec(path ?? '') : null
      if (match) return handler(input ? JSON.parse(input) : undefined, match)
    }
    return fail(404, `no route for ${method} ${path}`)
  }
  return { run, state, calls }
}
