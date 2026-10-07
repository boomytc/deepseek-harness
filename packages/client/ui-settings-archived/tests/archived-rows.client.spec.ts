/**
 * The row source behind the Archived sessions page: which members of the
 * archive set become rows, the order they arrive in, and that an unrelated
 * list update re-publishes nothing.
 */
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createArchivedSessionsSource } from '../src/client/archived-rows.ts'

const sid = (id: string) => id as SessionId
const wid = (id: string) => id as WorkspaceId

const summary = (id: string, updatedAt: number, title = id): SessionSummary => ({
  id: sid(id), displayTitle: title, running: false, blank: false, updatedAt, retainedBy: {},
})

const workspace = (id: string, sessionIds: readonly string[], title = id): WorkspaceView => ({
  workspaceId: wid(id), path: `/projects/${id}`, title,
  sessionIds: sessionIds.map(sid), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})

const sessionState = (items: readonly SessionSummary[]): SessionListState => ({
  ids: items.map(item => item.id),
  byId: Object.fromEntries(items.map(item => [item.id, item])),
  phase: 'ready',
  projectionsBySession: {},
})

const workspaceState = (
  items: readonly WorkspaceView[],
  archivedSessionIds: readonly SessionId[],
  archivedAt: Readonly<Record<string, string>> = {},
): WorkspaceSnapshot => ({
  items, archivedSessionIds, archivedAt, pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
})

/** One ISO archive instant per day in September 2026. */
const instant = (day: number): string => new Date(Date.UTC(2026, 8, day)).toISOString()

function bench() {
  const sessions = createSnapshotStore<SessionListState>(sessionState([]))
  const workspaces = createSnapshotStore<WorkspaceSnapshot>(workspaceState([], []))
  const source = createArchivedSessionsSource(sessions, workspaces)
  return { sessions, workspaces, source }
}

describe('archived session rows', () => {
  it('lists the archive set newest update first, named by its Workspace, dated by its archive instant', () => {
    const { sessions, workspaces, source } = bench()
    sessions.set(sessionState([summary('a', 10, 'First'), summary('b', 30, 'Second'), summary('c', 20, 'Third')]))
    workspaces.set(workspaceState(
      [workspace('alpha', ['a', 'b'], 'Alpha'), workspace('beta', ['c'], 'Beta')],
      [sid('a'), sid('b'), sid('c')],
      { a: instant(1), b: instant(2), c: instant(3) },
    ))

    expect(source.hooks.rows.getSnapshot()).toEqual([
      { sessionId: sid('b'), title: 'Second', workspace: 'Alpha', updatedAt: 30, archivedAt: Date.UTC(2026, 8, 2) },
      { sessionId: sid('c'), title: 'Third', workspace: 'Beta', updatedAt: 20, archivedAt: Date.UTC(2026, 8, 3) },
      { sessionId: sid('a'), title: 'First', workspace: 'Alpha', updatedAt: 10, archivedAt: Date.UTC(2026, 8, 1) },
    ])
  })

  it('leaves a Session outside every Workspace without a Workspace title', () => {
    const { sessions, workspaces, source } = bench()
    sessions.set(sessionState([summary('orphan', 5)]))
    workspaces.set(workspaceState([], [sid('orphan')], { orphan: instant(4) }))

    expect(source.hooks.rows.getSnapshot()).toEqual([
      { sessionId: sid('orphan'), title: 'orphan', workspace: undefined, updatedAt: 5, archivedAt: Date.UTC(2026, 8, 4) },
    ])
  })

  it('keeps a set member whose archive instant has not arrived, without a date', () => {
    const { sessions, workspaces, source } = bench()
    sessions.set(sessionState([summary('a', 10)]))
    workspaces.set(workspaceState([], [sid('a')]))

    expect(source.hooks.rows.getSnapshot()).toEqual([
      { sessionId: sid('a'), title: 'a', workspace: undefined, updatedAt: 10, archivedAt: undefined },
    ])
  })

  it('skips an archive-set member the Session list has not delivered', () => {
    const { workspaces, source } = bench()
    workspaces.set(workspaceState([], [sid('unknown')]))
    expect(source.hooks.rows.getSnapshot()).toEqual([])
  })

  it('drops a row when the set loses the Session, and keeps identity across an unrelated update', () => {
    const { sessions, workspaces, source } = bench()
    sessions.set(sessionState([summary('a', 10), summary('b', 20)]))
    workspaces.set(workspaceState([], [sid('a'), sid('b')], { a: instant(1), b: instant(2) }))
    const settled = source.hooks.rows.getSnapshot()

    // A new Session arriving elsewhere changes neither row.
    sessions.set(sessionState([summary('a', 10), summary('b', 20), summary('c', 30)]))
    expect(source.hooks.rows.getSnapshot()).toBe(settled)

    workspaces.set(workspaceState([], [sid('b')], { b: instant(2) }))
    expect(source.hooks.rows.getSnapshot()).toEqual([
      { sessionId: sid('b'), title: 'b', workspace: undefined, updatedAt: 20, archivedAt: Date.UTC(2026, 8, 2) },
    ])
  })

  it('republishes when only the archive instant of a held Session changes', () => {
    const { sessions, workspaces, source } = bench()
    sessions.set(sessionState([summary('a', 10)]))
    workspaces.set(workspaceState([], [sid('a')], { a: instant(1) }))
    const stamped = source.hooks.rows.getSnapshot()

    workspaces.set(workspaceState([], [sid('a')], { a: instant(5) }))

    expect(source.hooks.rows.getSnapshot()).not.toBe(stamped)
    expect(source.hooks.rows.getSnapshot()).toEqual([
      { sessionId: sid('a'), title: 'a', workspace: undefined, updatedAt: 10, archivedAt: Date.UTC(2026, 8, 5) },
    ])
  })

  it('notifies subscribers per change and stops following once disposed', () => {
    const { sessions, workspaces, source } = bench()
    const listener = vi.fn()
    const unsubscribe = source.hooks.rows.subscribe(listener)
    sessions.set(sessionState([summary('a', 10)]))
    workspaces.set(workspaceState([], [sid('a')]))
    expect(listener).toHaveBeenCalledTimes(1)

    source.dispose()
    workspaces.set(workspaceState([], []))
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
