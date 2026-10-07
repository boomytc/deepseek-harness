/**
 * Observable catalog behind the Skills page.
 *
 * Skills belong to a Session's composition — its agent preset and project cwd
 * — so the page lists the catalog of the Session the main view retains, and
 * shows no list while none is open. The read is the `/` source's shared
 * per-session fetch, so opening the page costs no RPC the composer's menu has
 * not already paid, and a dropped cache entry (preset switch, connection
 * reset) re-reads rather than leaving the page describing a composition the
 * Session left. A read that a newer one superseded never publishes.
 */
import { notifySubscribers } from '@deepseek-ai/dsh-client-store'
import type { SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** Read state behind the Skills page. */
export type SkillsPanelStatus =
  /** No Session is open, so no composition selects a catalog. */
  | 'no-session'
  /** The selected Session's catalog is in flight. */
  | 'loading'
  /** The catalog is settled and `skills` is authoritative. */
  | 'ready'
  /** The read failed; `retry` starts another one. */
  | 'error'

/** One value of the Skills page's catalog source. */
export interface SkillsPanelSnapshot {
  /** Session whose composition the list describes; absent while none is open. */
  readonly sessionId: SessionId | undefined
  /** Read state of that composition's catalog. */
  readonly status: SkillsPanelStatus
  /** Settled user-invocable skills; empty in every other state. */
  readonly skills: readonly SkillEntry[]
}

/** Observable catalog and controls the page registration injects. */
export interface SkillsPanelSource {
  /** Bare catalog source the renderer binds to `useCatalog`. */
  readonly hooks: { readonly catalog: HostObservable<SkillsPanelSnapshot> }
  /** Read the current Session's catalog again after a failed read. */
  readonly retry: () => void
  /** Stop following the Session list and the dropped-read signal. */
  readonly dispose: () => void
}

/** The plugin body facts the source reads. */
export interface SkillsPanelSourceOptions {
  /** Session list snapshot; the Session the main view retains selects the catalog. */
  readonly list: HostObservable<SessionListState>
  /** Shared single-flight catalog read for one Session. */
  readonly read: (sessionId: SessionId) => Promise<readonly SkillEntry[]>
  /**
   * Subscribe to a dropped shared read for one Session: the composition may
   * have changed, so the page re-reads instead of keeping the settled list.
   */
  readonly subscribeDropped: (listener: (sessionId: SessionId) => void) => () => void
}

/** Skills of a Session no read has settled; shared so equal states keep one identity. */
const NO_SKILLS: readonly SkillEntry[] = []

/** The Session the main view retains, or undefined while none is open. */
function mainViewSessionId(list: SessionListState): SessionId | undefined {
  return Object.values(list.byId).find(session => (session.retainedBy.mainView ?? 0) > 0)?.id
}

/**
 * Follow the main-view Session and publish its skill catalog.
 * @param options - Session list source, the shared catalog read, and its dropped-read signal.
 * @returns the observable catalog, its retry, and its teardown.
 */
export function createSkillsPanelSource(options: SkillsPanelSourceOptions): SkillsPanelSource {
  const listeners = new Set<() => void>()
  let snapshot: SkillsPanelSnapshot = { sessionId: undefined, status: 'no-session', skills: NO_SKILLS }
  let sessionId: SessionId | undefined
  let generation = 0

  const publish = (next: SkillsPanelSnapshot): void => {
    if (next.sessionId === snapshot.sessionId
      && next.status === snapshot.status
      && next.skills === snapshot.skills) return
    snapshot = next
    notifySubscribers(listeners, '[ui-skill] Skills page catalog')
  }

  const startRead = (target: SessionId): void => {
    const current = ++generation
    publish({ sessionId: target, status: 'loading', skills: NO_SKILLS })
    options.read(target).then(
      (skills) => {
        if (current === generation) publish({ sessionId: target, status: 'ready', skills })
      },
      () => {
        if (current === generation) publish({ sessionId: target, status: 'error', skills: NO_SKILLS })
      },
    )
  }

  const follow = (): void => {
    const target = mainViewSessionId(options.list.getSnapshot())
    if (target === sessionId) return
    sessionId = target
    // Supersede whatever the previous Session left in flight before starting.
    generation += 1
    if (target === undefined) publish({ sessionId: undefined, status: 'no-session', skills: NO_SKILLS })
    else startRead(target)
  }

  const disposeList = options.list.subscribe(follow)
  const disposeDropped = options.subscribeDropped((dropped) => {
    if (dropped === sessionId) startRead(dropped)
  })
  follow()

  return {
    hooks: {
      catalog: {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      },
    },
    retry: () => {
      if (sessionId !== undefined) startRead(sessionId)
    },
    dispose: () => {
      generation += 1
      disposeList()
      disposeDropped()
      listeners.clear()
    },
  }
}
