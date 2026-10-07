// G7/G8 command reading, verb by verb: every wrapper option, verb table entry and
// branch of the policy, each pinned by a refused command and an allowed counterpart
// that differs only where the policy decides.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commandMutatesProtectedArtifact, commandWritesWorkspace, guardProtectedArtifact } from '../../../plugins/skraft-framework/src/domain/session-guard-policy.mjs'

const STATE = '.copilot-tracking/skraft-plans/us11/state.json'
const US11 = '.copilot-tracking/skraft-plans/us11'
const mutates = (command, options = {}) => commandMutatesProtectedArtifact(command, options)
const refused = (command, options) => assert.equal(mutates(command, options), true, `refused: ${command}`)
const allowed = (command, options) => assert.equal(mutates(command, options), false, `allowed: ${command}`)

// ── wrappers and their options ─────────────────────────────────────────────

test('every sudo option that takes a value skips that value before the command', () => {
  for (const option of ['-u bob', '-g wheel', '-C 3', '-h host', '-p pw', '-r role', '-t type', '-U bob', '-D /srv/app', '--user bob', '--group wheel', '--chdir /srv/app', '--prompt pw']) {
    refused(`sudo ${option} rm ${STATE}`)
    allowed(`sudo ${option} cat ${STATE}`)
  }
})

test('doas -C, env --unset/--chdir/--split-string take a value', () => {
  refused(`doas -C /etc/doas.conf rm ${STATE}`)
  refused(`env --unset FOO rm ${STATE}`)
  refused(`env --chdir /srv/app rm ${STATE}`)
  allowed(`env --unset FOO cat ${STATE}`)
})

test('every xargs option that takes a value skips that value before the command', () => {
  for (const option of ['-I X', '-L 1', '-P 4', '-d ,', '-E END', '-s 100', '-a list.txt', '--arg-file list.txt', '--delimiter ,', '--max-args 1', '--max-procs 4', '--max-lines 1']) {
    refused(`xargs ${option} rm ${STATE}`)
    allowed(`xargs ${option} cat ${STATE}`)
  }
})

test('time, nice, timeout, stdbuf and ionice options that take a value are skipped with it', () => {
  for (const prefix of ['time -f %e', 'time -o /tmp/t', 'time --format %e', 'time --output /tmp/t', 'nice --adjustment 5', 'timeout -k 5 10', 'timeout --signal KILL 10', 'timeout --kill-after 5 10', 'stdbuf -i 0', 'stdbuf -e 0', 'ionice -c 3', 'ionice -n 7', 'ionice -p 42']) {
    refused(`${prefix} rm ${STATE}`)
    allowed(`${prefix} cat ${STATE}`)
  }
})

test('timeout skips an assignment, then its duration, before the command', () => {
  refused(`timeout A=1 10 rm ${STATE}`)
})

test('wrapper options are read one after the other until the command', () => {
  refused(`sudo -u bob -g wheel rm ${STATE}`)
  refused(`sudo -- rm ${STATE}`)
  // After `--` the next word is the command, even one that looks like an option.
  allowed(`env -- -i rm ${STATE}`)
})

test('every shell keyword in front of a command is set aside', () => {
  refused(`if rm ${STATE}; then :; fi`)
  refused(`if false; then :; elif rm ${STATE}; then :; fi`)
  refused(`while rm ${STATE}; do :; done`)
  refused(`until rm ${STATE}; do :; done`)
  refused(`coproc rm ${STATE}`)
  allowed(`if cat ${STATE}; then :; fi`)
})

test('only xargs hands the command the words of the rest of the line', () => {
  allowed(`cat ${STATE} | sudo tee /tmp/copy`)
  refused(`echo ${STATE} | xargs tee`)
  // xargs alone runs echo: nothing is written.
  allowed(`echo ${STATE} | xargs`)
  allowed(`echo . | xargs`)
  // xargs mv with no operand of its own moves what it is handed.
  refused(`echo ${STATE} | xargs mv`)
})

// ── env -C / sudo -D / --chdir: the directory the command runs from ───────

test('a wrapper directory option moves where a relative path resolves', () => {
  refused('sudo --chdir .copilot-tracking/skraft-plans/us11 touch state.json')
  refused('sudo -D .copilot-tracking/skraft-plans/us11 touch state.json')
  refused('env --chdir=.copilot-tracking/skraft-plans/us11 touch state.json')
  refused('env -C .copilot-tracking/skraft-plans/us11 touch state.json')
  allowed('env -C /srv/other touch state.json', { cwd: US11 })
})

test('the attached -Cdir form names the directory without the option letters', () => {
  refused('env -Cskraft-plans touch us11/state.json', { cwd: '.copilot-tracking' })
  refused('sudo -Dskraft-plans touch us11/state.json', { cwd: '.copilot-tracking' })
  allowed('env -Cother touch us11/state.json', { cwd: '.copilot-tracking' })
})

test('an option value that is not a directory leaves the directory alone', () => {
  refused('sudo -u bob touch state.json', { cwd: US11 })
  refused('xargs -n 1 touch state.json', { cwd: US11 })
  refused('git --no-pager checkout state.json', { cwd: US11 })
})

// ── env -S / --split-string: a command string ─────────────────────────────

test('env -S, --split-string and their attached forms run their command string', () => {
  refused(`env -S 'touch ${STATE}'`)
  refused(`env -S'touch ${STATE}'`)
  refused(`env --split-string 'touch ${STATE}'`)
  refused(`env --split-string='touch ${STATE}'`)
  allowed(`env -S'cat ${STATE}'`)
  // The command string runs where the line is, an option inside it moves nothing.
  refused(`env -S'touch state.json -Dx'`, { cwd: US11 })
})

test('an option value that merely reads like a command is not run', () => {
  allowed(`sudo -p 'rm ${STATE}' ls`)
  allowed(`xargs -E 'rm ${STATE}' echo`)
  allowed(`env '--chdir=touch ${STATE} -Sx' ls`)
})

// ── verb tables ────────────────────────────────────────────────────────────

test('shred and unlink remove a whole directory like rm', () => {
  refused(`shred ${US11}`)
  refused(`unlink ${US11}`)
  refused('rmdir .copilot-tracking/skraft-plans')
  allowed('shred /tmp/secret')
})

test('a protected name only counts at the end of an unknown path, execution-log.json included', () => {
  allowed('touch "$X/state.json.bak"')
  refused('touch "$X/state.json"')
  refused('touch "$X/execution-log.json"')
  refused('touch "$X/execution-log.jsonl"')
})

test('the paths an inline script text names are read out of it, between backticks too', () => {
  refused(`node -e 'fs.writeFileSync(\`${STATE}\`, "x")'`)
  refused('node -e \'fs.writeFileSync(`.copilot-tracking/skraft-plans/us11/execution-log.json`, "x")\'')
  allowed('node -e \'fs.writeFileSync(`/tmp/state.json.txt`, "x")\'')
})

// ── base names ─────────────────────────────────────────────────────────────

test('a copy into a directory writes the base name of each source, trailing slashes stripped', () => {
  refused(`cp backup/state.json ${US11}`)
  refused(`cp /tmp/backup/state.json/ ${US11}`)
  refused(`cp backup/state.json// ${US11}`)
  allowed(`cp backup/notes.json ${US11}`)
})

// ── mv ─────────────────────────────────────────────────────────────────────

test('mv writes its last operand and moves every other one away', () => {
  refused(`mv /tmp/a /tmp/state.json ${US11}`)
  refused(`mv /tmp/a ${STATE} /tmp/backup/`)
  allowed('mv /tmp/notes.md .copilot-tracking/')
  allowed(`mv /tmp/a /tmp/notes.json ${US11}`)
})

// ── dd ─────────────────────────────────────────────────────────────────────

test('dd writes of= and any stray operand, never if=', () => {
  refused('dd if=/dev/zero of=skraft-plans/us11/state.json', { cwd: '.copilot-tracking' })
  refused('dd if=/dev/zero xof=skraft-plans/us11/state.json', { cwd: '.copilot-tracking' })
  allowed(`dd if=${STATE} of=/tmp/copy`)
  // Only dd reads if=: for tee it is a file name like any other.
  refused(`tee if=${STATE}`)
})

// ── copying verbs ──────────────────────────────────────────────────────────

test('cp --target-directory DIR, spaced, copies every operand into DIR', () => {
  refused(`cp --target-directory ${US11} /tmp/state.json`)
  allowed(`cp --target-directory ${US11} /tmp/notes.json`)
})

test('the -t directory is not a source copied into itself', () => {
  allowed("cp -t '.copilot-tracking/*' /tmp/notes.md")
})

test('a copy destination is not copied into itself', () => {
  allowed("cp /tmp/notes.md '.copilot-tracking/*'")
})

test('a lone `-` is an operand, not an option', () => {
  refused(`cp - ${STATE}`)
  refused(`mv - ${STATE}`)
})

// ── awk / gawk in place ────────────────────────────────────────────────────

test('awk and gawk -i inplace rewrite their files; any other -i or a file named inplace does not', () => {
  refused(`gawk -i inplace '{print}' ${STATE}`)
  refused(`awk -i inplace '{print}' ${STATE}`)
  allowed(`awk -i lib '{print}' ${STATE}`)
  allowed(`awk '{print}' inplace ${STATE}`)
  allowed(`grep -i inplace ${STATE}`)
  // The program file is read, not rewritten.
  allowed(`awk -f ${STATE} -i inplace /tmp/x`)
})

test('the -i inplace pair does not hide what a shell -c runs', () => {
  refused(`bash -c 'rm ${STATE}' -i inplace`)
})

// ── shells and eval ────────────────────────────────────────────────────────

test('every shell runs its -c string, flags clustered or not', () => {
  for (const shell of ['sh', 'bash', 'zsh', 'dash', 'ksh', 'mksh', 'ash', '/bin/bash']) {
    for (const flag of ['-c', '-lc', '-ec', '-ce', '-xce']) {
      refused(`${shell} ${flag} 'rm ${STATE}'`)
      allowed(`${shell} ${flag} 'cat ${STATE}'`)
    }
  }
  refused(`bash --norc -c 'rm ${STATE}'`)
})

test('a word only shaped like -c, or a verb only named like a shell, runs nothing', () => {
  allowed(`bash ./build.sh -c1 'rm ${STATE}'`)
  allowed(`sh 'rm ${STATE}'`)
  allowed(`bash -c`)
  allowed(`ssh host -c 'rm ${STATE}'`)
  allowed(`sha256sum -c 'rm ${STATE}'`)
})

test('eval runs its words as a command line', () => {
  refused(`eval rm ${STATE}`)
  allowed(`eval cat ${STATE}`)
})

// ── git ────────────────────────────────────────────────────────────────────

test('every git global option that takes a value is skipped before the subcommand', () => {
  for (const option of ['-C .', '-c core.autocrlf=false', '--git-dir .git', '--work-tree .', '--namespace ns', '--exec-path /usr/lib/git-core', '--super-prefix sub/']) {
    refused(`git ${option} checkout ${STATE}`)
    allowed(`git ${option} log ${STATE}`)
  }
})

test('every writing git subcommand refuses the tracked state', () => {
  for (const sub of ['checkout', 'restore', 'rm', 'mv', 'clean']) {
    refused(`git ${sub} ${STATE}`)
    refused(`git ${sub} -- ${STATE} README.md`)
  }
  allowed(`git diff -- ${STATE}`)
})

test('git -C sets where git runs, nothing else does', () => {
  refused('git -C .copilot-tracking/skraft-plans/us11 checkout state.json')
  allowed('git -C /srv/other checkout .')
  allowed('git -C .copilot-tracking/skraft-plans/us11 checkout main')
  allowed('git -C /srv/other checkout state.json', { cwd: US11 })
})

test('git with options only, or nothing at all, writes nothing', () => {
  allowed('git --version')
  allowed('git -C /srv/x')
  allowed('git')
})

test('git restore --source= names a commit, not a path', () => {
  refused(`git restore --source=HEAD~1 ${STATE}`)
  allowed('git restore --source=HEAD~1 README.md')
  // Only a word that starts with --source= is the option: a path ending like it is a path.
  refused('git restore /srv/app--source=', { cwd: '/srv/app--source=' })
})

// ── find ───────────────────────────────────────────────────────────────────

test('every removing find action over a walk that holds the tracked state is refused', () => {
  for (const action of ['-delete', '-exec rm {} ;', '-execdir rm {} ;', '-ok rm {} ;', '-okdir rm {} ;']) {
    refused(`find .copilot-tracking ${action.replace(';', '\\;')}`)
    allowed(`find /tmp ${action.replace(';', '\\;')}`)
  }
})

test('a find output file is judged by where it lands, not by the walk', () => {
  for (const action of ['-fprint', '-fprint0', '-fls']) {
    allowed(`find .copilot-tracking ${action} /tmp/list`)
    refused(`find /tmp ${action} ${STATE}`)
  }
  allowed('find .copilot-tracking -fprintf /tmp/list %p')
  refused(`find /tmp -fprintf ${STATE} %p`)
})

test('a find -exec that only reads the tracked state is allowed', () => {
  allowed('find .copilot-tracking -exec cat {} \\;')
  allowed('find .copilot-tracking -execdir grep -l phase {} +')
})

test('every find name filter that cannot select a protected file keeps the walk allowed', () => {
  for (const filter of ['-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename', '-regex', '-iregex']) {
    allowed(`find . ${filter} '*.log' -delete`)
    refused(`find . ${filter} 'state.json' -delete`)
  }
})

test('find without a start point walks the current directory', () => {
  refused('find -name state.json -delete')
  refused('find -delete')
  allowed('cd /tmp && find -name state.json -delete')
})

test('find start points end at the first option, ( or !', () => {
  allowed(`find /tmp -newer ${STATE} -delete`)
  allowed(`find /tmp \\( ${STATE} \\) -delete`)
  allowed(`find /tmp \\! ${STATE} -delete`)
  refused(`find /tmp ${STATE} -delete`)
})

test('only find reads find actions', () => {
  allowed('echo -delete')
  allowed('echo -exec rm -rf .')
})

test('find -exec runs the command after the action, without ; + and {}', () => {
  refused(`find /tmp -name x -exec rm ${STATE} \\;`)
  refused(`find /tmp -name '*.tmp' -delete -exec rm ${STATE} \\;`)
  refused(`cd /tmp && find -exec rm /srv/app/${STATE} \\;`)
  refused(`find /tmp -name state.json -exec mv {} ${US11}/ \\;`)
  refused(`find /tmp -name x -exec touch {} \\; -exec rm ${STATE} \\;`)
  allowed(`find /tmp -name x -exec cat ${STATE} \\;`)
  // -delete runs no command: its start points are not one.
  allowed(`find touch ${STATE} -name '*.bak' -delete`)
})

// ── public entry points agree ─────────────────────────────────────────────

test('guardProtectedArtifact refuses what the command reading refuses', () => {
  assert.equal(guardProtectedArtifact({ command: `sudo -g wheel rm ${STATE}` }).ok, false)
  assert.equal(guardProtectedArtifact({ command: `git -c a=b checkout ${STATE}` }).ok, false)
  assert.equal(guardProtectedArtifact({ command: `git -c a=b log ${STATE}` }).ok, true)
})

test('commandWritesWorkspace reads the same wrappers and verbs', () => {
  assert.equal(commandWritesWorkspace('sudo -g wheel touch src/app.js'), true)
  assert.equal(commandWritesWorkspace('xargs -L 1 touch src/app.js'), true)
  assert.equal(commandWritesWorkspace('git -c a=b checkout src/app.js'), true)
  assert.equal(commandWritesWorkspace('find src -okdir rm {} \\;'), true)
  assert.equal(commandWritesWorkspace('find docs -name x -print'), false)
  assert.equal(commandWritesWorkspace('cat src/app.js'), false)
})
