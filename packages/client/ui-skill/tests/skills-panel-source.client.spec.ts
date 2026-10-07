/**
 * The Skills page catalog source: which Session it follows, what each read
 * state publishes, and that a superseded or dropped read never leaves the page
 * describing a composition the Session left. The read itself is injected, so
 * this spec holds the source's own contract rather than the RPC.
 */
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import { createSkillsPanelSource } from '../src/client/skills-panel-source.ts'

const sid = (id: string) => id as SessionId

const CATALOG: readonly SkillEntry[] = [
  { name: 'commit-helper', description: 'Draft commit messages', modelInvocable: true },
]

/** Session list snapshot carrying the retained-by source the page follows. */
function listStore(entries: readonly { id: string; mainView?: boolean }[] = []) {
  const byId: Record<SessionId, SessionSummary> = {}
  for (const entry of entries) {
    const id = sid(entry.id)
    byId[id] = {
      id,
      displayTitle: entry.id,
      running: false,
      blank: false,
      updatedAt: 0,
      retainedBy: entry.mainView === true ? { mainView: 1 } : {},
    }
  }
  return createSnapshotStore<SessionListState>({
    ids: entries.map(entry => sid(entry.id)), byId, phase: 'ready', projectionsBySession: {},
  })
}

/** Source over a list and a replaceable read; `drop` fires the shared-read signal. */
function bench(entries: readonly { id: string; mainView?: boolean }[] = [], read?: (id: SessionId) => Promise<readonly SkillEntry[]>) {
  const list = listStore(entries)
  const listeners = new Set<(sessionId: SessionId) => void>()
  const source = createSkillsPanelSource({
    list,
    read: read ?? (() => Promise.resolve(CATALOG)),
    subscribeDropped: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  })
  return {
    list,
    source,
    drop: (id: SessionId) => { for (const listener of [...listeners]) listener(id) },
  }
}

/** Point the list at one main-view Session, replacing whatever it held. */
const select = (list: ReturnType<typeof listStore>, id: string): void => {
  const next = listStore([{ id, mainView: true }])
  list.set({ ...next.getSnapshot(), phase: 'ready' })
}

describe('Skills panel source', () => {
  it('publishes no-session and reads nothing without a main-view Session', () => {
    const read = vi.fn<(id: SessionId) => Promise<readonly SkillEntry[]>>(() => Promise.resolve(CATALOG))
    const { source } = bench([{ id: 'other' }], read)
    expect(source.hooks.catalog.getSnapshot()).toEqual({ sessionId: undefined, status: 'no-session', skills: [] })
    expect(read).not.toHaveBeenCalled()
  })

  it('reads the main-view Session and publishes its settled catalog', async () => {
    const read = vi.fn<(id: SessionId) => Promise<readonly SkillEntry[]>>(() => Promise.resolve(CATALOG))
    const { source } = bench([{ id: 'idle' }, { id: 'main', mainView: true }], read)
    expect(read).toHaveBeenCalledExactlyOnceWith(sid('main'))
    // The state before settlement is a read in flight, not the previous list.
    expect(source.hooks.catalog.getSnapshot()).toEqual({ sessionId: sid('main'), status: 'loading', skills: [] })
    await vi.waitFor(() => {
      expect(source.hooks.catalog.getSnapshot().status).toBe('ready')
    })
    expect(source.hooks.catalog.getSnapshot()).toEqual({ sessionId: sid('main'), status: 'ready', skills: CATALOG })
  })

  it('notifies subscribers once per published state and keeps one identity between them', async () => {
    const { source } = bench([{ id: 'main', mainView: true }])
    const listener = vi.fn()
    const unsubscribe = source.hooks.catalog.subscribe(listener)
    const settled = source.hooks.catalog.getSnapshot()
    expect(source.hooks.catalog.getSnapshot()).toBe(settled)
    source.hooks.catalog.getSnapshot()
    expect(listener).not.toHaveBeenCalled()
    await vi.waitFor(() => { expect(source.hooks.catalog.getSnapshot().status).toBe('ready') })
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    source.retry()
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reports a failed read and retries it on demand', async () => {
    const read = vi.fn<(id: SessionId) => Promise<readonly SkillEntry[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(CATALOG)
    const { source } = bench([{ id: 'main', mainView: true }], read)
    await vi.waitFor(() => { expect(source.hooks.catalog.getSnapshot().status).toBe('error') })
    expect(source.hooks.catalog.getSnapshot().skills).toEqual([])
    source.retry()
    await vi.waitFor(() => { expect(source.hooks.catalog.getSnapshot().status).toBe('ready') })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('retries nothing while no Session is open', () => {
    const read = vi.fn<(id: SessionId) => Promise<readonly SkillEntry[]>>(() => Promise.resolve(CATALOG))
    const { source } = bench([], read)
    source.retry()
    expect(read).not.toHaveBeenCalled()
    expect(source.hooks.catalog.getSnapshot().status).toBe('no-session')
  })

  it('follows the main-view Session and never publishes a superseded read', async () => {
    const first = Promise.withResolvers<readonly SkillEntry[]>()
    const second = Promise.withResolvers<readonly SkillEntry[]>()
    const read = vi.fn<(id: SessionId) => Promise<readonly SkillEntry[]>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValue(CATALOG)
    const { list, source } = bench([{ id: 'first', mainView: true }], read)
    select(list, 'second')
    expect(source.hooks.catalog.getSnapshot()).toEqual({ sessionId: sid('second'), status: 'loading', skills: [] })
    // The Session the page left settles last: its list must not come back.
    second.resolve(CATALOG)
    await vi.waitFor(() => { expect(source.hooks.catalog.getSnapshot().status).toBe('ready') })
    first.resolve([{ name: 'stale', description: 'stale', modelInvocable: true }])
    await Promise.resolve()
    expect(source.hooks.catalog.getSnapshot().skills).toEqual(CATALOG)
    // Returning to the first Session reads it again rather than reusing the
    // superseded answer.
    select(list, 'first')
    expect(source.hooks.catalog.getSnapshot().status).toBe('loading')
    expect(read).toHaveBeenCalledTimes(3)
    expect(read).toHaveBeenNthCalledWith(3, sid('first'))
  })

  it('drops the list back to no-session when the main-view Session is released', async () => {
    const { list, source } = bench([{ id: 'main', mainView: true }])
    await vi.waitFor(() => { expect(source.hooks.catalog.getSnapshot().status).toBe('ready') })
    list.set({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
    expect(source.hooks.catalog.getSnapshot()).toEqual({ sessionId: undefined, status: 'no-session', skills: [] })
  })

  it('re-reads a dropped shared read for the followed Session only', async () => {
    const read = vi.fn<(id: SessionId) => Promise<readonly SkillEntry[]>>(() => Promise.resolve(CATALOG))
    const { source, drop } = bench([{ id: 'main', mainView: true }], read)
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(1) })
    drop(sid('elsewhere'))
    expect(read).toHaveBeenCalledTimes(1)
    // A preset switch drops this Session's key: the settled list belongs to a
    // composition the Session left.
    drop(sid('main'))
    expect(read).toHaveBeenCalledTimes(2)
    expect(source.hooks.catalog.getSnapshot().status).toBe('loading')
  })

  it('stops following and notifying once disposed', async () => {
    const read = vi.fn<(id: SessionId) => Promise<readonly SkillEntry[]>>(() => Promise.resolve(CATALOG))
    const { list, source, drop } = bench([{ id: 'main', mainView: true }], read)
    const listener = vi.fn()
    source.hooks.catalog.subscribe(listener)
    source.dispose()
    const settled = source.hooks.catalog.getSnapshot()
    select(list, 'other')
    drop(sid('main'))
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(1) })
    expect(source.hooks.catalog.getSnapshot()).toBe(settled)
    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores a read that settles after disposal', async () => {
    const pending = Promise.withResolvers<readonly SkillEntry[]>()
    const { source } = bench([{ id: 'main', mainView: true }], () => pending.promise)
    const settling = source.hooks.catalog.getSnapshot()
    source.dispose()
    pending.resolve(CATALOG)
    await Promise.resolve()
    expect(source.hooks.catalog.getSnapshot()).toBe(settling)
  })
})
