import { expect, test } from '@playwright/test'
import { seedPassword } from '../helpers'

// E2E-01 (AC-01-1, AC-01-2, AC-01-3, AC-01-4, AC-03-1) against the seeded
// development database (npm --prefix server run db:seed). Part F screenshots
// are added to this journey in #9.

test('E2E-01: wrong password, login, own team only, reload keeps the session, logout', async ({ page }) => {
  await page.goto('/teams')
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()

  await page.getByLabel('E-mail').fill('alpha1@coursepm.test')
  await page.getByLabel('Password').fill('definitely-wrong-1')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('alert')).toHaveText('E-mail or password is incorrect.')

  await page.getByLabel('Password').fill(seedPassword())
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'My teams' })).toBeVisible()
  // The top bar shows who is signed in (AC-01-3). The name also appears in the
  // member list, so the check is limited to the navigation bar.
  const topBar = page.getByRole('navigation').first()
  await expect(topBar.getByText('Alpha Student 1')).toBeVisible()
  await expect(topBar.locator('.badge', { hasText: 'Student' })).toBeVisible()

  // F-03 (AC-03-1): the seeded student sees only Team Alpha.
  await expect(page.getByRole('link', { name: 'Team Alpha' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Team Beta' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Team Alpha' }).click()
  await expect(page.getByRole('heading', { name: 'Team Alpha' })).toBeVisible()
  await expect(page.getByRole('listitem', { name: 'Alpha Student 2' })).toBeVisible()
  await page.getByRole('link', { name: 'My teams' }).first().click()

  await page.reload() // the session survives a reload (server-side session)
  await expect(topBar.getByText('Alpha Student 1')).toBeVisible()

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
  await page.goto('/teams')
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
})
