import { expect, test, type Page } from '@playwright/test'
import { bangkokInput, login, logout, shot, SHOTS_SPRINT_2 } from '../helpers'

// TEST-10-08 (AC-10-9, with the 375 px part of AC-10-8): A1 submits to a new
// milestone and the board shows it under Submitted; Supervisor 1 gives
// feedback and, after a reload, the board shows it under Feedback given.
// Each run creates its own milestone with a unique title in the seeded
// development database. Screenshots go to artifacts/sprint-2/screenshots/.

const column = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

async function openBoard(page: Page) {
  await page.goto('/teams')
  await page.getByRole('link', { name: 'Team Alpha' }).click()
  await page.getByRole('link', { name: 'Progress board' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Team Alpha' })).toBeVisible()
}

test('TEST-10-08: a submission shows under Submitted, feedback under Feedback given after a reload', async ({ page }) => {
  const title = `Board demo ${Date.now()}`

  // 1. Supervisor 1 creates the milestone; the board shows it under Not submitted.
  await login(page, 'supervisor1@coursepm.test')
  await page.getByRole('link', { name: 'Team Alpha' }).click()
  await page.getByRole('link', { name: 'New milestone' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Description').fill('Board journey milestone.')
  await page.getByLabel('Deadline (Bangkok time)').fill(bangkokInput(7))
  await page.getByRole('button', { name: 'Create milestone' }).click()
  await expect(page.getByRole('link', { name: title })).toBeVisible()
  await openBoard(page)
  await expect(column(page, 'Not submitted').getByRole('link', { name: title })).toBeVisible()
  await logout(page)

  // 2. A1 submits revision 1; the board shows the card under Submitted.
  await login(page, 'alpha1@coursepm.test')
  await page.getByRole('link', { name: 'Team Alpha' }).click()
  await page.getByRole('link', { name: title }).click()
  await page.getByLabel('Title').fill('Board demo draft')
  await page.getByLabel('Link to the work (http/https)').fill('https://github.com/example/board/pull/1')
  await page.getByRole('button', { name: /submit work/i }).click()
  await expect(page.getByRole('article', { name: 'Revision 1' })).toContainText('Board demo draft')
  await openBoard(page)
  const submittedCard = column(page, 'Submitted').getByRole('listitem').filter({ hasText: title })
  await expect(submittedCard).toBeVisible()
  await expect(submittedCard).toContainText('Revision 1 by Alpha Student 1')
  await expect(submittedCard).not.toContainText('Feedback given')
  await expect(column(page, 'Feedback given').getByRole('link', { name: title })).toHaveCount(0)
  await shot(page, '10-01-student-board-submitted', SHOTS_SPRINT_2)

  // The Submitted filter keeps ?state= in the URL and shows one column.
  await column(page, 'Submitted').getByRole('button', { name: 'Submitted' }).click()
  await expect(page).toHaveURL(/\?state=SUBMITTED$/)
  await expect(page.getByRole('region')).toHaveCount(1)
  await expect(column(page, 'Submitted').getByRole('link', { name: title })).toBeVisible()
  await page.getByRole('button', { name: 'Show all' }).click()
  await expect(page).not.toHaveURL(/state=/)
  await logout(page)

  // 3. Supervisor 1 gives feedback, then reloads the board.
  await login(page, 'supervisor1@coursepm.test')
  await openBoard(page)
  const boardUrl = page.url()
  await column(page, 'Submitted').getByRole('link', { name: title }).click()
  const rev1 = page.getByRole('article', { name: 'Revision 1' })
  await rev1.getByRole('textbox', { name: /feedback for revision 1/i }).fill('Good draft for the board journey.')
  await rev1.getByRole('button', { name: 'Save feedback' }).click()
  await expect(page.getByRole('article', { name: 'Revision 1' })).toContainText('Good draft for the board journey.')
  await page.goto(boardUrl)
  await page.reload()
  const reviewedCard = column(page, 'Feedback given').getByRole('listitem').filter({ hasText: title })
  await expect(reviewedCard).toBeVisible()
  await expect(reviewedCard).toContainText('Feedback given')
  await expect(column(page, 'Submitted').getByRole('link', { name: title })).toHaveCount(0)
  await shot(page, '10-02-supervisor-board-feedback-given', SHOTS_SPRINT_2)

  // 4. At 375 px the columns stack and the page has no horizontal scroll.
  await page.setViewportSize({ width: 375, height: 812 })
  await page.reload()
  await expect(column(page, 'Feedback given').getByRole('link', { name: title })).toBeVisible()
  const boxes = await page.getByRole('region').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left))
  expect(new Set(boxes.map((x) => Math.round(x))).size).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await shot(page, '10-03-board-phone-375', SHOTS_SPRINT_2)
})
