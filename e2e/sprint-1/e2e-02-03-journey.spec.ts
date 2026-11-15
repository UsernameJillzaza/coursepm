import { expect, test } from '@playwright/test'
import { bangkokInput, login, logout, shot } from '../helpers'

// E2E-02 (AC-04-1, AC-05-1, AC-05-7, AC-06-1, AC-06-4): the complete Sprint 1
// journey through UI → API → database, then retrieval of the saved result
// after a reload. Rule rejections along the way are Part F evidence (04–08).
// E2E-03 (AC-03-5, AC-04-7): a student sees no New milestone control and
// cannot open another team's page by URL (09).
// Each run uses a unique milestone title because it writes to the seeded
// development database.

test('E2E-02: milestone → submission (rejected link, revision 1, revision 2, limit) → feedback → persisted result', async ({ page }) => {
  const title = `Design review ${Date.now()}`

  // 1. Supervisor 1 creates a milestone for Team Alpha; a past deadline is rejected first.
  await login(page, 'supervisor1@coursepm.test')
  await page.getByRole('link', { name: 'Team Alpha' }).click()
  await page.getByRole('link', { name: 'New milestone' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Description').fill('Upload the design document for review.')
  await page.getByLabel(/deadline/i).fill('2020-01-01T10:00')
  await page.getByRole('button', { name: 'Create milestone' }).click()
  await expect(page.locator('.invalid-feedback').filter({ hasText: /deadline/i })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue(title)
  await shot(page, '04-milestone-past-deadline-rejected')

  await page.getByLabel(/deadline/i).fill(bangkokInput(7))
  await page.getByLabel(/revision limit/i).fill('2')
  await page.getByRole('button', { name: 'Create milestone' }).click()
  await expect(page.getByRole('heading', { name: 'Team Alpha' })).toBeVisible()
  await expect(page.getByRole('link', { name: title })).toBeVisible()
  await logout(page)

  // 2. Student A1 opens it, a javascript: link is rejected, then submits and resubmits to the limit.
  await login(page, 'alpha1@coursepm.test')
  await page.getByRole('link', { name: 'Team Alpha' }).click()
  await expect(page.getByRole('link', { name: 'New milestone' })).toHaveCount(0)
  await page.getByRole('link', { name: title }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  await page.getByLabel('Title').fill('Design doc draft')
  await page.getByLabel(/link/i).fill('javascript:alert(1)')
  await page.getByRole('button', { name: /submit work/i }).click()
  await expect(page.locator('.invalid-feedback').filter({ hasText: /link/i })).toBeVisible()
  await expect(page.getByLabel(/link/i)).toHaveValue('javascript:alert(1)')
  await shot(page, '05-submission-link-rejected')

  await page.getByLabel(/link/i).fill('https://github.com/example/design/pull/1')
  await page.getByRole('button', { name: /submit work/i }).click()
  await expect(page.getByRole('article', { name: 'Revision 1' })).toContainText('Design doc draft')
  await expect(page.getByText(/Revisions used: 1 \/ 2/)).toBeVisible()

  await page.getByLabel('Title').fill('Design doc final')
  await page.getByLabel(/link/i).fill('https://github.com/example/design/pull/2')
  await page.getByRole('button', { name: /submit work/i }).click()
  await expect(page.getByRole('article', { name: 'Revision 2' })).toContainText('Design doc final')
  await expect(page.getByText('All 2 revisions used.')).toBeVisible()
  await expect(page.getByRole('button', { name: /submit work/i })).toHaveCount(0)
  await shot(page, '06-revision-limit-reached')
  const milestoneUrl = page.url()
  await logout(page)

  // 3. Supervisor 1 records feedback on revision 1.
  await login(page, 'supervisor1@coursepm.test')
  await page.goto(milestoneUrl)
  const rev1 = page.getByRole('article', { name: 'Revision 1' })
  await rev1.getByRole('textbox', { name: /feedback for revision 1/i }).fill('Good draft. Add the sequence diagram for login.')
  await rev1.getByRole('button', { name: 'Save feedback' }).click()
  await expect(rev1).toContainText('Good draft. Add the sequence diagram for login.')
  await shot(page, '07-supervisor-feedback-saved')
  await logout(page)

  // 4. Student A2 retrieves the persisted result after a reload: both revisions,
  //    newest first, feedback still on revision 1, none on revision 2, no form.
  await login(page, 'alpha2@coursepm.test')
  await page.goto(milestoneUrl)
  await page.reload()
  const cards = page.getByRole('article')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toHaveAccessibleName('Revision 2')
  await expect(page.getByRole('article', { name: 'Revision 2' })).toContainText('No feedback yet')
  await expect(page.getByRole('article', { name: 'Revision 1' })).toContainText('Good draft. Add the sequence diagram for login.')
  await expect(page.getByRole('button', { name: 'Save feedback' })).toHaveCount(0)
  await shot(page, '08-student-sees-persisted-result')
})

test('E2E-03: no New milestone control for a student; another team\'s page by URL shows "Team not found"', async ({ page }) => {
  await login(page, 'supervisor2@coursepm.test')
  const betaHref = await page.getByRole('link', { name: 'Team Beta' }).getAttribute('href')
  await logout(page)

  await login(page, 'alpha1@coursepm.test')
  await page.getByRole('link', { name: 'Team Alpha' }).click()
  await expect(page.getByRole('heading', { name: 'Team Alpha' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'New milestone' })).toHaveCount(0) // AC-04-7

  await page.goto(betaHref!)
  await expect(page.getByRole('heading', { name: 'Team not found' })).toBeVisible() // AC-03-5
  await expect(page.getByText('Beta Student 1')).toHaveCount(0)
  await shot(page, '09-other-team-not-found')
})
