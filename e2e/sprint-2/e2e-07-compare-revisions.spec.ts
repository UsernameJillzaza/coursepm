import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { bangkokInput, login, logout } from '../helpers'

// TEST-07-08 (AC-07-1, AC-07-8): F-07 through UI → API → database. A1
// submits revision 1, Supervisor 1 gives feedback on it, A1 submits revision 2
// (this order also satisfies CHG-01's feedback-before-resubmission rule), then
// compares them, and the comparison survives a reload. The milestone title is
// unique, because the run writes to the database the dev server uses.

const SHOTS = path.join(__dirname, '..', '..', 'artifacts', 'sprint-2', 'screenshots')
async function shot(page: Page, name: string) {
  await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0)
  return page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

test('TEST-07-08: submit → feedback → submit, then compare revisions 1 and 2 and reload', async ({ page }) => {
  const title = `Compare SRS ${Date.now()}`

  // Supervisor 1 creates the milestone for Team Alpha.
  await login(page, 'supervisor1@coursepm.test')
  await page.getByRole('link', { name: 'Team Alpha' }).click()
  await page.getByRole('link', { name: 'New milestone' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Deadline (Bangkok time)').fill(bangkokInput(7))
  await page.getByLabel('Revision limit').fill('3')
  await page.getByRole('button', { name: 'Create milestone' }).click()
  await expect(page.getByRole('link', { name: title })).toBeVisible()
  await logout(page)

  // A1 submits revision 1.
  await login(page, 'alpha1@coursepm.test')
  await page.getByRole('link', { name: 'Team Alpha' }).click()
  await page.getByRole('link', { name: title }).click()
  await page.getByLabel('Title').fill('SRS')
  await page.getByLabel('Description').fill('Draft of the SRS')
  await page.getByLabel('Link to the work (http/https)').fill('https://example.com/srs/v1')
  await page.getByRole('button', { name: /submit work/i }).click()
  await expect(page.getByRole('article', { name: 'Revision 1' })).toContainText('Draft of the SRS')
  const milestoneUrl = page.url()
  await logout(page)

  // Supervisor 1 gives feedback on revision 1.
  await login(page, 'supervisor1@coursepm.test')
  await page.goto(milestoneUrl)
  const rev1 = page.getByRole('article', { name: 'Revision 1' })
  await rev1.getByRole('textbox', { name: /feedback for revision 1/i }).fill('Add the use cases.')
  await rev1.getByRole('button', { name: 'Save feedback' }).click()
  await expect(page.getByRole('article', { name: 'Revision 1' })).toContainText('Add the use cases.')
  await logout(page)

  // A1 submits revision 2 with a different description.
  await login(page, 'alpha1@coursepm.test')
  await page.goto(milestoneUrl)
  await page.getByLabel('Title').fill('SRS')
  await page.getByLabel('Description').fill('Final draft of the SRS v2')
  await page.getByLabel('Link to the work (http/https)').fill('https://example.com/srs/v2')
  await page.getByRole('button', { name: /submit work/i }).click()
  await expect(page.getByRole('article', { name: 'Revision 2' })).toContainText('Final draft of the SRS v2')

  // Compare revisions: check 2 then 1, press Compare.
  await page.getByRole('link', { name: 'Compare revisions' }).click()
  await expect(page.getByRole('heading', { name: `Compare revisions: ${title}` })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Select revision 2' }).check()
  await page.getByRole('checkbox', { name: 'Select revision 1' }).check()
  await page.getByRole('button', { name: 'Compare' }).click()

  const checkComparison = async () => {
    const panel = page.getByRole('region', { name: 'Comparison' })
    const sides = panel.getByRole('article')
    await expect(sides.first()).toHaveAccessibleName('Revision 1 (older)')
    await expect(sides.nth(1)).toHaveAccessibleName('Revision 2 (newer)')
    await expect(sides.first()).toContainText('Add the use cases.')
    await expect(sides.nth(1)).toContainText('No feedback yet')
    await expect(panel.getByTestId('badge-description')).toHaveText('Changed')
    await expect(panel.getByTestId('badge-title')).toHaveText('Unchanged')
    await expect(sides.first().locator('del')).toHaveText(['Draft'])
    await expect(sides.nth(1).locator('ins').first()).toHaveText('Final draft')
  }
  await checkComparison()
  await expect(page).toHaveURL(/\/revisions\?a=1&b=2$/)
  await shot(page, 'S2-07-compare-revisions')

  // A reload loads the comparison again from the database.
  await page.reload()
  await checkComparison()
  await expect(page).toHaveURL(/\/revisions\?a=1&b=2$/)
  await shot(page, 'S2-07-compare-after-reload')

  // At phone width the columns stack and the page has no horizontal scroll.
  await page.setViewportSize({ width: 375, height: 812 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await shot(page, 'S2-07-compare-375px')
})
