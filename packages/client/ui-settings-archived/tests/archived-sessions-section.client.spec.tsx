// @vitest-environment jsdom
/**
 * The Archived sessions page: the empty state, one row per archived Session,
 * and what each row's two actions do — Open leaves Settings for that
 * conversation, Restore drops the Session from the set and reports a refusal
 * in place.
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

const ROWS: readonly ArchivedSessionRow[] = [
  { sessionId: sid('b'), title: 'Second', workspace: 'Alpha', updatedAt: Date.UTC(2026, 8, 2) },
  { sessionId: sid('orphan'), title: 'Orphan', workspace: undefined, updatedAt: Date.UTC(2026, 8, 1) },
]

/** Render the page over one row list; the returned store publishes later states. */
function renderSection(rows: readonly ArchivedSessionRow[], over: Partial<ArchivedSessionsSectionProps> = {}) {
  const store = createSnapshotStore<readonly ArchivedSessionRow[]>(rows)
  const close = vi.fn()
  const openSession = vi.fn()
  const restoreSession = vi.fn(async () => {})
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
    t: makeTranslate(zh, commonZh),
    ...over,
  }
  const view = render(<ArchivedSessionsSection {...props} />)
  return { view, store, close, openSession, restoreSession }
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

  it('takes its copy and its dates from the active language', () => {
    const { view } = renderSection(ROWS, { t: makeTranslate(en, commonEn) })
    expect(view.getByRole('heading', { name: 'Archived sessions' })).toBeTruthy()
    expect(view.getAllByRole('button', { name: 'Open' })).toHaveLength(2)
    expect(view.getByText(/Sep 2, 2026/)).toBeTruthy()
  })
})
