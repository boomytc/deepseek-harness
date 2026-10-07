// @vitest-environment jsdom
/**
 * The Archived sessions page: the empty state, one row per archived Session,
 * and what each row's actions do — Open leaves Settings for that
 * conversation, Restore drops the Session from the set and reports a refusal
 * in place, and Delete waits for its confirming press, stays unavailable
 * until the retention window closes, and reports a Host refusal where it was
 * raised.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  ArchivedSessionsSection, type ArchivedSessionsSectionProps,
} from '../src/client/ArchivedSessionsSection.tsx'
import type { ArchivedSessionRow } from '../src/client/archived-rows.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const sid = (id: string) => id as SessionId

/** An instant far enough in the past that its retention window has closed. */
const DUE = Date.UTC(2020, 0, 1)

/** An instant far enough in the future that its window has not opened. */
const LOCKED = Date.UTC(2999, 0, 1)

const ROWS: readonly ArchivedSessionRow[] = [
  // The archive instant, not the last update, is the date on the row: the two
  // are deliberately different days so a row that showed the wrong one fails.
  // The first row is past its window and the second is not, so both deletion
  // states render in one list.
  {
    sessionId: sid('b'),
    title: 'Second',
    workspace: 'Alpha',
    updatedAt: Date.UTC(2026, 7, 20),
    archivedAt: Date.UTC(2026, 8, 2),
    eligibleAt: DUE,
  },
  {
    sessionId: sid('orphan'),
    title: 'Orphan',
    workspace: undefined,
    updatedAt: Date.UTC(2026, 7, 19),
    archivedAt: Date.UTC(2026, 8, 1),
    eligibleAt: LOCKED,
  },
]

/** Render the page over one row list; the returned store publishes later states. */
function renderSection(rows: readonly ArchivedSessionRow[], over: Partial<ArchivedSessionsSectionProps> = {}) {
  const store = createSnapshotStore<readonly ArchivedSessionRow[]>(rows)
  const close = vi.fn()
  const openSession = vi.fn()
  const restoreSession = vi.fn(async () => {})
  const deleteSession = vi.fn(async () => {})
  const deleteExpiredSessions = vi.fn(async () => {})
  // The page reads none of the shared standard kit; a throwing stub keeps the
  // fixture honest when the root program requires every merged member.
  const unusedStandardHook = (): never => { throw new Error('Archived sessions fixture does not provide shared state') }
  const props: ArchivedSessionsSectionProps = {
    usePanelInfo: unusedStandardHook,
    useSessions: unusedStandardHook,
    useSessionStatus: unusedStandardHook,
    useSessionRetainInfo: unusedStandardHook,
    useWorkspaces: unusedStandardHook,
    useResource: unusedStandardHook,
    close,
    useRows: bindSnapshotSelector(store),
    openSession,
    restoreSession,
    deleteSession,
    deleteExpiredSessions,
    t: makeTranslate(zh, commonZh),
    ...over,
  }
  const view = render(<ArchivedSessionsSection {...props} />)
  return { view, store, close, openSession, restoreSession, deleteSession, deleteExpiredSessions }
}

describe('ArchivedSessionsSection', () => {
  it('names the page, states what archiving means, and lists each row with its context', () => {
    const { view } = renderSection(ROWS)
    expect(view.getByRole('heading', { name: '已归档会话' })).toBeTruthy()
    expect(view.getByText(/打开可以查看/)).toBeTruthy()
    const list = within(view.getByRole('list', { name: '已归档会话' }))
    expect(list.getAllByRole('listitem')).toHaveLength(2)
    // Workspace title, or the Ungrouped label when no Workspace holds it.
    expect(list.getByText(/Alpha/)).toBeTruthy()
    expect(list.getByText(/未分组/)).toBeTruthy()
    expect(list.getAllByText(/已归档于 2026年9月2日/)).toHaveLength(1)
  })

  it('leaves a row whose archive instant has not arrived without a date, and undeletable', () => {
    const { view } = renderSection([
      {
        sessionId: sid('a'),
        title: 'Pending',
        workspace: 'Alpha',
        updatedAt: Date.UTC(2026, 8, 2),
        archivedAt: undefined,
        eligibleAt: undefined,
      },
    ])
    const row = view.getByText('Pending').closest('li') as HTMLElement
    expect(within(row).getByText(/Alpha/)).toBeTruthy()
    expect(within(row).queryByText(/已归档于/)).toBeNull()
    expect((within(row).getByRole('button', { name: '删除' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('deletes one row only after its confirming press', async () => {
    const pending = Promise.withResolvers<undefined>()
    const { view, deleteSession } = renderSection(ROWS)
    const row = view.getByText('Second').closest('li') as HTMLElement
    const button = within(row).getByRole('button', { name: '删除' })

    // The first press only arms the control and names what the next one does.
    fireEvent.click(button)
    expect(deleteSession).not.toHaveBeenCalled()
    const armed = within(row).getByRole('button', { name: '再次点击确认删除' })
    deleteSession.mockReturnValueOnce(pending.promise)
    fireEvent.click(armed)
    expect(deleteSession).toHaveBeenCalledExactlyOnceWith(sid('b'))
    // One action at a time: every other row's buttons wait for this deletion.
    expect((within(view.getByText('Orphan').closest('li') as HTMLElement)
      .getByRole('button', { name: '恢复' }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => { pending.resolve(undefined) })
    expect(within(row).getByRole('button', { name: '删除' })).toBeTruthy()
  })

  it('disarms a deletion that is not confirmed, and reports a refused one in place', async () => {
    vi.useFakeTimers()
    try {
      const { view } = renderSection(ROWS, {
        deleteSession: () => Promise.reject(new Error('session/retained')),
      })
      const row = view.getByText('Second').closest('li') as HTMLElement
      fireEvent.click(within(row).getByRole('button', { name: '删除' }))
      act(() => { vi.advanceTimersByTime(3_000) })
      expect(within(row).getByRole('button', { name: '删除' })).toBeTruthy()

      fireEvent.click(within(row).getByRole('button', { name: '删除' }))
      fireEvent.click(within(row).getByRole('button', { name: '再次点击确认删除' }))
      await act(async () => { await Promise.resolve() })
      expect(within(row).getByRole('button', { name: '删除失败，请重试' })).toBeTruthy()
      // The failure message clears on its own hold, leaving the row alone.
      act(() => { vi.advanceTimersByTime(4_000) })
      expect(within(row).getByRole('button', { name: '删除' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('offers the bulk deletion for the rows past their window only', async () => {
    const { view, deleteExpiredSessions } = renderSection(ROWS)
    const bulk = view.getByRole('button', { name: '删除可删除的 1 个会话' })
    fireEvent.click(bulk)
    expect(deleteExpiredSessions).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: '确认删除 1 个会话' }))
    expect(deleteExpiredSessions).toHaveBeenCalledOnce()

    // Nothing is due once every row is inside its window.
    const locked = renderSection(ROWS.map(row => ({ ...row, eligibleAt: LOCKED })))
    expect(locked.view.queryByRole('button', { name: /删除可删除的/ })).toBeNull()
  })

  it('shows the empty state instead of a list', () => {
    const { view } = renderSection([])
    expect(view.getByRole('status').textContent).toBe('暂无已归档会话')
    expect(view.queryByRole('list')).toBeNull()
  })

  it('opens the row and closes Settings onto that conversation', () => {
    const { view, close, openSession } = renderSection(ROWS)
    const row = view.getByText('Second').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '打开' }))
    expect(openSession).toHaveBeenCalledExactlyOnceWith(sid('b'))
    expect(close).toHaveBeenCalledOnce()
  })

  it('restores the row through the injected command and settles its button', async () => {
    const pending = Promise.withResolvers<undefined>()
    const { view, restoreSession } = renderSection(ROWS)
    restoreSession.mockReturnValueOnce(pending.promise)
    const row = view.getByText('Second').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '恢复' }))
    expect(restoreSession).toHaveBeenCalledExactlyOnceWith(sid('b'))
    // One action at a time: the row that is restoring names that state.
    expect(within(row).getByRole('button', { name: '正在恢复…' })).toBeTruthy()
    await act(async () => { pending.resolve(undefined) })
    expect(within(row).getByRole('button', { name: '恢复' })).toBeTruthy()
  })

  it('keeps a failed row in place with the reason beside it', async () => {
    const { view } = renderSection(ROWS, { restoreSession: () => Promise.reject(new Error('offline')) })
    const row = view.getByText('Second').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '恢复' }))
    await act(async () => { await Promise.resolve() })
    expect(within(row).getByRole('alert').textContent).toBe('恢复失败，请重试')
  })

  it('drops a row once the set publishes it away', () => {
    const { view, store } = renderSection(ROWS)
    expect(view.getAllByRole('listitem')).toHaveLength(2)
    act(() => { store.set(ROWS.slice(0, 1)) })
    expect(view.getAllByRole('listitem')).toHaveLength(1)
    expect(view.queryByText('Orphan')).toBeNull()
  })

  it('keeps the locked deletion unavailable, naming when it opens, and translates its copy', () => {
    const { view } = renderSection(ROWS, { t: makeTranslate(en, commonEn) })
    expect(view.getByRole('heading', { name: 'Archived sessions' })).toBeTruthy()
    expect(view.getAllByRole('button', { name: 'Open' })).toHaveLength(2)
    expect(view.getByText(/Archived Sep 2, 2026/)).toBeTruthy()
    const row = view.getByText('Orphan').closest('li') as HTMLElement
    const locked = within(row).getByRole('button', { name: /Deletable Jan 1, 2999/ }) as HTMLButtonElement
    expect(locked.disabled).toBe(true)
  })
})
