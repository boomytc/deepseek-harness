/**
 * Archive-retention arithmetic: the instant a window closes, and the guard
 * that keeps an unprovable age from costing a Session.
 */
import { describe, expect, it } from 'vitest'
import { deletionDue, deletionEligibleAt } from '../src/retention.ts'

/** One archive instant, fixed so no assertion depends on the clock. */
const ARCHIVED_AT = '2026-09-02T00:00:00.000Z'
const ARCHIVED_MS = Date.UTC(2026, 8, 2)

describe('archive retention arithmetic', () => {
  it('closes the window a whole number of days after the archive instant', () => {
    expect(deletionEligibleAt(ARCHIVED_AT, 0)).toBe(ARCHIVED_MS)
    expect(deletionEligibleAt(ARCHIVED_AT, 3)).toBe(ARCHIVED_MS + 3 * 24 * 60 * 60 * 1000)
  })

  it('reports an unreadable archive instant as an instant nothing is due at', () => {
    expect(deletionEligibleAt('not a timestamp', 3)).toBeNaN()
    expect(deletionDue('not a timestamp', 3, Date.now())).toBe(false)
  })

  it('is due exactly at the closing instant and not before it', () => {
    const closes = deletionEligibleAt(ARCHIVED_AT, 3)
    expect(deletionDue(ARCHIVED_AT, 3, closes - 1)).toBe(false)
    expect(deletionDue(ARCHIVED_AT, 3, closes)).toBe(true)
    expect(deletionDue(ARCHIVED_AT, 3, closes + 1)).toBe(true)
  })

  it('never makes an archived Session with no recorded instant due', () => {
    expect(deletionDue(undefined, 0, Date.now())).toBe(false)
  })
})
