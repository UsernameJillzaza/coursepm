import { expect, test, type Page } from '@playwright/test'
import { bangkokInput, login, logout, shot, SHOTS_SPRINT_2 } from '../helpers'

// TEST-08-15 (AC-08-1, AC-08-5, AC-08-8): Supervisor 1 edits, then extends a
// demo milestone and closes another one; Student A1 sees "extended from …",
// the Extended and Closed early badges and the history. Each run creates its
// own milestones with unique titles in the seeded development database.
// Screenshots go to artifacts/sprint-2/screenshots/.

async function createMilestone(page: Page, title: string) {
  await page.getByRole('link', { name: 'Team Alpha' }).click()
  await page.getByRole('link', { name: 'New milestone' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Description').fill('First version of the brief.')
  await page.getByLabel('Deadline (Bangkok time)').fill(bangkokInput(7))
  await page.getByRole('button', { name: 'Create milestone' }).click()
  await expect(page.getByRole('link', { name: title })).toBeVisible()
}

test('TEST-08-15: edit → extension → close as Supervisor 1; A1 sees the badges, extended deadline and history', async ({ page }) => {
  const stamp = Date.now()
  const extendedTitle = `Maintenance demo ${stamp}`
  const closedTitle = `Closed demo ${stamp}`

  // 1. Supervisor 1 creates two milestones for Team Alpha.
  await login(page, 'supervisor1@coursepm.test')
  await createMilestone(page, extendedTitle)
  await page.goto('/teams')
  await createMilestone(page, closedTitle)

  // 2. Edit the first one inside the edit window (description + deadline).
  await page.getByRole('link', { name: extendedTitle }).click()
  await expect(page.getByRole('heading', { name: extendedTitle })).toBeVisible()
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Description').fill('Clarified brief: include the test plan.')
  await page.getByLabel('Deadline (Bangkok time)').fill(bangkokInput(8))
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Clarified brief: include the test plan.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'History' }).getByRole('listitem')).toHaveCount(2)
  await shot(page, '08-01-supervisor-edit-saved', SHOTS_SPRINT_2)

  // 3. Grant an extension; Edit is then no longer offered.
  await page.getByRole('button', { name: 'Grant extension' }).click()
  await page.getByLabel('New deadline (Bangkok time)').fill(bangkokInput(10))
  await page.getByLabel('Reason').fill('Lab server outage')
  await page.getByRole('button', { name: 'Save extension' }).click()
  await expect(page.getByText(/^Deadline .+ \(extended from .+\)$/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)
  await shot(page, '08-02-supervisor-extension-granted', SHOTS_SPRINT_2)

  // 4. Close the second one early; Cancel first sends nothing.
  await page.goto('/teams')
  await page.getByRole('link', { name: 'Team Alpha' }).click()
  await page.getByRole('link', { name: closedTitle }).click()
  await page.getByRole('button', { name: 'Close milestone' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close milestone' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Students can no longer submit to this milestone. This cannot be undone.')
  await dialog.getByLabel('Reason (optional)').fill('Merged into the design review')
  await dialog.getByRole('button', { name: 'Close milestone' }).click()
  await expect(page.getByText(/^Closed early by Dr\. Supervisor One on /)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Grant extension' })).toHaveCount(0)
  await shot(page, '08-03-supervisor-closed-early', SHOTS_SPRINT_2)
  await logout(page)

  // 5. A1 sees the badges in the team list, then each milestone header and history.
  await login(page, 'alpha1@coursepm.test')
  await page.getByRole('link', { name: 'Team Alpha' }).click()
  const extendedItem = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: extendedTitle }) })
  const closedItem = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: closedTitle }) })
  await expect(extendedItem.getByText('Extended', { exact: true })).toBeVisible()
  await expect(closedItem.getByText('Closed early', { exact: true })).toBeVisible()
  await shot(page, '08-04-student-team-list-badges', SHOTS_SPRINT_2)

  await page.getByRole('link', { name: extendedTitle }).click()
  await expect(page.getByText(/^Deadline .+ \(extended from .+\)$/)).toBeVisible()
  const history = page.getByRole('region', { name: 'History' })
  await expect(history.getByRole('listitem')).toHaveCount(3) // EXTENSION + 2 EDIT
  await expect(history).toContainText('Lab server outage')
  for (const name of ['Edit', 'Grant extension', 'Close milestone']) await expect(page.getByRole('button', { name })).toHaveCount(0)
  await shot(page, '08-05-student-extended-history', SHOTS_SPRINT_2)

  await page.goBack()
  await page.getByRole('link', { name: closedTitle }).click()
  await expect(page.getByText(/^Closed early by Dr\. Supervisor One on /)).toBeVisible()
  await expect(page.getByText('This milestone has been closed by the supervisor. Submissions are closed.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'History' })).toContainText('Merged into the design review')
  await shot(page, '08-06-student-closed-early', SHOTS_SPRINT_2)
})
