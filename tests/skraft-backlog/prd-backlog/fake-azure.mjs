// A fake `az` over an in-memory Azure DevOps project: enough of `devops invoke`, `boards query`,
// `boards iteration project` and `boards work-item` for the Boards publisher. Each call is
// recorded so a test can assert what reached Azure DevOps.

const PROCESSES = Object.freeze({
  Agile: ['Epic', 'Feature', 'User Story', 'Task', 'Bug'],
  Scrum: ['Epic', 'Feature', 'Product Backlog Item', 'Task', 'Bug'],
  CMMI: ['Epic', 'Feature', 'Requirement', 'Task', 'Bug'],
  Basic: ['Epic', 'Issue', 'Task'],
})

/**
 * @param {{ org?: string, project?: string, process?: keyof typeof PROCESSES, iterations?: string[], canCreateIterations?: boolean, signedIn?: boolean }} [options]
 */
export const fakeAzure = ({ org = 'contoso', project = 'Permis', process = 'Agile', iterations = [], canCreateIterations = true, signedIn = true } = {}) => {
  const state = {
    items: /** @type {Array<{ id: number, type: string, title: string, description: string, tags: string[], iteration: string | null }>} */ ([]),
    relations: /** @type {Array<{ id: number, type: string, target: number }>} */ ([]),
    iterations: [...iterations],
  }
  const calls = []
  const ok = (data) => ({ status: 0, stdout: JSON.stringify(data), stderr: '' })
  const fail = (message) => ({ status: 1, stdout: '', stderr: `ERROR: ${message}` })
  const option = (args, name) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1] }
  const fieldsOf = (args) => {
    const at = args.indexOf('--fields')
    if (at < 0) return {}
    const end = args.findIndex((a, i) => i > at && a.startsWith('--'))
    return Object.fromEntries(args.slice(at + 1, end < 0 ? undefined : end).map((f) => [f.slice(0, f.indexOf('=')), f.slice(f.indexOf('=') + 1)]))
  }
  const wrongTarget = (args) => option(args, '--org') !== `https://dev.azure.com/${org}` || (args.includes('--project') && option(args, '--project') !== project)

  /** @param {string[]} args */
  const run = (args) => {
    calls.push(args)
    if (!signedIn) return fail("Before you can run Azure DevOps commands, you need to run the login command (az login if using AAD/MSA identity else az devops login if using PAT token) to setup credentials.")
    if (wrongTarget(args)) return fail('TF400813: wrong organization or project')
    const verb = args.slice(0, args.findIndex((a) => a.startsWith('--'))).join(' ')
    if (verb.startsWith('devops invoke')) return ok({ value: PROCESSES[process].map((name) => ({ name })) })
    if (verb.startsWith('boards query')) {
      return ok(state.items.filter((i) => i.tags.includes('skraft-backlog')).map((i) => ({ id: i.id, fields: { 'System.Id': i.id, 'System.Description': i.description } })))
    }
    if (verb === 'boards iteration project list') {
      return ok({ name: project, path: `\\${project}\\Iteration`, children: state.iterations.map((name) => ({ name, path: `\\${project}\\Iteration\\${name}` })) })
    }
    if (verb === 'boards iteration project create') {
      if (!canCreateIterations) return fail('TF50309: you do not have the permission')
      state.iterations.push(/** @type {string} */ (option(args, '--name')))
      return ok({ name: option(args, '--name') })
    }
    if (verb === 'boards work-item create') {
      const type = /** @type {string} */ (option(args, '--type'))
      if (!PROCESSES[process].includes(type)) return fail(`VS402323: work item type ${type} does not exist`)
      const fields = fieldsOf(args)
      const item = { id: 1000 + state.items.length + 1, type, title: /** @type {string} */ (option(args, '--title')), description: /** @type {string} */ (option(args, '--description')),
        tags: (fields['System.Tags'] ?? '').split(';').map((t) => t.trim()).filter(Boolean), iteration: fields['System.IterationPath'] ?? null }
      if (item.iteration && !state.iterations.some((name) => item.iteration === `${project}\\${name}`)) return fail('TF401347: invalid iteration path')
      state.items.push(item)
      return ok({ id: item.id })
    }
    if (verb === 'boards work-item relation add') {
      const relation = { id: Number(option(args, '--id')), type: /** @type {string} */ (option(args, '--relation-type')), target: Number(option(args, '--target-id')) }
      if (state.relations.some((r) => r.id === relation.id && r.type === relation.type && r.target === relation.target)) return fail('Relation already exists')
      state.relations.push(relation)
      return ok({ id: relation.id })
    }
    return fail(`unknown command: ${args.join(' ')}`)
  }
  return { run, state, calls }
}

/** A fake `git` answering one remote. @param {string} url */
export const fakeGit = (url) => (args) => {
  if (args[0] === 'remote' && args.length === 1) return { status: 0, stdout: 'origin\n', stderr: '' }
  if (args[0] === 'remote' && args[1] === 'get-url') return { status: 0, stdout: `${url}\n`, stderr: '' }
  return { status: 1, stdout: '', stderr: 'fatal' }
}
