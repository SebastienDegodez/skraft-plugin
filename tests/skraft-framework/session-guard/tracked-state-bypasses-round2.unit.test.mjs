// G7 regressions: the bypasses the mutation pass on the guard surfaced. Each command
// below writes or removes the tracked state and was allowed before; each must stay refused.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commandMutatesProtectedArtifact } from '../../../plugins/skraft-framework/src/domain/session-guard-policy.mjs'

const DIR = '.copilot-tracking/skraft-plans/us11'
const STATE = `${DIR}/state.json`
const refused = (command, cwd) => assert.equal(commandMutatesProtectedArtifact(command, cwd === undefined ? {} : { cwd }), true, `${command} (cwd ${cwd})`)
const allowed = (command, cwd) => assert.equal(commandMutatesProtectedArtifact(command, cwd === undefined ? {} : { cwd }), false, `${command} (cwd ${cwd})`)

test('commands inside $(( )), ${…}, $\'…\' and $"…" quoting, and brace expansion are read', () => {
  refused(`echo $(( $(rm ${STATE}) ))`)
  refused(`echo $(( \`rm ${STATE}\` ))`)
  refused(`echo \${X:-$(rm ${STATE})}`)
  refused(`echo \${X:-\`rm ${STATE}\`}`)
  refused(`echo "\${X:-$(rm ${STATE})}"`)
  refused(`echo \${X:=$(echo a > ${STATE})}`)
  refused(`rm ${DIR}/$'state.json'`)
  refused(`rm ${DIR}/$'\\x73tate.json'`)
  refused(`rm ${DIR}/$'\\163tate.json'`)
  refused(`rm ${DIR}/$"state.json"`)
  refused(`echo {} > ${DIR}/$'state.json'`)
  refused(`rm ${DIR}/{state,x}.json`)
  refused(`rm .copilot-tracking/skraft-plans/{a,us11}/{state.json,notes.md}`)
  allowed(`echo $(( 1 + 2 )) \${X:-default} $'a\\tb' {a,b}.md`)
  allowed(`rm ${DIR}/{notes,todo}.md`)
})

test('wrappers: env -, files a wrapper writes itself, more wrappers', () => {
  refused(`env - rm ${STATE}`)
  refused(`/usr/bin/time -o ${STATE} true`)
  refused(`command time --output=${STATE} true`)
  refused(`strace -o ${STATE} ls`)
  refused(`strace -o${STATE} ls`)
  refused(`fakeroot rm ${STATE}`)
  refused(`setsid rm ${STATE}`)
  refused(`taskset 0x1 rm ${STATE}`)
  refused(`parallel rm ::: ${STATE}`)
  allowed(`/usr/bin/time -o /tmp/timing.txt cat ${STATE}`)
  allowed(`strace -o /tmp/trace.txt cat ${STATE}`)
})

test('find: the files -fprint writes, each -exec on its own with {} for the files found', () => {
  refused(`find /tmp -maxdepth 0 -fprint ${STATE}`)
  refused(`find /tmp -maxdepth 0 -fprintf ${STATE} x`)
  refused(`find /tmp -maxdepth 0 -fls ${STATE}`)
  refused(`find /tmp -name forged.json -exec cp {} ${STATE} \\;`)
  refused(`find /tmp/backup -name state.json -exec cp -t ${DIR} {} +`)
  refused(`find /tmp -maxdepth 0 -exec true \\; -exec rm ${STATE} \\;`)
  refused(`find /tmp -maxdepth 0 -exec sh -c 'rm ${STATE}' \\;`)
  allowed(`find ${DIR} -name '*.md' -exec cat {} \\;`)
  allowed('find /tmp -name "*.log" -exec rm {} +')
  allowed(`find ${DIR} -fprint /tmp/list.txt`)
})

test('awk in place, recursive copies and moves into the tracking directory, mv toward a glob', () => {
  refused(`gawk --include=inplace '{print}' ${STATE}`)
  refused(`gawk --include inplace '{print}' ${STATE}`)
  refused(`gawk -iinplace '{print}' ${STATE}`)
  allowed(`gawk -f ${STATE} -i inplace /tmp/x`)
  refused('cp -r /tmp/forged/skraft-plans .copilot-tracking/')
  refused('cp -r /tmp/us11 .copilot-tracking/skraft-plans/')
  refused(`cp -a /tmp/forged ${DIR}`)
  refused('mv /tmp/us11 .copilot-tracking/skraft-plans/')
  refused('mv /tmp/notes.md .copilot-tracking/*')
  allowed(`cp /tmp/notes.md ${DIR}/`)
  allowed(`cp -r /tmp/drafts ${DIR}/drafts-copy/`)
  allowed(`mv /tmp/notes.md ${DIR}/`)
})

test('globs: bracket classes, more than 3 glob segments, ancestors of the session, an unknown directory', () => {
  refused(`rm ${DIR}/[s]tate.json`)
  refused('rm -rf .copilot-trackin[g]')
  refused('rm -rf .copilot-tracking/skraft-plan[s]')
  refused(`rm ${DIR}/[!x]tate.json`)
  refused('cd -; rm data/[s]tate.json')
  refused('rm -f .c*/s*/*/state.jso?')
  refused('rm -rf ../*', '/home/u/repo')
  refused('rm -rf /*', '/repo')
  refused('rm -rf /?', '/x')
  refused('rm -rf /')
  refused('rm -rf ../..', 'repo')
  refused('rm -rf C:/', 'C:/w/x')
  refused('rm -rf ../../..', 'C:/w/x')
  refused('cd -; rm -rf .copilot-*', '/repo')
  refused('cd -; rm -rf skraft-*', '/repo')
  allowed(`rm ${DIR}/[n]otes.md`)
  allowed('rm -rf ../other-project/*', '/home/u/repo')
  allowed('rm -rf /tmp/*', '/repo')
  allowed('rm a[b')
})
