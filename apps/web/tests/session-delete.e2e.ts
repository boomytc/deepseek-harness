// Delete a stored Session from the Archived settings page. The retention window
// is overridden to zero for this scenario, so a Session archived from the
// sidebar row menu is deletable immediately; the flow then deletes it through
// the page and asserts the Host dropped both the log and every reference to it.
// This flow makes no model calls.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Browser, Locator, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  launchWebScaffold, seedSession, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, openSettings, saveFailureShot } from './support.ts'

// The seed is another scenario's committed fixture, reused read-only: this
// spec needs any one cold Session row, not new recorded content.
const SEED = fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.v3.jsonl', import.meta.url))
const SEED_ID = 'session-delete-web-e2e'
// A second, newer seeded Session takes the startup auto-selection, so the
// deletion target stays unopened: its row is the older one, and Session storage
// refuses to delete a Session any open handle still addresses.
const OPEN_ID = 'session-delete-web-e2e-open'

describe('web e2e: archived sessions are deleted from the settings page', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  /**
   * Expand the Ungrouped group when it renders collapsed so its rows are
   * addressable, then return the section holding them.
   * @returns the expanded Ungrouped section locator.
   */
  async function ungroupedSection(): Promise<Locator> {
    const header = page.getByText('Ungrouped', { exact: true })
    const groupRow = header.locator('..').locator('..')
    await expect.poll(async () => {
      if (await groupRow.count() === 0) return 'absent'
      if (await groupRow.getAttribute('aria-expanded') !== 'true') {
        await header.click()
        return 'collapsed'
      }
      return 'expanded'
    }, { timeout: 15_000 }).toBe('expanded')
    return groupRow.locator('..')
  }

  beforeAll(async () => {
    // Zero-day retention: the archived row is deletable the moment it is
    // archived, which is what makes this flow runnable without waiting a day.
    scaffold = await launchWebScaffold({ archivedRetentionDays: 0 })
    const seed = await readFile(SEED, 'utf8')
    // Two minutes apart, so the target is unambiguously the older row.
    await seedSession(scaffold, seed, SEED_ID, undefined, { createdAt: Date.now() - 120_000 })
    await seedSession(scaffold, seed, OPEN_ID, undefined, { createdAt: Date.now() - 60_000 })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('deletes the archived log and every reference to it once its window closed', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-session-delete'))
    const seededRows = (await ungroupedSection()).locator('[role="treeitem"]')
      .filter({ has: page.locator('button[aria-label^="Session actions for "]') })
    await expect.poll(() => seededRows.count(), { timeout: 10_000 }).toBe(2)
    // Newest first: the target is the older row, and archiving it from its row
    // menu leaves the newer Session — the one auto-selection opened — alone.
    const sessionRow = seededRows.nth(1)
    await sessionRow.hover()
    await sessionRow.getByRole('button', { name: /^Session actions for / }).click()
    await page.getByRole('menuitem', { name: 'Archive session' }).click()
    await expect.poll(
      () => [...scaffold.ctx.workspaceRegistry.archivedSessionIds],
      { timeout: 10_000 },
    ).toEqual([SessionId(SEED_ID)])
    expect((await scaffold.ctx.sessionPersistence.list()).map(snapshot => snapshot.header.id))
      .toContain(SessionId(SEED_ID))

    // The page lists the row with its archive instant, and its deletion is
    // available because this Host's window is zero days.
    await openSettings(page, 'en')
    await page.getByRole('button', { name: 'Archived', exact: true }).click()
    const row = page.getByRole('listitem')
    await expect.poll(() => row.count(), { timeout: 10_000 }).toBe(1)
    expect(await row.innerText()).toContain('Archived')
    const remove = row.getByRole('button', { name: 'Delete' })
    await expect.poll(async () => await remove.isEnabled(), { timeout: 10_000 }).toBe(true)

    // One press arms the control and names the confirming press; the second
    // one deletes the log on the Host.
    await remove.click()
    await expect.poll(
      () => row.getByRole('button', { name: 'Click again to confirm' }).count(),
      { timeout: 10_000 },
    ).toBe(1)
    await row.getByRole('button', { name: 'Click again to confirm' }).click()
    await expect.poll(() => row.count(), { timeout: 15_000 }).toBe(0)
    await expect.poll(
      () => [...scaffold.ctx.workspaceRegistry.archivedSessionIds],
      { timeout: 10_000 },
    ).toEqual([])

    // Durable on the Host: exactly the target is gone from persistence, not
    // merely hidden, so opening it again fails and a reload cannot bring it
    // back while the other Session stays.
    await expect.poll(
      async () => (await scaffold.ctx.sessionPersistence.list()).map(snapshot => snapshot.header.id),
      { timeout: 10_000 },
    ).not.toContain(SessionId(SEED_ID))
    expect((await scaffold.ctx.sessionPersistence.list()).map(snapshot => snapshot.header.id))
      .toContain(SessionId(OPEN_ID))
    await expect(scaffold.ctx.sessionPersistence.open(SessionId(SEED_ID), 'read'))
      .rejects.toThrow(/not found/)

    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await openSettings(page, 'en')
    await page.getByRole('button', { name: 'Archived', exact: true }).click()
    await expect.poll(() => page.getByText('No archived sessions').count(), { timeout: 15_000 }).toBe(1)
    expect(tripwire.pageErrors).toEqual([])
  }, 120_000)
})
