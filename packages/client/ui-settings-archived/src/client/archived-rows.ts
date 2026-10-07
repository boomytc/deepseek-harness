/**
 * Observable rows behind the Archived sessions settings page.
 *
 * The page manages the registry-global archive set, while the facts a row
 * shows — title, Workspace, archive instant, and when the Host would let it be
 * deleted — live in the Session list and the archive timetable, and those
 * streams publish independently. This source re-projects on either change, so
 * the page renders one settled list per state and never reads a Session body:
 * an archived Session stays untouched until the user opens it.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** One archived Session as the page lists it. */
export interface ArchivedSessionRow {
  /** Archived Session identity. */
  readonly sessionId: SessionId
  /** Human-facing Session label the list carries. */
  readonly title: string
  /** Title of the Workspace grouping the Session; absent under Ungrouped. */
  readonly workspace: string | undefined
  /** Last update, used only for ordering the page. */
  readonly updatedAt: number
  /**
   * When the Session entered the archive set, epoch milliseconds. Absent only
   * while a client holds a record the Host has not stamped yet.
   */
  readonly archivedAt: number | undefined
  /**
   * When the Host would accept deleting this Session, epoch milliseconds;
   * absent when the Host published none for it.
   */
  readonly eligibleAt: number | undefined
}

/** Row source and teardown the page registration injects. */
export interface ArchivedSessionsSource {
  /** Bare row source the page binds to `useRows`. */
  readonly hooks: { readonly rows: HostObservable<readonly ArchivedSessionRow[]> }
  /** Stop following both controller snapshots. */
  readonly dispose: () => void
}

/**
 * Project the archive set through the Session list and the Workspace grouping.
 * @param sessions - Session list snapshot.
 * @param workspaces - Workspace snapshot carrying the archive set, its instants, its deletion instants, and grouping.
 * @returns archived rows, newest update first.
 */
function project(sessions: SessionListState, workspaces: WorkspaceSnapshot): readonly ArchivedSessionRow[] {
  const rows: ArchivedSessionRow[] = []
  for (const sessionId of workspaces.archivedSessionIds) {
    // A set member the list has not delivered yet is not a row: the archive
    // set is durable, while a summary arrives with the list baseline.
    const summary = sessions.byId[sessionId]
    if (summary === undefined) continue
    const archivedAt = workspaces.archivedAt[sessionId]
    const deletionAt = workspaces.archivedDeletionAt[sessionId]
    rows.push({
      sessionId,
      title: summary.displayTitle,
      workspace: workspaces.items.find(item => item.sessionIds.includes(sessionId))?.title,
      updatedAt: summary.updatedAt,
      archivedAt: archivedAt === undefined ? undefined : Date.parse(archivedAt),
      eligibleAt: deletionAt === undefined ? undefined : Date.parse(deletionAt),
    })
  }
  return rows.sort((left, right) => right.updatedAt - left.updatedAt)
}

/**
 * Follow the archive set and the Session list, publishing one settled row list.
 * @param sessions - Session list source.
 * @param workspaces - Workspace snapshot source.
 * @returns the row observable and its teardown.
 */
export function createArchivedSessionsSource(
  sessions: HostObservable<SessionListState>,
  workspaces: HostObservable<WorkspaceSnapshot>,
): ArchivedSessionsSource {
  const store = createSnapshotStore<readonly ArchivedSessionRow[]>([])
  const publish = (): void => {
    const next = project(sessions.getSnapshot(), workspaces.getSnapshot())
    const current = store.getSnapshot()
    // Equal rows keep the previous identity: an unrelated list update (an
    // ordinary Session's status, a Workspace rename elsewhere) re-renders
    // nothing here.
    if (current.length === next.length && current.every((row, index) => {
      const candidate = next[index] as ArchivedSessionRow
      return row.sessionId === candidate.sessionId && row.title === candidate.title
        && row.workspace === candidate.workspace && row.updatedAt === candidate.updatedAt
        && row.archivedAt === candidate.archivedAt && row.eligibleAt === candidate.eligibleAt
    })) return
    store.set(next)
  }
  const disposeSessions = sessions.subscribe(publish)
  const disposeWorkspaces = workspaces.subscribe(publish)
  publish()
  return {
    hooks: { rows: store },
    dispose: () => {
      disposeSessions()
      disposeWorkspaces()
    },
  }
}
