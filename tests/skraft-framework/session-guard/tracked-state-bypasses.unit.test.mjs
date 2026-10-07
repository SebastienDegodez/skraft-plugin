// G7 against the shell, not only plain commands: quoting, variables, cd, nested shells,
// xargs, find, git and wrapper options must not let a command write the tracked state —
// and the hardening must not refuse what only reads it or writes elsewhere.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commandMutatesProtectedArtifact, guardProtectedArtifact, isProtectedArtifactPath } from '../../../plugins/skraft-framework/src/domain/session-guard-policy.mjs'
import { createPreToolUseSessionGuardService } from '../../../plugins/skraft-framework/src/application/pre-tool-use-session-guard-service.mjs'

const DIR = '.copilot-tracking/skraft-plans/x'
const STATE = `${DIR}/state.json`
const mutates = (command, options) => commandMutatesProtectedArtifact(command, options)

test('quoting and escaping the file name does not hide it', () => {
  for (const command of [
    `rm ${DIR}/'state.json'`,
    `rm ${DIR}/"state".json`,
    `rm ${DIR}/state\\.json`,
    `echo {} > ${DIR}/'state.json'`,
    `echo {} >${DIR}/"state.json"`,
    `rm '.copilot'-tracking/skraft-plans/x/state.json`,
    `rm ${DIR}/state.\\\njson`,
  ]) assert.equal(mutates(command), true, command)
})

test('a variable the line sets, or one the guard cannot know, does not hide the file', () => {
  for (const command of [
    `D=${DIR}; rm $D/state.json`,
    `D=${DIR} && rm "\${D}/state.json"`,
    `export D=${DIR}; echo {} > $D/state.json`,
    `F=state.json; rm ${DIR}/$F`,
    `rm $SOMEWHERE/state.json`,
    'rm "$(pwd)"/state.json',
    'rm `pwd`/.active-slug',
    'echo {} > $DIR/execution-log.jsonl',
  ]) assert.equal(mutates(command), true, command)
  assert.equal(mutates('rm $SOMEWHERE/notes.json'), false, 'an unknown directory with another file name')
  assert.equal(mutates('D=/tmp; rm $D/state.json'), false, 'a known directory elsewhere')
})

test('cd and pushd move where relative paths point; an unknown directory counts as ours', () => {
  for (const command of [
    `cd ${DIR} && rm state.json`,
    `cd .copilot-tracking; cd skraft-plans/x; echo {} > state.json`,
    `pushd ${DIR} && rm state.json`,
    `cd ${DIR}/../x && rm ./state.json`,
    'cd - && rm state.json',
    'cd ~/repo/.copilot-tracking/skraft-plans/x && rm state.json',
    'cd "$WORK" && rm state.json',
    'popd; rm state.json',
    `env -C ${DIR} rm state.json`,
    `env --chdir=${DIR} rm state.json`,
  ]) assert.equal(mutates(command, { cwd: '' }), true, command)
  for (const command of [
    'cd /tmp && rm state.json',
    `cd ${DIR}/.. && rm state.json`,
    'rm state.json',
    `cd ${DIR}; cd /tmp; rm state.json`,
  ]) assert.equal(mutates(command), false, command)
})

test('the session directory the hook reports is where a relative path starts', () => {
  const inside = `/repo/${DIR}`
  assert.equal(mutates('rm state.json', { cwd: inside }), true)
  assert.equal(mutates('echo {} > ./state.json', { cwd: inside }), true)
  assert.equal(mutates('rm ../x/state.json', { cwd: inside }), true)
  assert.equal(mutates('rm state.json', { cwd: '/repo' }), false)
  assert.equal(mutates(`rm ${STATE}`, { cwd: '/repo' }), true)
  assert.equal(mutates('cat state.json', { cwd: inside }), false, 'a read stays a read')
  assert.equal(isProtectedArtifactPath('state.json', { cwd: inside }), true, 'a Write tool path resolves from it too')
  assert.equal(isProtectedArtifactPath('state.json', { cwd: '/repo' }), false)
  assert.equal(isProtectedArtifactPath('C:\\repo\\.copilot-tracking\\skraft-plans\\x\\state.json'), true)
  assert.equal(guardProtectedArtifact({ command: 'rm state.json', cwd: inside }).ok, false)
})

test('wrapper options, keywords and timeouts do not hide the verb', () => {
  for (const prefix of ['env -u=X', 'env -u X', 'env --unset=X', 'env -i FOO=1', 'sudo -u bob', 'sudo -E', 'doas -u root', 'timeout 5', 'timeout -s KILL 5', 'nice -n 5', 'nice -5', 'stdbuf -o L', 'ionice -c 3', 'command', 'builtin', 'exec -a name', 'then', 'do', 'else', '!', '{', 'time -p', 'nohup sudo']) {
    assert.equal(mutates(`${prefix} rm ${STATE}`), true, prefix)
  }
  assert.equal(mutates(`if true; then rm ${STATE}; fi`), true)
  assert.equal(mutates(`while true; do rm ${STATE}; done`), true)
  assert.equal(mutates(`f() { rm ${STATE}; }`), true)
  assert.equal(mutates(`env -S "rm ${STATE}"`), true, 'env -S splits a command line')
  assert.equal(mutates(`env --split-string="rm ${STATE}"`), true)
  assert.equal(mutates(`sudo -u bob cat ${STATE}`), false)
})

test('a command another command runs is read too: sh -c, eval, $( ), find -exec, xargs', () => {
  for (const command of [
    `bash -c "rm ${STATE}"`,
    `sh -c 'echo {} > ${STATE}'`,
    `bash -lc "cd ${DIR} && rm state.json"`,
    `zsh -ec "rm ${DIR}/'state.json'"`,
    `eval "rm ${STATE}"`,
    `eval rm ${STATE}`,
    `echo "$(rm ${STATE})"`,
    `echo \`rm ${STATE}\``,
    `bash <<'EOF'\nrm ${STATE}\nEOF`,
    `echo ${STATE} | xargs rm`,
    `ls ${DIR}/* | xargs -n 1 rm -f`,
    `printf '%s\\n' ${STATE} | xargs -I{} cp /tmp/forged {}`,
    `find ${DIR} -name state.json -delete`,
    `find .copilot-tracking -name '*.json' -delete`,
    `find . -name state.json -exec rm {} \\;`,
    `find ${DIR} -type f -delete`,
    `find . -delete`,
    `find . -name 'state*' -execdir rm {} +`,
  ]) assert.equal(mutates(command), true, command)
  for (const command of [
    `bash -c "cat ${STATE}"`,
    'bash script.sh',
    `find ${DIR} -name state.json`,
    `find ${DIR} -name state.json -print`,
    'find dist -type f -delete',
    "find src -name '*.tmp' -delete",
    `echo ${STATE} | xargs cat`,
    `echo ${STATE} | xargs grep phase`,
    `echo "$(cat ${STATE})"`,
  ]) assert.equal(mutates(command), false, command)
})

test('git commands that overwrite or remove files, cp -t and mv into the directory', () => {
  for (const command of [
    `git checkout HEAD~1 -- ${STATE}`,
    `git checkout -- ${STATE}`,
    `git restore --source=HEAD ${STATE}`,
    `git rm ${STATE}`,
    `git mv /tmp/a.json ${STATE}`,
    `git -C . clean -f ${DIR}`,
    `cp -t ${DIR} /tmp/state.json`,
    `cp --target-directory=${DIR} /tmp/state.json`,
    `cp /tmp/state.json ${DIR}`,
    `cp /tmp/state.json ${DIR}/`,
    `mv /tmp/state.json ${DIR}/`,
    `install -m 644 /tmp/state.json ${DIR}`,
    `ln -sf /tmp/state.json ${DIR}`,
    `rsync -a /tmp/x/state.json ${DIR}/`,
    `awk -i inplace '{print}' ${STATE}`,
    `patch ${STATE} < fix.diff`,
    `dd of=${STATE} if=/tmp/x`,
    `cat /tmp/x | sponge ${STATE}`,
  ]) assert.equal(mutates(command), true, command)
  for (const command of [
    'git checkout main',
    `git diff ${STATE}`,
    `git log -- ${STATE}`,
    `git show HEAD:${STATE}`,
    `cp ${STATE} /tmp/backup.json`,
    `cp -t /tmp ${STATE}`,
    `cp /tmp/notes.json ${DIR}`,
    `dd if=${STATE} of=/tmp/x`,
    `awk '{print}' ${STATE}`,
    `perl -ne 'print' ${STATE}`,
  ]) assert.equal(mutates(command), false, command)
})

test('reads and writes elsewhere stay allowed', () => {
  for (const command of [
    `cat ${STATE}`,
    `jq .currentPhase ${STATE} > /tmp/phase.txt`,
    `grep -r state.json .`,
    `echo "rm ${STATE}"`,
    `echo 'cd ${DIR} && rm state.json'`,
    `node script.js ${STATE}`,
    'rm web/src/store/state.json',
    `rm ${DIR}/notes.md`,
    `ls ${DIR}; echo done`,
    `diff ${STATE} /tmp/x.json`,
    `tail -f ${DIR}/execution-log.jsonl`,
    `cat ${STATE} | jq . > /tmp/pretty.json`,
    `D=${DIR}; cat $D/state.json`,
  ]) assert.equal(mutates(command), false, command)
})

test('the session guard service passes the session directory the hook reports', async () => {
  const audits = []
  const service = createPreToolUseSessionGuardService({
    stateReader: { read: async () => { throw new Error('none') } },
    auditWriter: { write: async (entry) => { audits.push(entry) } },
    config: {},
    clock: { now: () => '2026-10-07T00:00:00.000Z' },
  })
  const bash = (command, cwd) => ({ hookType: 'PreToolUse', toolName: 'Bash', toolInput: { command }, ...(cwd === undefined ? {} : { cwd }) })
  const denied = await service.handle(bash('rm state.json', `/repo/${DIR}`))
  assert.match(JSON.stringify(denied), /deny/)
  assert.equal(audits.at(-1).decision, 'DENY')
  const allowed = await service.handle(bash('rm state.json', '/repo'))
  assert.doesNotMatch(JSON.stringify(allowed ?? {}), /"deny"/)
  const noCwd = await service.handle(bash('rm state.json', ''))
  assert.doesNotMatch(JSON.stringify(noCwd ?? {}), /"deny"/, 'an empty cwd is the session root')
})

test('removing a directory that holds the tracked state, or a glob that can name it, counts', () => {
  for (const command of [
    `rm -rf ${DIR}`,
    `rm -r ${DIR}/`,
    'rm -rf .copilot-tracking/skraft-plans',
    'rm -rf .copilot-tracking',
    'rm -rf .',
    'rm -rf ../repo',
    `rm ${DIR}/*`,
    `rm ${DIR}/*.json`,
    `rm ${DIR}/state.*`,
    'rm .copilot-tracking/skraft-plans/*/state.json',
    'rm -rf .copilot-tracking/*',
    `mv ${DIR} /tmp/gone`,
    'rmdir .copilot-tracking/skraft-plans/x',
    'git clean -fdx .',
    `git rm -r ${DIR}`,
    'git checkout .',
    `cd ${DIR} && rm -rf .`,
    `cd ${DIR} && rm *`,
  ]) assert.equal(mutates(command), true, command)
  assert.equal(mutates('rm -rf ..', { cwd: `/repo/${DIR}` }), true, 'the session directory\'s parent')
  assert.equal(mutates('rm -rf /repo', { cwd: '/repo' }), true, 'the session directory itself')
  for (const command of [
    'rm -rf dist node_modules',
    `rm ${DIR}/reviews/*.md`,
    `rm -rf ${DIR}/reviews`,
    `rm ${DIR}/details/2026-10-07/*`,
    `mv ${DIR}/notes.md /tmp/`,
    'git clean -fd src',
    'git checkout -- src/app.mjs',
    'rm -rf /tmp/build',
  ]) assert.equal(mutates(command), false, command)
  assert.equal(mutates('rm -rf /elsewhere', { cwd: '/repo' }), false)
})

test('G8 counts removing src or tests themselves as a workspace write', async () => {
  const { commandWritesWorkspace } = await import('../../../plugins/skraft-framework/src/domain/session-guard-policy.mjs')
  assert.equal(commandWritesWorkspace('rm -rf src'), true)
  assert.equal(commandWritesWorkspace('rm -rf ./tests/'), true)
  assert.equal(commandWritesWorkspace('find src -name "*.tmp" -delete'), true)
  assert.equal(commandWritesWorkspace('rm -rf dist'), false)
  assert.equal(commandWritesWorkspace('cat src/app.mjs'), false)
})
