import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSkillFileReader } from '../../../plugins/skraft-framework/src/adapters/infrastructure/skill-file-reader.mjs'

const withPluginsRoot = async (skills, fn) => {
  const root = await mkdtemp(join(tmpdir(), 'skraft-skill-reader-'))
  try {
    for (const [name, content] of Object.entries(skills)) {
      await mkdir(join(root, 'skills', name), { recursive: true })
      await writeFile(join(root, 'skills', name, 'SKILL.md'), content, 'utf8')
    }
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('skill-file-reader: reads skills/<name>/SKILL.md as a UTF-8 string', () =>
  withPluginsRoot({ 'my-skill': '# Mÿ skill\nbody\n', a: 'single', '9lives': 'digit first' }, async (root) => {
    const reader = createSkillFileReader({ pluginsRoot: root })
    assert.equal(typeof reader.read, 'function')
    const content = await reader.read('my-skill')
    assert.equal(typeof content, 'string')
    assert.equal(content, '# Mÿ skill\nbody\n')
    assert.equal(await reader.read('a'), 'single')
    assert.equal(await reader.read('9lives'), 'digit first')
  }))

test('skill-file-reader: a well-formed but missing skill propagates ENOENT', () =>
  withPluginsRoot({}, async (root) => {
    const reader = createSkillFileReader({ pluginsRoot: root })
    await assert.rejects(reader.read('absent-skill'), { code: 'ENOENT' })
  }))

test('skill-file-reader: only reads the SKILL.md file of the skill directory', () =>
  withPluginsRoot({}, async (root) => {
    await mkdir(join(root, 'skills', 'other'), { recursive: true })
    await writeFile(join(root, 'skills', 'other', 'README.md'), 'not the skill')
    await writeFile(join(root, 'other'), 'top-level decoy')
    const reader = createSkillFileReader({ pluginsRoot: root })
    await assert.rejects(reader.read('other'), { code: 'ENOENT' })
  }))

test('skill-file-reader: rejects names that are not kebab-case before touching disk', () =>
  withPluginsRoot({ evil: 'x', 'good-name': 'y' }, async (root) => {
    const reader = createSkillFileReader({ pluginsRoot: root })
    const invalid = ['', '-leading', 'Upper', '_evil', '../evil', 'good-name/../evil', 'evil_', 'evil/',
      'with space', 'good-name\n']
    for (const name of invalid) {
      await assert.rejects(reader.read(name), (error) => {
        assert.equal(error.message, `Invalid skill name: ${name}`)
        assert.equal(error.code, undefined)
        return true
      }, JSON.stringify(name))
    }
  }))
