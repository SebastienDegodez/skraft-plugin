import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import { VISUEL } from './visuels'

type Screenshot = { title: string; theme: string; path: string }

/**
 * Writes skraft-visuals/manifest.json once the run ends: the screenshots of the passed tests, each
 * with the theme of the Playwright project (light or dark) that took it.
 */
export default class VisualsReporter implements Reporter {
  private readonly screenshots: Screenshot[] = []

  onBegin() {
    rmSync('skraft-visuals', { recursive: true, force: true })
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status !== 'passed') return
    const theme = test.parent.project()?.name ?? ''
    for (const attachment of result.attachments.filter(({ name, body }) => name === VISUEL && body !== undefined)) {
      const { title, path } = JSON.parse(String(attachment.body)) as { title: string; path: string }
      this.screenshots.push({ title, theme, path })
    }
  }

  onEnd() {
    mkdirSync('skraft-visuals', { recursive: true })
    writeFileSync('skraft-visuals/manifest.json', `${JSON.stringify({ screenshots: this.screenshots }, null, 2)}\n`)
  }
}
