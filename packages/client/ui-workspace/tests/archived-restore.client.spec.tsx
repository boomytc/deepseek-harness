// @vitest-environment jsdom
/**
 * The composer-dock restore action: it renders only for the archived Session
 * the conversation shows, and its click hands that Session to the restore
 * callback. The dock itself owns the row layout; this spec asserts the entry's
 * own decision and the localized label.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { ArchivedRestoreAction, type ArchivedRestoreActionProps } from '../src/client/ArchivedRestoreAction.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const sid = (id: string) => id as SessionId

/** Render the dock entry over one archive set; the hook reads that set directly. */
function renderAction(archived: readonly SessionId[], overrides: Partial<ArchivedRestoreActionProps> = {}) {
  const restore = vi.fn()
  // The entry reads only the archive set; a throwing stub keeps the fixture
  // honest when the root program requires every merged standard member.
  const unusedStandardHook = (): never => { throw new Error('Archived restore fixture does not provide shared state') }
  const props: ArchivedRestoreActionProps = {
    sessionId: sid('gone'),
    useArchived: selector => selector(new Set(archived)),
    restore,
    t: makeTranslate(zh, commonZh),
    useSession: unusedStandardHook,
    useProjection: unusedStandardHook,
    useConversation: unusedStandardHook,
    useInput: unusedStandardHook,
    // The entry raises none of the composer's input actions; the store keeps
    // the fixture honest when the root program requires every merged member.
    inputActions: {
      captureInsertion: () => ({ start: 0, end: 0, draftRev: 0 }),
      insertText: () => false,
      setDraft: vi.fn(),
      persistDraft: vi.fn(),
      addAttachments: () => true,
      removeAttachment: vi.fn(),
      pruneAttachments: vi.fn(),
      submit: vi.fn(),
    },
    useChat: unusedStandardHook,
    useTrajectory: unusedStandardHook,
    usePanelInfo: unusedStandardHook,
    useSessions: unusedStandardHook,
    useSessionStatus: unusedStandardHook,
    useSessionRetainInfo: unusedStandardHook,
    useWorkspaces: unusedStandardHook,
    useResource: unusedStandardHook,
    ...overrides,
  }
  const view = render(<ArchivedRestoreAction {...props} />)
  return { view, restore, props }
}

describe('ArchivedRestoreAction', () => {
  it('offers the restore action for the archived Session the dock is under', () => {
    const { restore } = renderAction([sid('gone')])
    fireEvent.click(screen.getByRole('button', { name: '恢复会话' }))
    expect(restore).toHaveBeenCalledExactlyOnceWith(sid('gone'))
  })

  it('renders nothing while the Session is not archived', () => {
    const { view } = renderAction([])
    expect(view.container.firstChild).toBeNull()
  })

  it('renders nothing for another archived Session than the bound one', () => {
    const { view } = renderAction([sid('elsewhere')])
    expect(view.container.firstChild).toBeNull()
  })

  it('takes its label from the active language', () => {
    renderAction([sid('gone')], { t: makeTranslate(en, commonEn) })
    expect(screen.getByRole('button', { name: 'Restore session' })).toBeTruthy()
  })
})
