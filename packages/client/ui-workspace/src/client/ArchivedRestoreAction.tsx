/**
 * Composer-dock action for the archived Session the conversation shows.
 *
 * An archived Session carries an inert composer whose block copy names the
 * state, and the row that restores it can sit out of sight while the archived
 * filter hides rows. The way back therefore belongs beside the composer
 * itself. The dock is a list, so a deployment wanting another route replaces
 * or drops this entry by id.
 */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: merges the Session standard kit (sessionId) into the slot props.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import css from './ArchivedRestoreAction.module.css'

/** Restore callback and archive-set source the registration injects. */
export interface ArchivedRestoreActionInjected {
  /** Remove one Session from the registry-global archived set. */
  readonly restore: (sessionId: SessionId) => void
  readonly hooks: {
    /** Archived Session ids. */
    readonly archived: HostObservable<ReadonlySet<SessionId>>
  }
}

/** Composer-dock props: the bound Session, the archive set, and localized copy. */
export type ArchivedRestoreActionProps = PropsRuntime<'conversation.composer.dock'>
  & InjectFace<ArchivedRestoreActionInjected>
  & PropsLocale<'workspace'>

/**
 * Render the restore action for an archived Session, and nothing otherwise.
 * @param props - the bound Session, the archive-set hook, the restore callback, and localized copy.
 * @returns the restore button, or null while the Session is not archived.
 */
export function ArchivedRestoreAction({ sessionId, useArchived, restore, t }: ArchivedRestoreActionProps) {
  const archived = useArchived(set => set.has(sessionId))
  if (!archived) return null
  return (
    <div className={css.frame}>
      <Button size="sm" variant="outline" onClick={() => { restore(sessionId) }}>
        {t('composer.restore')}
      </Button>
    </div>
  )
}
