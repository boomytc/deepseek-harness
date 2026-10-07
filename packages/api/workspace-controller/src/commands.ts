/** Workspace command implementation and stable Remote failure mapping. */

import type { Context } from '@deepseek-ai/cordis'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import {
  WorkspaceActiveSessionError,
  WorkspaceArchivedSessionPinError,
  WorkspaceId,
  WorkspaceMoveInvalidError,
  WorkspaceOrderInvalidError,
  WorkspaceUnknownSessionError,
} from '@deepseek-ai/dsh-workspace'
import { RemoteError, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { SessionPersistenceBusyError } from '@deepseek-ai/dsh-session-persistence'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { deletionDue, deletionEligibleAt, deletionTimes } from './retention.ts'
import { workspaceView } from './feed.ts'
import type {
  WorkspaceArchiveSessionRequest,
  WorkspaceArchiveValue,
  WorkspaceCreateRequest,
  WorkspaceCreateValue,
  WorkspaceDeleteArchivedSessionRequest,
  WorkspaceDeleteRequest,
  WorkspaceDeleteValue,
  WorkspaceInsertBeforeRequest,
  WorkspaceInsertSessionBeforeRequest,
  WorkspaceOrderValue,
  WorkspacePinSessionRequest,
  WorkspacePinValue,
  WorkspaceRenameRequest,
  WorkspaceUnarchiveSessionRequest,
  WorkspaceUnpinSessionRequest,
  WorkspaceValue,
} from './types.ts'

/** Implements Workspace mutations against the authoritative registry. */
export class WorkspaceCommands {
  private operationTail = Promise.resolve()

  /**
   * @param ctx - Host context containing the Workspace registry and Session storage.
   * @param archivedRetentionDays - whole days an archived Session stays undeletable.
   */
  constructor(private readonly ctx: Context, private readonly archivedRetentionDays: number) {}

  /**
   * Create or resolve one Workspace over an existing directory.
   * @param request - directory path to register.
   * @returns the Workspace and whether this call created it.
   */
  create(request: WorkspaceCreateRequest): Promise<WorkspaceCreateValue> {
    return this.enqueue(async () => {
      try {
        const existing = await this.ctx.workspaceRegistry.resolveByPath(request.path)
        if (existing !== undefined) {
          return { workspace: workspaceView(existing), created: false }
        }
        const workspace = await this.ctx.workspaceRegistry.create(request.path)
        return { workspace: workspaceView(workspace), created: true }
      } catch (error) {
        if (remoteErrorOf(error) !== undefined) throw error
        throw new RemoteError(
          'workspace/invalid-path',
          `cannot create a Workspace at "${request.path}": ${errorMessage(error)}`,
          { path: request.path },
          { cause: error },
        )
      }
    })
  }

  /**
   * Rename one Workspace after serializing title ownership checks.
   * @param request - Workspace identity and proposed title.
   * @returns the updated Workspace projection.
   */
  rename(request: WorkspaceRenameRequest): Promise<WorkspaceValue> {
    const title = request.title.trim()
    if (title === '') {
      return Promise.reject(new RemoteError('gateway/bad-request', 'Workspace rename requires a non-blank title', {}))
    }
    return this.enqueue(async () => {
      const workspace = this.requireWorkspace(request.workspaceId)
      if (title !== workspace.title) {
        if (this.ctx.workspaceRegistry.list().some(candidate =>
          candidate.id !== workspace.id && candidate.title === title)) {
          throw new RemoteError(
            'workspace/name-conflict',
            `Workspace name '${title}' is already in use`,
            { name: title },
          )
        }
        await workspace.setTitle(title)
      }
      return { workspace: workspaceView(workspace) }
    })
  }

  /**
   * Delete one Workspace registration without deleting its directory or Sessions.
   * @param request - Workspace identity to remove.
   * @returns deletion confirmation.
   */
  delete(request: WorkspaceDeleteRequest): Promise<WorkspaceDeleteValue> {
    return this.enqueue(async () => {
      if (!await this.ctx.workspaceRegistry.delete(WorkspaceId(request.workspaceId))) {
        throw workspaceNotFound(request.workspaceId)
      }
      return { deleted: true }
    })
  }

  /**
   * Move one Workspace within the durable registry order.
   * @param request - moved Workspace and optional anchor.
   * @returns the complete resulting Workspace order.
   */
  async insertBefore(request: WorkspaceInsertBeforeRequest): Promise<WorkspaceOrderValue> {
    try {
      const workspaceIds = await this.ctx.workspaceRegistry.insertBefore(
        WorkspaceId(request.workspaceId),
        request.beforeWorkspaceId === undefined
          ? undefined
          : WorkspaceId(request.beforeWorkspaceId),
      )
      return { workspaceIds: [...workspaceIds] }
    } catch (error) {
      if (!(error instanceof WorkspaceOrderInvalidError)) throw error
      throw workspaceNotFound(error.workspaceId)
    }
  }

  /**
   * Move one accounted Session within a Workspace's manual order.
   * @param request - Workspace, Session, and optional anchor identities.
   * @returns the updated Workspace projection.
   */
  async insertSessionBefore(request: WorkspaceInsertSessionBeforeRequest): Promise<WorkspaceValue> {
    const workspace = this.requireWorkspace(request.workspaceId)
    try {
      await workspace.insertSessionBefore(request.sessionId, request.beforeSessionId)
    } catch (error) {
      if (!(error instanceof WorkspaceMoveInvalidError)) throw error
      throw new RemoteError(
        'workspace/move-invalid',
        error.message,
        {
          workspaceId: request.workspaceId,
          sessionId: request.sessionId,
          ...request.beforeSessionId === undefined
            ? {}
            : { beforeSessionId: request.beforeSessionId },
        },
        { cause: error },
      )
    }
    return { workspace: workspaceView(workspace) }
  }

  /**
   * Add one known Session to the registry-global archive set. Without
   * `stopActivity` a Session with running work is refused as
   * `workspace/session-active` with the activity the registry's providers
   * reported; with it, the providers stop that work first.
   * @param request - Session identity to archive and whether to stop its work.
   * @returns the complete resulting archive set.
   */
  async archiveSession(request: WorkspaceArchiveSessionRequest): Promise<WorkspaceArchiveValue> {
    try {
      await this.ctx.workspaceRegistry.archiveSession(
        request.sessionId,
        request.stopActivity === true ? { stopActivity: true } : {},
      )
    } catch (error) {
      if (error instanceof WorkspaceUnknownSessionError) {
        throw new RemoteError('session/not-found', error.message, { sessionId: request.sessionId }, { cause: error })
      }
      if (error instanceof WorkspaceActiveSessionError) {
        throw new RemoteError(
          'workspace/session-active',
          error.message,
          { sessionId: request.sessionId, activity: error.activity },
          { cause: error },
        )
      }
      throw error
    }
    return this.archiveValue()
  }

  /**
   * Drop one Session from the registry-global archive set. An id that is not
   * archived is not an error: the call is idempotent, so a lost race with
   * another surface resolves as a no-op.
   * @param request - Session identity to unarchive.
   * @returns the complete resulting archive set.
   */
  async unarchiveSession(request: WorkspaceUnarchiveSessionRequest): Promise<WorkspaceArchiveValue> {
    await this.ctx.workspaceRegistry.unarchiveSession(request.sessionId)
    return this.archiveValue()
  }

  /**
   * Delete one archived Session's stored log irreversibly, once it has been
   * archived for the Host's retention window: Session storage removes the
   * artifacts first, and the registry drops its references only after they are
   * gone, so a refusal leaves the Session exactly as it was — archived, listed,
   * and deletable later.
   *
   * A Session that is not archived is refused as `workspace/session-not-archived`
   * and one still inside its window as `workspace/session-retained`, whose
   * details carry when it becomes due. A Session something still holds is
   * refused as `workspace/session-busy`. An archived Session whose log is
   * already gone resolves normally — the requested state is what it already
   * is — and a failure between the two steps leaves an archived entry whose
   * Session nothing can open, which the next attempt clears.
   * @param request - Session identity to delete.
   * @returns the complete resulting archive set.
   */
  async deleteArchivedSession(request: WorkspaceDeleteArchivedSessionRequest): Promise<WorkspaceArchiveValue> {
    return await this.enqueue(async () => {
      await this.deleteArchived(request.sessionId)
      return this.archiveValue()
    })
  }

  /**
   * Delete every archived Session that reached the retention window. Every due
   * Session is attempted even when one fails, because the durable archive-set
   * writes already committed; the call then rejects with
   * `workspace/session-delete-partial`, whose details name each failure, while
   * the published archive set already excludes everything that succeeded.
   * @returns the complete resulting archive set.
   */
  async deleteExpiredArchivedSessions(): Promise<WorkspaceArchiveValue> {
    return await this.enqueue(async () => {
      const due = this.ctx.workspaceRegistry.archivedSessionIds
        .filter(sessionId => this.isDue(sessionId))
      const failures: Array<{ sessionId: SessionId; code: string }> = []
      for (const sessionId of due) {
        try {
          await this.deleteArchived(sessionId)
        } catch (error: unknown) {
          const failure = remoteErrorOf(error)
          if (failure === undefined) throw error
          failures.push({ sessionId, code: failure.code })
        }
      }
      if (failures.length > 0) {
        throw new RemoteError(
          'workspace/session-delete-partial',
          `deleted ${due.length - failures.length} of ${due.length} due archived sessions`,
          { failures },
        )
      }
      return this.archiveValue()
    })
  }

  /** The complete archive set with its instants, as every archive mutation replies. */
  private archiveValue(): WorkspaceArchiveValue {
    return {
      archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds],
      archivedAt: { ...this.ctx.workspaceRegistry.archivedAt },
      archivedDeletionAt: deletionTimes(this.ctx.workspaceRegistry.archivedAt, this.archivedRetentionDays),
    }
  }

  /** Whether one archived Session has reached the configured deletion window. */
  private isDue(sessionId: string): boolean {
    return deletionDue(
      this.ctx.workspaceRegistry.archivedAt[sessionId],
      this.archivedRetentionDays,
      Date.now(),
    )
  }

  /**
   * Delete one archived Session behind the retention check: its log first,
   * then every registry reference to it.
   * @param sessionId - Session to delete.
   */
  private async deleteArchived(sessionId: SessionId): Promise<void> {
    const archivedAt = this.ctx.workspaceRegistry.archivedAt[sessionId]
    if (archivedAt === undefined) {
      throw new RemoteError(
        'workspace/session-not-archived',
        `session "${sessionId}" is not archived`,
        { sessionId },
      )
    }
    if (!deletionDue(archivedAt, this.archivedRetentionDays, Date.now())) {
      throw new RemoteError(
        'workspace/session-retained',
        `session "${sessionId}" is archived until its retention window closes`,
        { sessionId, archivedAt, eligibleAt: deletionEligibleAt(archivedAt, this.archivedRetentionDays) },
      )
    }
    try {
      await this.ctx.sessionPersistence.remove(sessionId)
    } catch (error: unknown) {
      if (!(error instanceof SessionPersistenceBusyError)) throw error
      throw new RemoteError(
        'workspace/session-busy',
        error.message,
        { sessionId, holder: error.holder },
        { cause: error },
      )
    }
    await this.ctx.workspaceRegistry.forgetSession(sessionId)
  }

  /**
   * Add one known unarchived Session to the registry-global pin set.
   * @param request - Session identity to pin.
   * @returns the complete resulting pin set, most recently pinned first.
   */
  async pinSession(request: WorkspacePinSessionRequest): Promise<WorkspacePinValue> {
    try {
      await this.ctx.workspaceRegistry.pinSession(request.sessionId)
    } catch (error) {
      if (error instanceof WorkspaceUnknownSessionError) {
        throw new RemoteError('session/not-found', error.message, { sessionId: request.sessionId }, { cause: error })
      }
      if (error instanceof WorkspaceArchivedSessionPinError) {
        throw new RemoteError('gateway/bad-request', error.message, {}, { cause: error })
      }
      throw error
    }
    return { pinnedSessionIds: [...this.ctx.workspaceRegistry.pinnedSessionIds] }
  }

  /**
   * Drop one Session from the registry-global pin set. An id that is not
   * pinned is not an error: the call is idempotent, so a lost race with
   * another surface resolves as a no-op.
   * @param request - Session identity to unpin.
   * @returns the complete resulting pin set, most recently pinned first.
   */
  async unpinSession(request: WorkspaceUnpinSessionRequest): Promise<WorkspacePinValue> {
    await this.ctx.workspaceRegistry.unpinSession(request.sessionId)
    return { pinnedSessionIds: [...this.ctx.workspaceRegistry.pinnedSessionIds] }
  }

  private requireWorkspace(workspaceId: WorkspaceId): Workspace {
    const workspace = this.ctx.workspaceRegistry.get(WorkspaceId(workspaceId))
    if (workspace === undefined) throw workspaceNotFound(workspaceId)
    return workspace
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation)
    this.operationTail = result.then(() => undefined, () => undefined)
    return result
  }
}

function workspaceNotFound(workspaceId: WorkspaceId): RemoteError<'workspace/not-found'> {
  return new RemoteError(
    'workspace/not-found',
    `Workspace "${workspaceId}" not found`,
    { workspaceId },
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
