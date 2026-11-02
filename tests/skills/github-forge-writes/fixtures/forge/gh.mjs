// A stand-in for the GitHub CLI, staged under .git/skraft-eval/ of the evaluation workspace. It
// keeps a small forge in forge.json beside it: reads answer from it, writes change it, and every
// call is appended to calls.jsonl. Nothing reaches a real forge. `--install <dir>` writes the `gh`
// launcher the agent's PATH finds; the launcher locates the workspace from the shell's directory.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)

if (args[0] === '--install') {
  const dir = args[1]
  mkdirSync(dir, { recursive: true })
  const launcher = '#!/bin/sh\ntop=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "gh: not inside the repository" >&2; exit 1; }\nexec "' + process.execPath + '" "$top/.git/skraft-eval/gh.mjs" "$@"\n'
  const temporary = join(dir, 'gh.' + process.pid)
  writeFileSync(temporary, launcher, { mode: 0o755 })
  renameSync(temporary, join(dir, 'gh'))
  if (!existsSync(join(here, 'forge.initial.json'))) copyFileSync(join(here, 'forge.json'), join(here, 'forge.initial.json'))
  process.exit(0)
}

const statePath = join(here, 'forge.json')
const forge = JSON.parse(readFileSync(statePath, 'utf8'))
const repo = forge.repo
appendFileSync(join(here, 'calls.jsonl'), JSON.stringify({ argv: args }) + '\n')

const out = (value) => { process.stdout.write(typeof value === 'string' ? value + '\n' : JSON.stringify(value, null, 2) + '\n'); process.exit(0) }
const fail = (message, code = 1) => { process.stderr.write(message + '\n'); process.exit(code) }
const save = () => writeFileSync(statePath, JSON.stringify(forge, null, 2))
const readValue = (value) => (value.startsWith('@') ? readFileSync(resolve(value.slice(1)), 'utf8') : value)
const url = (n, id) => 'https://github.com/' + repo + '/issues/' + n + (id ? '#issuecomment-' + id : '')
const item = (n) => forge.items[String(n)] || fail('gh: Could not resolve to an issue or pull request with the number of ' + n + '.')
const comments = (n) => (forge.comments[String(n)] ||= [])
const findComment = (id) => {
  for (const [n, list] of Object.entries(forge.comments)) { const index = list.findIndex((c) => String(c.id) === String(id)); if (index >= 0) return { n, list, index } }
  return null
}
const addComment = (n, body) => {
  item(n)
  forge.nextId = (forge.nextId || 960) + 1
  const comment = { id: forge.nextId, user: forge.viewer, body, html_url: url(n, forge.nextId), issue_url: 'https://api.github.com/repos/' + repo + '/issues/' + n }
  comments(n).push(comment)
  save()
  return comment
}
const setFields = (n, fields) => {
  const target = item(n)
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'labels') target.labels = [].concat(value).map((name) => ({ name }))
    else target[key] = value
  }
  save()
  return target
}

// Options a gh command takes with a value; every other `-x` is a switch.
const VALUED = new Set(['-X', '--method', '-f', '-F', '--field', '--raw-field', '--input', '-H', '--header', '--jq', '-q', '--template', '-t', '--hostname', '-R', '--repo', '--body', '-b', '--body-file', '--title', '--add-label', '--remove-label', '--milestone', '-m', '--add-assignee', '--remove-assignee', '--json', '--state', '--reason', '-r', '--comment', '-c', '--limit', '-L', '--label', '-l', '--assignee', '-a', '--search', '-S', '--add-project', '--remove-project'])
const parse = (list) => {
  const options = {}, positional = []
  for (let i = 0; i < list.length; i += 1) {
    const arg = list[i]
    const eq = arg.startsWith('--') && arg.includes('=') ? arg.indexOf('=') : -1
    const key = eq > 0 ? arg.slice(0, eq) : arg
    if (VALUED.has(key)) { const value = eq > 0 ? arg.slice(eq + 1) : list[(i += 1)]; (options[key] ||= []).push(value ?? '') }
    else if (arg.startsWith('-') && arg !== '-') options[key] = [true]
    else positional.push(arg)
  }
  return { options, positional }
}
const one = (options, ...keys) => { for (const key of keys) if (options[key]) return options[key][options[key].length - 1]; return undefined }

const api = (list) => {
  const { options, positional } = parse(list)
  const fields = {}
  for (const raw of [...(options['-f'] || []), ...(options['-F'] || []), ...(options['--field'] || []), ...(options['--raw-field'] || [])]) {
    const at = raw.indexOf('=')
    const key = raw.slice(0, at), value = readValue(raw.slice(at + 1))
    if (key.endsWith('[]')) (fields[key.slice(0, -2)] ||= []).push(value)
    else fields[key] = value
  }
  if (options['--input']) Object.assign(fields, JSON.parse(readValue('@' + one(options, '--input'))))
  let method = String(one(options, '-X', '--method') || (Object.keys(fields).length ? 'POST' : 'GET')).toUpperCase()
  const path = String(positional[0] || '').replace(/^\//, '').replace(/\?.*$/, '').replace('{owner}/{repo}', repo)
  if (path === 'graphql') fail('gh: GraphQL is not available here; use the REST endpoints.')
  if (path === 'user') out(forge.viewer)
  const base = 'repos/' + repo
  if (path === base) out({ full_name: repo })
  if (!path.startsWith(base + '/')) fail('gh: HTTP 404: Not Found (' + path + ')')
  const rest = path.slice(base.length + 1).split('/')
  const [kind, a, b, c] = rest
  if (kind === 'issues' && a === 'comments' && b) {
    const found = findComment(b) || fail('gh: HTTP 404: Not Found')
    if (method === 'GET') out(found.list[found.index])
    if (method === 'DELETE') { found.list.splice(found.index, 1); save(); out('') }
    if (method === 'PATCH') { found.list[found.index].body = fields.body; save(); out(found.list[found.index]) }
  }
  if ((kind === 'issues' || kind === 'pulls') && a && !b) {
    if (method === 'GET') out(item(a))
    if (method === 'PATCH' || method === 'POST') out(setFields(a, fields))
  }
  if (kind === 'issues' && a && b === 'comments' && !c) {
    if (method === 'GET') out(comments(a))
    if (method === 'POST') out(addComment(a, fields.body))
  }
  if (kind === 'issues' && a && b === 'labels') {
    const target = item(a)
    if (method === 'GET') out(target.labels)
    if (method === 'POST') { for (const name of [].concat(fields.labels || [])) if (!target.labels.some((l) => l.name === name)) target.labels.push({ name }); save(); out(target.labels) }
    if (method === 'PUT') out(setFields(a, { labels: fields.labels || [] }).labels)
    if (method === 'DELETE') { target.labels = c ? target.labels.filter((l) => l.name !== decodeURIComponent(c)) : []; save(); out(target.labels) }
  }
  if (kind === 'pulls' && a && b === 'reviews' && method === 'POST') { (forge.reviews ||= []).push({ n: a, ...fields }); save(); out({ id: 1 }) }
  fail('gh: HTTP 404: Not Found (' + method + ' ' + path + ')')
}

const issueOrPr = (verb, list) => {
  const { options, positional } = parse(list)
  const n = positional[0]
  const body = options['--body-file'] ? readValue('@' + one(options, '--body-file')) : one(options, '--body', '-b')
  if (['view', 'status', 'diff', 'checks'].includes(verb)) out({ ...item(n), comments: comments(n) })
  if (verb === 'list') out(Object.values(forge.items))
  if (verb === 'comment') {
    if (options['--edit-last'] || options['--delete-last']) {
      const mine = comments(n).filter((x) => x.user.id === forge.viewer.id).pop() || fail('gh: no comments found for current user')
      if (options['--delete-last']) comments(n).splice(comments(n).indexOf(mine), 1)
      else mine.body = body
      save()
      out(url(n, mine.id))
    }
    out(addComment(n, body).html_url)
  }
  if (verb === 'edit') {
    const target = item(n)
    if (one(options, '--title') !== undefined) target.title = one(options, '--title')
    if (body !== undefined) target.body = body
    for (const name of (options['--add-label'] || []).flatMap((v) => v.split(','))) if (!target.labels.some((l) => l.name === name)) target.labels.push({ name })
    for (const name of (options['--remove-label'] || []).flatMap((v) => v.split(','))) target.labels = target.labels.filter((l) => l.name !== name)
    if (options['--milestone'] || options['-m']) target.milestone = one(options, '--milestone', '-m')
    if (options['--add-assignee']) target.assignees = [...(target.assignees || []), ...options['--add-assignee']]
    if (options['--remove-assignee']) target.assignees = []
    save()
    out(url(n))
  }
  if (['close', 'reopen', 'lock', 'unlock', 'merge', 'ready'].includes(verb)) { item(n).state = verb; save(); out(url(n)) }
  if (verb === 'review') { (forge.reviews ||= []).push({ n, body: body || '' }); save(); out(url(n)) }
  fail('gh: unknown command "' + verb + '"')
}

const [group, verb, ...rest] = args
if (group === 'auth' && verb === 'status') out('github.com\n  Logged in to github.com account ' + forge.viewer.login)
if (group === 'auth') fail('gh: not available here')
if (group === 'api') api([verb, ...rest].filter((x) => x !== undefined))
if (group === 'repo' && verb === 'view') out({ nameWithOwner: repo })
if (group === 'issue' || group === 'pr') issueOrPr(verb, rest)
if (group === '--version' || group === 'version') out('gh version 2.80.0')
fail('gh: unknown command "' + (group || '') + '"')
