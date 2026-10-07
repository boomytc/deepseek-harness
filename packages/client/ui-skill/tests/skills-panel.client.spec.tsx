// @vitest-environment jsdom

/**
 * The Skills page: one state per catalog read state, the local filter, and
 * which rows open their `SKILL.md` in the right Sidebar. The fixture feeds
 * props directly — the page owns no read, so the catalog arrives as an
 * injected observable and the assertions cover presentation only.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import { SkillsPanel, type SkillsPanelProps } from '../src/client/SkillsPanel.tsx'
import type { SkillsPanelSnapshot } from '../src/client/skills-panel-source.ts'
import { zh } from '../src/client/locales.ts'

const t: SkillsPanelProps['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

const SESSION = 'session-1' as SkillsPanelSnapshot['sessionId']

const READY: readonly SkillEntry[] = [
  { name: 'commit-helper', description: 'Draft commit messages', modelInvocable: true, path: '/skills/commit-helper/SKILL.md' },
  { name: 'deploy', description: 'Ship a release', whenToUse: 'when releasing', modelInvocable: true, path: '/skills/deploy/SKILL.md' },
  { name: 'notes', description: 'User notes', modelInvocable: false },
]

/** Render the page over one catalog value; the returned store publishes later states. */
function renderPanel(snapshot: SkillsPanelSnapshot, over: Partial<SkillsPanelProps> = {}) {
  const store = createSnapshotStore<SkillsPanelSnapshot>(snapshot)
  const onRetry = vi.fn()
  const onOpenSkill = vi.fn()
  const unusedStandardHook = (): never => { throw new Error('Skills page fixture does not provide global state') }
  const props: SkillsPanelProps = {
    usePanelInfo: unusedStandardHook,
    useWorkspaces: unusedStandardHook,
    useSessions: unusedStandardHook,
    useSessionStatus: unusedStandardHook,
    useSessionRetainInfo: unusedStandardHook,
    useResource: unusedStandardHook,
    useCatalog: bindSnapshotSelector(store),
    onRetry,
    onOpenSkill,
    t,
    ...over,
  }
  const view = render(<SkillsPanel {...props} />)
  return { store, onRetry, onOpenSkill, view }
}

const ready = (skills: readonly SkillEntry[] = READY): SkillsPanelSnapshot =>
  ({ sessionId: SESSION, status: 'ready', skills })

describe('SkillsPanel states', () => {
  it('names the page and lists each skill with its invocation name', () => {
    const { view } = renderPanel(ready())
    expect(view.getByRole('heading', { name: '技能' })).toBeTruthy()
    const list = view.getByRole('list', { name: '可用技能' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    // The `/name` line is the invocation the composer accepts; the description
    // sits under it, and the user-only marker rides that description.
    const deploy = within(list).getByText('/deploy').closest('button')!
    expect(within(deploy).getByText('Ship a release')).toBeTruthy()
    const notes = within(list).getByText('/notes').closest('li')!
    expect(within(notes).getByText('仅用户 · User notes')).toBeTruthy()
  })

  it('opens a skill with a file path and leaves a path-less row inert', () => {
    const { onOpenSkill } = renderPanel(ready())
    fireEvent.click(screen.getByText('/commit-helper').closest('button')!)
    expect(onOpenSkill).toHaveBeenCalledExactlyOnceWith(READY[0])
    // A skill whose provider supplied no path has nothing to open, so it is
    // not a control at all.
    expect(screen.getByText('/notes').closest('button')).toBeNull()
  })

  it('shows no list while no Session is open', () => {
    const { view } = renderPanel({ sessionId: undefined, status: 'no-session', skills: [] })
    expect(view.getByText('尚未打开会话')).toBeTruthy()
    expect(view.getByText('打开一个会话后查看它的可用技能')).toBeTruthy()
    expect(view.queryByRole('list')).toBeNull()
    expect(view.queryByRole('searchbox')).toBeNull()
  })

  it('announces a read in flight without a search field', () => {
    const { view } = renderPanel({ sessionId: SESSION, status: 'loading', skills: [] })
    expect(view.getByRole('status', { name: '正在加载技能' })).toBeTruthy()
    expect(view.queryByRole('searchbox')).toBeNull()
  })

  it('reports a failed read and retries it on demand', () => {
    const { onRetry } = renderPanel({ sessionId: SESSION, status: 'error', skills: [] })
    expect(screen.getByRole('alert').textContent).toBe('技能加载失败')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('centers the empty state when the Session has no skills', () => {
    const { view } = renderPanel(ready([]))
    expect(view.getByText('此会话当前没有可用技能')).toBeTruthy()
    expect(view.queryByRole('searchbox')).toBeNull()
  })
})

describe('SkillsPanel filter', () => {
  const filter = (view: ReturnType<typeof renderPanel>['view'], text: string) =>
    fireEvent.change(view.getByRole('searchbox', { name: '搜索技能' }), { target: { value: text } })

  it('filters by name, description, and routing note, and reports no match', () => {
    const { view } = renderPanel(ready())
    filter(view, 'COMMIT')
    expect(view.getAllByRole('listitem')).toHaveLength(1)
    filter(view, 'ship a release')
    expect(view.getByText('/deploy')).toBeTruthy()
    filter(view, 'when releasing')
    expect(view.getAllByRole('listitem')).toHaveLength(1)
    filter(view, 'absent')
    expect(view.queryByRole('list')).toBeNull()
    expect(view.getByText('没有匹配的技能')).toBeTruthy()
    // Whitespace alone is not a query.
    filter(view, '   ')
    expect(view.getAllByRole('listitem')).toHaveLength(3)
  })

  it('clears the query from the field control', () => {
    const { view } = renderPanel(ready())
    filter(view, 'deploy')
    fireEvent.click(view.getByRole('button', { name: '清除搜索' }))
    expect((view.getByRole('searchbox') as HTMLInputElement).value).toBe('')
    expect(view.getAllByRole('listitem')).toHaveLength(3)
  })

  it('drops a filter that a later catalog change left without matches', () => {
    const { view, store } = renderPanel(ready())
    filter(view, 'commit')
    expect(view.getAllByRole('listitem')).toHaveLength(1)
    act(() => { store.set({ sessionId: SESSION, status: 'loading', skills: [] }) })
    expect(view.queryByRole('searchbox')).toBeNull()
  })
})
