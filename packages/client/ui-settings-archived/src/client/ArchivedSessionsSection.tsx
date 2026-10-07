/**
 * Archived sessions settings page: every Session the registry-global archive
 * set holds, newest update first. Opening one returns to its conversation —
 * an archived Session stays readable — and Restore drops it from the set
 * without touching its log. Delete is the one destructive action here, so it
 * stays behind the Host's retention window: a row offers it only once that
 * window closed, and the Host checks the same rule again before it deletes.
 */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ArchivedSessionRow } from './archived-rows.ts'
import { NS } from './locales.ts'
import css from './ArchivedSessionsSection.module.css'

/** How long an armed deletion waits for its confirming press before disarming. */
const ARM_MS = 3_000

/** How long a failed deletion keeps its message before the button resets. */
const FAILED_MS = 4_000

/** Action key of the one-at-a-time bulk deletion, distinct from any Session id. */
const BULK_KEY = 'bulk'

/**
 * Two-press deletion state: `armed` waits for the confirming second press,
 * `pending` covers the Host call, and `failed` reports the refusal on the
 * control that raised it.
 */
type DeletePhase = { readonly key: string; readonly state: 'armed' | 'pending' | 'failed' }

/** Row source and commands the page registration injects. */
export interface ArchivedSessionsSectionInjected {
  hooks: {
    /** Archived Session rows, newest update first. */
    readonly rows: HostObservable<readonly ArchivedSessionRow[]>
  }
  /** Return to one archived Session's conversation. */
  readonly openSession: (sessionId: SessionId) => void
  /** Drop one Session from the archive set; its row leaves the list on success. */
  readonly restoreSession: (sessionId: SessionId) => Promise<void>
  /** Delete one archived Session whose retention window closed. */
  readonly deleteSession: (sessionId: SessionId) => Promise<void>
  /** Delete every archived Session whose retention window closed. */
  readonly deleteExpiredSessions: () => Promise<void>
}

/** Settings-section props: the shell's close action, the rows, and localized copy. */
export type ArchivedSessionsSectionProps = PropsRuntime<'settings.section'>
  & InjectFace<ArchivedSessionsSectionInjected>
  & PropsLocale<typeof NS>

/**
 * Format one instant for the active language.
 * @param instant - epoch milliseconds to render.
 * @param locale - BCP 47 tag the active dictionary declares.
 * @returns the medium date the row shows.
 */
function formatInstant(instant: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(instant)
}

/**
 * Render the archived-session list with its per-row actions and the bulk deletion.
 * @param props - the shell's close action, the row source, the commands, and localized copy.
 * @returns the management page.
 */
export function ArchivedSessionsSection({
  close, useRows, openSession, restoreSession, deleteSession, deleteExpiredSessions, t,
}: ArchivedSessionsSectionProps) {
  const rows = useRows(value => value)
  // One action at a time: a restore or deletion in flight disables every row's
  // buttons, and the failed control keeps its place with the reason beside it.
  const [pending, setPending] = useState<SessionId | null>(null)
  const [failed, setFailed] = useState<SessionId | null>(null)
  const [deletePhase, setDeletePhase] = useState<DeletePhase | undefined>(undefined)
  const restore = (sessionId: SessionId): void => {
    setPending(sessionId)
    setFailed(null)
    void restoreSession(sessionId).catch(() => { setFailed(sessionId) }).finally(() => { setPending(null) })
  }
  // An armed deletion disarms on a timer, and a failed one clears its message.
  useEffect(() => {
    if (deletePhase === undefined || deletePhase.state === 'pending') return
    const timer = setTimeout(
      () => { setDeletePhase(undefined) },
      deletePhase.state === 'armed' ? ARM_MS : FAILED_MS,
    )
    return () => { clearTimeout(timer) }
  }, [deletePhase])

  /**
   * Advance one deletion control: the first press arms it, the confirming
   * press runs the command and either clears the phase — the row leaves the
   * list through the archive set — or reports the refusal there.
   */
  const pressDelete = (key: string, run: () => Promise<void>): void => {
    if (deletePhase?.key !== key || deletePhase.state !== 'armed') {
      setDeletePhase({ key, state: 'armed' })
      return
    }
    setDeletePhase({ key, state: 'pending' })
    void run().then(
      () => { setDeletePhase(undefined) },
      () => { setDeletePhase({ key, state: 'failed' }) },
    )
  }

  // Eligibility is measured when the page renders; the Host checks the same
  // window again on the command, so a stale row can only delay a deletion.
  const now = Date.now()
  const dueCount = rows.filter(row => row.eligibleAt !== undefined && now >= row.eligibleAt).length
  const busy = pending !== null || deletePhase?.state === 'pending'

  return (
    <section className={css.section} aria-label={t('title')}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      {rows.length === 0
        ? <p className={css.empty} role="status">{t('empty')}</p>
        : <>
          {dueCount > 0 && <div className={css.bulk}>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => { pressDelete(BULK_KEY, deleteExpiredSessions) }}
            >
              {deletePhase?.key === BULK_KEY
                ? t(deletePhase.state === 'armed' ? 'deleteAllConfirm' : 'deleteAllFailed', { n: dueCount })
                : t('deleteAll', { n: dueCount })}
            </Button>
          </div>}
          <ul className={css.rows} aria-label={t('title')}>
            {rows.map((row) => {
              const due = row.eligibleAt !== undefined && now >= row.eligibleAt
              const phase = deletePhase?.key === row.sessionId ? deletePhase.state : undefined
              const deleteLabel = !due && row.eligibleAt !== undefined
                ? t('deleteLocked', { date: formatInstant(row.eligibleAt, t('date.locale')) })
                : phase === 'armed' ? t('deleteAgain') : phase === 'failed' ? t('deleteFailed') : t('delete')
              return <li key={row.sessionId} className={css.row}>
                <div className={css.rowText}>
                  <span className={css.rowTitle}>{row.title}</span>
                  <span className={css.rowMeta}>
                    {row.workspace ?? t('ungrouped')}
                    {row.archivedAt === undefined
                      ? null
                      : <>{' · '}{t('archivedOn')}{' '}{formatInstant(row.archivedAt, t('date.locale'))}</>}
                  </span>
                  {failed === row.sessionId && <span className={css.rowError} role="alert">{t('restoreFailed')}</span>}
                </div>
                <div className={css.rowActions}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      openSession(row.sessionId)
                      close()
                    }}
                  >
                    {t('open')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => { restore(row.sessionId) }}
                  >
                    {pending === row.sessionId ? t('restoring') : t('restore')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !due}
                    aria-label={deleteLabel}
                    title={deleteLabel}
                    onClick={() => { pressDelete(row.sessionId, () => deleteSession(row.sessionId)) }}
                  >
                    {phase === 'armed' ? t('deleteConfirm')
                      : phase === 'pending' ? t('deleting')
                        : phase === 'failed' ? t('deleteFailed') : t('delete')}
                  </Button>
                </div>
              </li>
            })}
          </ul>
        </>}
    </section>
  )
}
