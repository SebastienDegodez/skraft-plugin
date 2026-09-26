// G7 command analysis, table-driven: every verb, wrapper, flag and shell separator the
// policy knows, each against a tracked state path and against an unrelated one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commandMutatesProtectedArtifact, isProtectedArtifactPath } from '../../../plugins/skraft-framework/src/domain/session-guard-policy.mjs'

const STATE = '.copilot-tracking/skraft-plans/us11/state.json'
const OTHER = 'web/src/store/state.json'
const mutates = (command) => commandMutatesProtectedArtifact(command)

test('every rewriting verb naming the tracked state mutates it; the same verb elsewhere does not', () => {
  for (const verb of ['rm', 'mv', 'tee', 'truncate', 'dd', 'shred', 'unlink', 'touch', 'vi', 'vim', 'nano', 'emacs', 'ex', 'ed']) {
    assert.equal(mutates(`${verb} ${STATE}`), true, verb)
    assert.equal(mutates(`/usr/bin/${verb} ${STATE}`), true, `/usr/bin/${verb}`)
    assert.equal(mutates(`${verb} ${OTHER}`), false, `${verb} elsewhere`)
  }
})

test('a copying verb mutates the tracked state only as its destination', () => {
  for (const verb of ['cp', 'install', 'ln', 'rsync']) {
    assert.equal(mutates(`${verb} -f /tmp/forged.json ${STATE}`), true, `${verb} into`)
    assert.equal(mutates(`${verb} ${STATE} /tmp/copy.json`), false, `${verb} from`)
    assert.equal(mutates(`${verb} ${STATE}`), false, `${verb} with a single operand`)
  }
})

test('an inline script naming the tracked state mutates it, whatever the interpreter and flag', () => {
  for (const interpreter of ['node', 'nodejs', 'deno', 'bun', 'python', 'python3', 'python3.12', 'perl', 'ruby', 'php']) {
    for (const flag of ['-e', '--eval', '-c', '-p', '--print', '-r']) {
      assert.equal(mutates(`${interpreter} ${flag} "x('${STATE}')"`), true, `${interpreter} ${flag}`)
    }
    assert.equal(mutates(`${interpreter} script.js ${STATE}`), false, `${interpreter} running a file`)
  }
  assert.equal(mutates(`mynode -e "x('${STATE}')"`), false, 'only whole interpreter names')
  assert.equal(mutates(`nodemon -e "x('${STATE}')"`), false, 'only whole interpreter names')
})

test('sed and perl edit in place only with -i or --in-place', () => {
  for (const flags of ['-i', '-i.bak', '-Ei', '--in-place', '--in-place=.bak']) {
    assert.equal(mutates(`sed ${flags} 's/a/b/' ${STATE}`), true, `sed ${flags}`)
  }
  assert.equal(mutates(`sed -n 's/a/b/p' ${STATE}`), false, 'sed without -i reads')
  assert.equal(mutates(`sed 's/-i/x/' ${STATE}`), false, 'an -i inside the script is not a flag')
  assert.equal(mutates(`perl -pi -e 's/a/b/' ${STATE}`), true, 'perl -pi')
  assert.equal(mutates(`perl -ne 'print' ${STATE}`), false, 'perl reading a file')
})

test('wrappers and assignments before the verb do not hide it', () => {
  for (const prefix of ['sudo', 'command', 'env', 'exec', 'nohup', 'time', 'xargs', 'FOO=1', 'A=1 B=2 sudo']) {
    assert.equal(mutates(`${prefix} rm ${STATE}`), true, prefix)
  }
  assert.equal(mutates(`sudo cat ${STATE}`), false, 'a wrapped read stays a read')
  assert.equal(mutates(`FOO=1`), false, 'an assignment alone runs nothing')
})

test('redirections into the tracked state mutate it; reads from it do not', () => {
  for (const redirect of ['>', '>>', '>|', '1>', '2>', '&>', '> ', '>> ']) {
    assert.equal(mutates(`echo x ${redirect}${STATE}`), true, JSON.stringify(redirect))
  }
  assert.equal(mutates(`echo x > "${STATE}"`), true, 'quoted target')
  assert.equal(mutates(`echo x > '${STATE}'`), true, 'single-quoted target')
  assert.equal(mutates(`jq . < ${STATE}`), false, 'input redirection reads')
  assert.equal(mutates(`cat <<< ${STATE}`), false, 'here-string reads')
  assert.equal(mutates(`echo x > ${OTHER}`), false, 'another state.json')
})

test('each simple command of a line is judged on its own', () => {
  for (const separator of [';', '&&', '||', '|', '&', '\n']) {
    assert.equal(mutates(`ls ${separator} rm ${STATE}`), true, `mutation after ${JSON.stringify(separator)}`)
    assert.equal(mutates(`rm -rf dist ${separator} cat ${STATE}`), false, `read after ${JSON.stringify(separator)}`)
  }
  assert.equal(mutates(';;'), false, 'empty segments')
  assert.equal(mutates(''), false, 'empty command')
  assert.equal(mutates('"" ""'), false, 'blank words')
})

test('an -i flag means in-place only for sed and perl', () => {
  assert.equal(mutates(`grep -i phase ${STATE}`), false)
  assert.equal(mutates(`diff -i ${STATE} /tmp/x.json`), false)
})

test('a copy destination is found past trailing options', () => {
  assert.equal(mutates(`cp /tmp/forged.json ${STATE} -v`), true)
  assert.equal(mutates(`cp -- /tmp/forged.json ${STATE}`), true)
})

test('a redirection at the start of a command truncates its target', () => {
  assert.equal(mutates(`> ${STATE}`), true)
  assert.equal(mutates(`>>${STATE}`), true)
})

test('quoted operands are read without their quotes', () => {
  assert.equal(mutates(`rm "${STATE}"`), true)
  assert.equal(mutates(`rm '${STATE}'`), true)
  assert.equal(mutates(`rm "a b" ${STATE}`), true)
})

test('the tracking directory name is matched literally', () => {
  assert.equal(isProtectedArtifactPath('.copilot-tracking/skraftXplans/us11/state.json'), false)
  assert.equal(isProtectedArtifactPath('/tmp/a.b/us11/state.json', { trackingDir: 'a.b' }), true)
  assert.equal(isProtectedArtifactPath('/tmp/aXb/us11/state.json', { trackingDir: 'a.b' }), false)
  assert.equal(isProtectedArtifactPath('.COPILOT-TRACKING/SKRAFT-PLANS/us11/STATE.JSON'), true, 'case-insensitive filesystems')
})
