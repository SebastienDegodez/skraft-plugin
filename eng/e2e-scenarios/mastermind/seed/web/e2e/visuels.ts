import type { Page, TestInfo } from '@playwright/test'

/** The attachment the visuals reporter reads to list a screenshot in skraft-visuals/manifest.json. */
export const VISUEL = 'skraft-visual'

const nomDeFichier = (titre: string) =>
  titre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Takes a full-page screenshot under skraft-visuals/, one per theme, and tells the reporter its title. */
export const capturer = async (page: Page, testInfo: TestInfo, titre: string) => {
  const path = `skraft-visuals/${testInfo.project.name}-${nomDeFichier(titre)}.png`
  await page.screenshot({ path, fullPage: true })
  await testInfo.attach(VISUEL, { body: JSON.stringify({ title: titre, path }), contentType: 'application/json' })
}
