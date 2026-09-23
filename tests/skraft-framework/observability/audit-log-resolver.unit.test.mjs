// Unit — where the audit log lives: SKRAFT_AUDIT_LOG, else the git directory of the
// project the hook runs in (found from any subdirectory, through a worktree's .git file),
// else the plugin's logs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAuditLogPath } from '../../../plugins/skraft-framework/src/adapters/infrastructure/audit-log-resolver.mjs'

const PLUGIN = '/plugins/skraft-framework'
const AUDIT = join('skraft', 'skill-audit.jsonl')

const inTemp = (fn) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'skraft-audit-path-')))
  try { fn(root) } finally { rmSync(root, { recursive: true, force: true }) }
}

test('SKRAFT_AUDIT_LOG wins over any repository', () => {
  inTemp((root) => {
    mkdirSync(join(root, '.git'))
    assert.equal(resolveAuditLogPath({ env: { SKRAFT_AUDIT_LOG: '/logs/audit.jsonl' }, cwd: root, pluginRoot: PLUGIN }), '/logs/audit.jsonl')
  })
})

test('a .git directory above the working directory holds the log', () => {
  inTemp((root) => {
    mkdirSync(join(root, '.git'))
    mkdirSync(join(root, 'src', 'Orders'), { recursive: true })
    assert.equal(resolveAuditLogPath({ env: {}, cwd: join(root, 'src', 'Orders'), pluginRoot: PLUGIN }), join(root, '.git', AUDIT))
    assert.equal(resolveAuditLogPath({ env: {}, cwd: root, pluginRoot: PLUGIN }), join(root, '.git', AUDIT))
  })
})

test('a worktree .git file points at the git directory, absolute or relative to the file, newline or not', () => {
  inTemp((root) => {
    const absolute = join(root, 'absolute')
    mkdirSync(absolute)
    writeFileSync(join(absolute, '.git'), `gitdir: ${join(root, 'main.git', 'worktrees', 'absolute')}`)
    assert.equal(resolveAuditLogPath({ env: {}, cwd: absolute, pluginRoot: PLUGIN }), join(root, 'main.git', 'worktrees', 'absolute', AUDIT))

    const relative = join(root, 'relative')
    mkdirSync(join(relative, 'src'), { recursive: true })
    writeFileSync(join(relative, '.git'), 'gitdir: ../main.git/worktrees/relative\n')
    assert.equal(resolveAuditLogPath({ env: {}, cwd: join(relative, 'src'), pluginRoot: PLUGIN }), join(root, 'main.git', 'worktrees', 'relative', AUDIT))
  })
})

test('a .git file that names no git directory is passed over', () => {
  inTemp((root) => {
    mkdirSync(join(root, '.git'))
    mkdirSync(join(root, 'vendor'))
    writeFileSync(join(root, 'vendor', '.git'), 'not a pointer\n')
    assert.equal(resolveAuditLogPath({ env: {}, cwd: join(root, 'vendor'), pluginRoot: PLUGIN }), join(root, '.git', AUDIT))
  })
})

test('outside any repository the plugin keeps the log', () => {
  inTemp((root) => {
    assert.equal(resolveAuditLogPath({ env: {}, cwd: root, pluginRoot: PLUGIN }), join(PLUGIN, 'logs', 'skill-audit.jsonl'))
  })
})
