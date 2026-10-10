import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  commandMutatesProtectedArtifact,
  isProtectedArtifactPath,
  commandWritesWorkspace,
  guardProtectedArtifact,
  guardOrchestratorWrite,
} from '../../../plugins/skraft-framework/src/domain/session-guard-policy.mjs'

// G7/G8 target resolution: how the guard follows cd/pushd/popd, git -C, redirects, xargs and
// nested scripts, expands globs, and decides which removed paths hold the tracked state.
// Each case comes as a refused/allowed pair so that a weakened guard (or an over-eager one)
// fails a test.

const STATE = '.copilot-tracking/skraft-plans/us11/state.json'
const refused = (command, options = {}) =>
  assert.equal(commandMutatesProtectedArtifact(command, options), true, `expected refusal: ${command} ${JSON.stringify(options)}`)
const allowed = (command, options = {}) =>
  assert.equal(commandMutatesProtectedArtifact(command, options), false, `expected pass: ${command} ${JSON.stringify(options)}`)

// Single-quotes a string for a POSIX shell, so a command can be nested in `sh -c`.
const quote = (text) => `'${text.replaceAll("'", `'\\''`)}'`
const nest = (levels, command) => {
  let line = command
  for (let i = 0; i < levels; i += 1) line = `sh -c ${quote(line)}`
  return line
}

// ---------------------------------------------------------------------------------------
// Nested scripts and the depth limit
// ---------------------------------------------------------------------------------------

test('nested sh -c: a write four shells deep is refused, five deep is past the reading limit', () => {
  refused(nest(4, `rm ${STATE}`))
  allowed(nest(5, `rm ${STATE}`))
  allowed(nest(5, 'echo hello'))
  allowed(nest(4, `cat ${STATE}`))
})

test('env -S: its command string is read one level deeper, within the same limit', () => {
  refused(nest(3, `env -S ${quote(`rm ${STATE}`)}`))
  allowed(nest(4, `env -S ${quote(`rm ${STATE}`)}`))
  allowed(`env -S ${quote(`cat ${STATE}`)}`)
  allowed(`env -S ${quote('echo hello')}`)
})

// ---------------------------------------------------------------------------------------
// git -C and redirects
// ---------------------------------------------------------------------------------------

test('git -C DIR: the paths a writing subcommand names are resolved from DIR', () => {
  refused('git -C .copilot-tracking/skraft-plans checkout us11/state.json')
  allowed('git -C docs checkout us11/state.json')
  allowed('git checkout us11/state.json')
})

test('a redirect with no target writes nothing the guard can name', () => {
  allowed('echo hi >')
  allowed("touch ''")
})

// ---------------------------------------------------------------------------------------
// xargs: the words the line produces are handed to the command
// ---------------------------------------------------------------------------------------

test('xargs feeding the state path to a writing command is refused, whichever kind of writer', () => {
  refused(`echo ${STATE} | xargs rm`) // removing verb
  refused(`echo ${STATE} | xargs touch`) // rewriting verb with no operand of its own
  refused(`printf '%s\\n' notes.txt ${STATE} | xargs cp`) // copying verb: the last word is written
  refused(`echo ${STATE} | xargs sed -i s/a/b/`) // in-place edit (files of its own)
  refused(`echo ${STATE} | xargs git checkout HEAD --`) // restores what it is handed (trees of its own)
})

test('xargs feeding the state path to a reader, or an unrelated path to a writer, passes', () => {
  allowed(`echo ${STATE} | xargs cat`)
  allowed(`echo ${STATE} | xargs wc -l`)
  allowed('echo notes.txt | xargs rm')
  allowed('echo notes.txt | xargs touch')
})

test('xargs rm and mv judge their input as whole directories; touch and cp only as files', () => {
  refused('echo .copilot-tracking/skraft-plans | xargs rm -rf')
  refused('echo .copilot-tracking | xargs mv -t /tmp')
  allowed('echo .copilot-tracking | xargs touch')
  allowed('echo .copilot-tracking/skraft-plans | xargs cp notes.txt')
})

test('xargs: a redirect target on the line is one of the words it may be handed', () => {
  refused('ls > .copilot-tracking | xargs rm -rf')
  allowed('ls > listing.txt | xargs rm -rf')
})

// ---------------------------------------------------------------------------------------
// cd / pushd / popd: an unknown directory makes a relative path unknown
// ---------------------------------------------------------------------------------------

test('once the directory is unknown, a later relative cd keeps it unknown', () => {
  refused('cd -; cd data; rm state.json')
  refused('popd; cd data; rm state.json')
  allowed('cd data; rm state.json')
})

test('cd with no operand, to ~ or to an unknown variable leaves the directory unknown', () => {
  refused('cd; rm state.json')
  refused('cd; cd data; rm state.json')
  refused('cd ~/proj; rm state.json')
  refused('cd $WORK; rm state.json')
  allowed('cd proj~; rm state.json')
})

test('pushd moves the directory like cd', () => {
  refused('pushd .copilot-tracking/skraft-plans/us11; rm state.json')
  allowed('pushd docs; rm state.json')
})

test('unknown directory: a relative path naming state.json counts, an absolute one is resolved', () => {
  refused('cd -; rm data/state.json')
  allowed('cd -; rm data/notes.json')
  refused('cd -; rm -rf C:/work/repo/sub/..', { cwd: 'C:\\work\\repo' })
  refused('cd -; rm -rf /repo/sub/..', { cwd: '/repo' })
  allowed('cd -; rm -rf /repo/sub/build', { cwd: '/repo' })
})

test('unknown directory: a Windows-style relative path is read with its backslashes as separators', () => {
  refused("cd -; touch 'sub\\state.json'")
  refused("cd -; touch '.copilot-tracking\\skraft-plans\\us11\\stat*'")
  allowed("cd -; touch 'docs\\readme.md'")
  allowed('cd -; touch readme.md')
  allowed('cd -; touch build/*.md')
})

// ---------------------------------------------------------------------------------------
// Globs
// ---------------------------------------------------------------------------------------

test('glob in the file name: it counts only when it can match a protected name', () => {
  refused('rm .copilot-tracking/skraft-plans/us11/state.*')
  refused('rm .copilot-tracking/skraft-plans/us11/state.js*')
  refused('rm .copilot-tracking/skraft-plans/us11/state.jso?')
  refused('rm .copilot-tracking/skraft-plans/us11/STATE.*')
  allowed('rm .copilot-tracking/skraft-plans/us11/*.md')
  allowed('rm .copilot-tracking/skraft-plans/us11/state.js?')
  allowed('rm .copilot-tracking/skraft-plans/us11/[ab]tate.json')
})

test('glob in the file name: each protected name is a candidate (execution log, jsonl, active pointer)', () => {
  refused('rm .copilot-tracking/skraft-plans/us11/execution-log.js?n')
  refused('rm .copilot-tracking/skraft-plans/us11/execution-log.json?')
  refused('rm .copilot-tracking/skraft-plans/.active-sl?g')
  allowed('rm .copilot-tracking/skraft-plans/us11/execution-log.txt?')
})

test('an invalid class pattern matches nothing (the shell takes it literally)', () => {
  allowed('rm .copilot-tracking/skraft-plans/us11/state[.json')
  allowed('rm -rf .copilot-tracking/skraft-plans/[')
})

test('glob for the project slug under the tracking directory', () => {
  refused('rm .copilot-tracking/skraft-plans/*/state.json')
  refused('rm .copilot-tracking/skraft-plans/?/state.json')
  allowed('rm .copilot-tracking/skraft-plans/*/notes.md')
})

test('glob for the slug under a custom tracking directory, or under the default one', () => {
  refused('rm .copilot-tracking/plans/*/state.json', { trackingDir: 'plans' })
  refused('rm .copilot-tracking/skraft-plans/*/state.json', { trackingDir: 'plans' })
  allowed('rm .copilot-tracking/other/*/notes.md', { trackingDir: 'plans' })
})

test('glob for the tracking directory under .copilot-tracking', () => {
  refused('rm .copilot-tracking/skraft-*/us11/state.json')
  refused('rm -rf .copilot-tracking/*')
  allowed('rm .copilot-tracking/other-*/us11/notes.md')
})

test('glob at the top level of the session directory: .copilot-tracking is a candidate there', () => {
  refused('rm -rf .copilot-*')
  refused('rm -rf .copilot-*', { cwd: '/repo' })
  refused('rm -rf /repo/.copilot-*', { cwd: '/repo' })
  allowed('rm -rf .github-*')
  allowed('rm -rf /repo/docs/.copilot-*', { cwd: '/repo' })
})

test('three glob segments are expanded; a lone glob segment is read too', () => {
  refused('rm .copilot-trackin?/skraft-plan?/us11/state.jso?')
  refused('rm -f .c*/s*/*/state.json')
})

// ---------------------------------------------------------------------------------------
// Paths given to isProtectedArtifactPath, with and without a session directory
// ---------------------------------------------------------------------------------------

test('isProtectedArtifactPath: a top-level glob is judged against the session directory', () => {
  assert.equal(isProtectedArtifactPath('.copilot-*/skraft-plans/us11/state.json'), true)
  assert.equal(isProtectedArtifactPath('.copilot-*/skraft-plans/us11/state.json', { cwd: '/repo' }), true)
  assert.equal(isProtectedArtifactPath('/repo/.copilot-*/skraft-plans/us11/state.json', { cwd: '/repo' }), true)
  assert.equal(isProtectedArtifactPath('/repo/.copilot-*/skraft-plans/us11/notes.md', { cwd: '/repo' }), false)
  assert.equal(isProtectedArtifactPath(''), false)
})

// ---------------------------------------------------------------------------------------
// Removing a directory: what holds the tracked state
// ---------------------------------------------------------------------------------------

test('rm -rf of the tracking directory, .copilot-tracking or a project directory is refused', () => {
  refused('rm -rf .copilot-tracking')
  refused('rm -rf .Copilot-Tracking')
  refused('rm -rf .copilot-tracking/skraft-plans')
  refused('rm -rf .copilot-tracking/skraft-plans/us11')
  refused('rm -rf .copilot-tracking/skraft-plans/feat-us11')
  allowed('rm -rf .copilot-tracking/skraft-plans/us11/notes')
  allowed('rm -rf .copilot-tracking/skraft-plans/feat_us11')
  allowed('rm -rf docs/us11')
})

test('rm -rf of a project directory under a custom tracking directory, or under the default one', () => {
  refused('rm -rf .copilot-tracking/plans/us11', { trackingDir: 'plans' })
  refused('rm -rf .copilot-tracking/skraft-plans/us11', { trackingDir: 'plans' })
  allowed('rm -rf .copilot-tracking/other/us11', { trackingDir: 'plans' })
})

test('rm -rf of the session directory or an ancestor (absolute session directory)', () => {
  refused('rm -rf /home/u', { cwd: '/home/u/repo' })
  refused('rm -rf /home/u/repo', { cwd: '/home/u/repo' })
  refused('rm -rf /', { cwd: '/home/u/repo' })
  refused('rm -rf ..', { cwd: '/home/u/repo' })
  allowed('rm -rf /home/u/other', { cwd: '/home/u/repo' })
  allowed('rm -rf /home/u/repo-old', { cwd: '/home/u/repo' })
})

test('rm -rf of the session directory or an ancestor (relative session directory)', () => {
  refused('rm -rf .')
  refused('rm -rf ..')
  refused('rm -rf ../other')
  allowed('rm -rf build')
})

test('rm -rf of an empty operand removes nothing', () => {
  allowed("rm -rf ''")
  allowed('rm -rf ""', { cwd: '/repo' })
})

test('rm -rf of an unknown directory: nothing, ., .. or a holder of the state counts', () => {
  refused('rm -rf $DIR')
  refused('cd -; rm -rf .', { cwd: '/repo' })
  refused('cd -; rm -rf ..', { cwd: '/repo' })
  refused('cd -; rm -rf .copilot-tracking', { cwd: '/repo' })
  refused('cd -; rm -rf skraft-plans/?', { cwd: '/repo' })
  allowed('cd -; rm -rf build', { cwd: '/repo' })
  allowed('cd $D; rm -rf ../build', { cwd: '/repo' })
  allowed('cd -; rm -rf build/*.md', { cwd: '/repo' })
  allowed('cd -; rm -rf build/*/', { cwd: '/repo' })
})

test('rm -rf of an unknown directory written with backslashes or trailing slashes', () => {
  refused("cd -; rm -rf '.copilot-tracking\\skraft-plans\\us11'")
  refused('cd -; rm -rf .copilot-tracking/')
  refused('cd -; rm -rf .copilot-tracking//')
  refused('cd -; rm -rf .copilot-tracking/skraft-plans')
  allowed('cd -; rm -rf build//')
})

// ---------------------------------------------------------------------------------------
// find walks
// ---------------------------------------------------------------------------------------

test('find -delete from a holder: a name filter that cannot select a protected file passes', () => {
  refused('find . -delete')
  refused('find . -name state.json -delete')
  refused("find . -name '*.md' -o -name state.json -delete")
  refused("find . -ipath '*Skraft-Plans*' -delete")
  allowed("find . -name '*.md' -delete")
  allowed("find . -ipath '*other-plans*' -delete")
  allowed('find docs -name state.json -delete')
})

// ---------------------------------------------------------------------------------------
// G8 workspace target
// ---------------------------------------------------------------------------------------

test('commandWritesWorkspace: a mutating verb behind an unknown wrapper still counts', () => {
  assert.equal(commandWritesWorkspace('parallel rm ::: src/a.js'), true)
  assert.equal(commandWritesWorkspace('fakeroot rm -f tests/a.test.js'), true)
  assert.equal(commandWritesWorkspace('parallel rm ::: srcx/a.js'), false)
})

test('commandWritesWorkspace: a mutating verb must be a whole word (vitest, mvn, inform are not vi, mv, rm)', () => {
  assert.equal(commandWritesWorkspace('vitest run src/a.test.js'), false)
  assert.equal(commandWritesWorkspace('mvn -q test -f tests/pom.xml'), false)
  assert.equal(commandWritesWorkspace('node scripts/inform.js src/a.js'), false)
  assert.equal(commandWritesWorkspace('npm run confirm -- src/a.js'), false)
})

test('commandWritesWorkspace: src or tests must be a whole path segment', () => {
  assert.equal(commandWritesWorkspace('touch lib/mysrc/a.js'), false)
  assert.equal(commandWritesWorkspace('touch lib/src/a.js'), true)
})

test('commandWritesWorkspace: removing src or tests themselves counts, not a look-alike', () => {
  assert.equal(commandWritesWorkspace('rm -rf ./src'), true)
  assert.equal(commandWritesWorkspace('rm -rf build/tests'), true)
  assert.equal(commandWritesWorkspace('rm -rf srcbackup'), false)
  assert.equal(commandWritesWorkspace('rm -rf ./srcs'), false)
})

test('commandWritesWorkspace: a find walk counts when it starts in src or tests', () => {
  assert.equal(commandWritesWorkspace('find ./src -delete'), true)
  assert.equal(commandWritesWorkspace('find tests -name "*.snap" -delete'), true)
  assert.equal(commandWritesWorkspace('find srcbackup -delete'), false)
  assert.equal(commandWritesWorkspace('find ./srcs -delete'), false)
  assert.equal(commandWritesWorkspace("find . -name '*.tmp' -delete"), false)
})

test('commandWritesWorkspace: an empty operand is no workspace path', () => {
  assert.equal(commandWritesWorkspace("rm -rf ''"), false)
  assert.equal(commandWritesWorkspace(''), false)
})

// ---------------------------------------------------------------------------------------
// Exported guards: codes and reasons
// ---------------------------------------------------------------------------------------

test('guardProtectedArtifact: a removed holder is refused with the command reason', () => {
  assert.deepEqual(guardProtectedArtifact({ command: 'rm -rf .copilot-tracking/skraft-plans/us11' }), {
    ok: false,
    error: {
      code: 'STATE_WRITE_FORBIDDEN',
      reason: 'direct edit of a tracked state.json, execution log or active pointer is forbidden; mutate recorded state only through the state CLI',
    },
  })
  assert.deepEqual(guardProtectedArtifact({ filePath: '.copilot-*/skraft-plans/us11/state.json' }), {
    ok: false,
    error: {
      code: 'STATE_WRITE_FORBIDDEN',
      reason: 'direct edit of .copilot-*/skraft-plans/us11/state.json is forbidden; mutate recorded state only through the state CLI',
    },
  })
})

test('guardOrchestratorWrite: codes and reasons of the G8 decisions on a removed workspace tree', () => {
  const orchestrators = ['orchestrator']
  assert.deepEqual(guardOrchestratorWrite({ command: 'rm -rf ./src', agentName: 'orchestrator', orchestrators }), {
    ok: false,
    error: {
      code: 'ORCHESTRATOR_WRITE_FORBIDDEN',
      reason: 'orchestrator never writes src/ or tests/; dispatch the phase agent that owns this change',
    },
  })
  assert.deepEqual(guardOrchestratorWrite({ command: 'rm -rf ./srcs', agentName: 'orchestrator', orchestrators }), { ok: true, value: { reason: 'no src/ or tests/ write' } })
  assert.deepEqual(guardOrchestratorWrite({ command: 'rm -rf ./src', agentName: 'deliver', orchestrators }), {
    ok: true,
    value: { reason: 'workspace write by deliver' },
  })
  // A removed tracking directory under src/ is a state write too: G7 refuses it for anyone.
  assert.equal(guardProtectedArtifact({ command: 'rm -rf src/.copilot-tracking' }).error.code, 'STATE_WRITE_FORBIDDEN')
})
