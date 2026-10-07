/**
 * Wiring: one apply registers the dictionaries and the Archived sessions
 * section, whose injected face projects the archive set and routes both row
 * actions through the navigation service. The section defers until the
 * settings shell declares its list, and leaves with the plugin's fiber.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { resolveSlotLabel, type StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.ts'
import { ArchivedSessionsSection } from '../src/client/ArchivedSessionsSection.tsx'
import type { ArchivedSessionsSectionInjected } from '../src/client/ArchivedSessionsSection.tsx'
import { apply as hostApply } from '../src/index.ts'

const sid = (id: string) => id as SessionId

const summary = (id: string, updatedAt: number): SessionSummary => ({
  id: sid(id), displayTitle: id, running: false, blank: false, updatedAt, retainedBy: {},
})

const sessionState = (items: readonly SessionSummary[]): SessionListState => ({
  ids: items.map(item => item.id),
  byId: Object.fromEntries(items.map(item => [item.id, item])),
  phase: 'ready',
  projectionsBySession: {},
})

const workspaceSnapshot = (archivedSessionIds: readonly SessionId[]): WorkspaceSnapshot => ({
  items: [], archivedSessionIds, archivedAt: {}, archivedDeletionAt: {}, pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
})

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  // These specs assert the shipped Chinese copy. There is no jsdom `window`
  // in this lane, so browser-language detection never runs and the locale
  // comes from FALLBACK_LOCALE (en): state the asserted locale explicitly.
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const sessions = createSnapshotStore<SessionListState>(sessionState([]))
  const workspaces = createSnapshotStore<WorkspaceSnapshot>(workspaceSnapshot([]))
  ctx.provide('sessions', { list: sessions } as never)
  ctx.provide('workspaces', { list: workspaces } as never)
  const openSession = vi.fn()
  const unarchiveSession = vi.fn(async () => {})
  const deleteArchivedSession = vi.fn(async () => {})
  const deleteExpiredArchivedSessions = vi.fn(async () => {})
  ctx.provide('uiWorkspace', {
    openSession,
    unarchiveSession,
    deleteArchivedSession,
    deleteExpiredArchivedSessions,
  } as never)
  return {
    ctx, locale, sessions, workspaces, openSession, unarchiveSession,
    deleteArchivedSession, deleteExpiredArchivedSessions,
  }
}

/** Declare the Settings section list the page registers into. */
function declareSettings(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

/** An entry's injected face; the shipped factories take no arguments. */
function faceOf(registration: StoredEntry): object {
  if (registration.inject === undefined) throw new Error(`entry ${String(registration.options.id)} declares no inject face`)
  return registration.inject()
}

describe('ui-settings-archived apply', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares the services it drives', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace'])
  })

  it('registers the section with its label, and drops it with the fiber', async () => {
    const b = await bench()
    declareSettings(b.ctx.get('slots') as SlotRegistry)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const slots = b.ctx.get('slots') as SlotRegistry
    const entry = slots.entries('settings.section')[0]!
    expect(entry.component).toBe(ArchivedSessionsSection)
    expect(entry.options).toMatchObject({ id: 'archived-sessions', order: 5 })
    expect(entry.locale).toBe('settings.archived')
    expect(resolveSlotLabel(entry.options.label)).toBe('已归档')

    await fiber.dispose()
    expect(slots.entries('settings.section')).toHaveLength(0)
  })

  it('registers both dictionaries under its own namespace', async () => {
    const b = await bench()
    declareSettings(b.ctx.get('slots') as SlotRegistry)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.locale.bind('settings.archived')('nav')).toBe('已归档')
    expect(b.locale.bind('settings.archived')('date.locale')).toBe('zh-CN')
    b.locale.setLocale('en')
    expect(b.locale.bind('settings.archived')('nav')).toBe('Archived')
  })

  it('projects the archive set and routes every row action through navigation', async () => {
    const b = await bench()
    declareSettings(b.ctx.get('slots') as SlotRegistry)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = (b.ctx.get('slots') as SlotRegistry).entries('settings.section')[0]!
    const face = faceOf(entry) as ArchivedSessionsSectionInjected

    expect(face.hooks.rows.getSnapshot()).toEqual([])
    b.sessions.set(sessionState([summary('gone', 7)]))
    b.workspaces.set(workspaceSnapshot([sid('gone')]))
    expect(face.hooks.rows.getSnapshot()).toEqual([
      {
        sessionId: sid('gone'),
        title: 'gone',
        workspace: undefined,
        updatedAt: 7,
        archivedAt: undefined,
        eligibleAt: undefined,
      },
    ])

    face.openSession(sid('gone'))
    expect(b.openSession).toHaveBeenCalledExactlyOnceWith(sid('gone'))
    await face.restoreSession(sid('gone'))
    expect(b.unarchiveSession).toHaveBeenCalledExactlyOnceWith(sid('gone'))
    await face.deleteSession(sid('gone'))
    expect(b.deleteArchivedSession).toHaveBeenCalledExactlyOnceWith(sid('gone'))
    await face.deleteExpiredSessions()
    expect(b.deleteExpiredArchivedSessions).toHaveBeenCalledOnce()
  })
})
