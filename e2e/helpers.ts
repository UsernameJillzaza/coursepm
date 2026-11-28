import { expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

// The demo password is read from server/.env (SEED_PASSWORD), so it is never
// written in the repository.
export function seedPassword(): string {
  const env = fs.readFileSync(path.join(__dirname, '..', 'server', '.env'), 'utf8')
  const match = env.match(/^SEED_PASSWORD=(.+)$/m)
  if (!match) throw new Error('SEED_PASSWORD missing from server/.env')
  return match[1].trim().replace(/^"|"$/g, '')
}

// Part F evidence: full-page screenshots under artifacts/sprint-1/screenshots/.
// It first waits until no loading spinner is shown, so a screenshot never
// catches a list in the middle of a reload.
export const SHOTS = path.join(__dirname, '..', 'artifacts', 'sprint-1', 'screenshots')
// Sprint 2 journeys pass this directory, so Sprint 1 evidence is never overwritten.
export const SHOTS_SPRINT_2 = path.join(__dirname, '..', 'artifacts', 'sprint-2', 'screenshots')
export async function shot(page: Page, name: string, dir: string = SHOTS) {
  await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0)
  return page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
}

export async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Password').fill(seedPassword())
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'My teams' })).toBeVisible()
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
}

// The milestone form reads its deadline as Bangkok time (UTC+7, no DST).
export function bangkokInput(daysFromNow: number): string {
  const t = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000)
  return t.toISOString().slice(0, 16)
}
