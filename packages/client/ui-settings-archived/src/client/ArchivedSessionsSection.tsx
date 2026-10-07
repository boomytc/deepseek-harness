/**
 * Archived sessions settings page: every Session the registry-global archive
 * set holds, newest update first. Opening one returns to its conversation —
 * an archived Session stays readable — and Restore drops it from the set
 * without touching its log, which is why the page never offers deletion.
 */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ArchivedSessionRow } from './archived-rows.ts'
import { NS } from './locales.ts'
import css from './ArchivedSessionsSection.module.css'

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
}

/** Settings-section props: the shell's close action, the rows, and localized copy. */
export type ArchivedSessionsSectionProps = PropsRuntime<'settings.section'>
  & InjectFace<ArchivedSessionsSectionInjected>
  & PropsLocale<typeof NS>

/**
 * Format one update instant for the active language.
 * @param updatedAt - epoch milliseconds of the Session's last update.
 * @param locale - BCP 47 tag the active dictionary declares.
 * @returns the medium date the row shows.
 */
function formatUpdated(updatedAt: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(updatedAt)
}

/**
 * Render the archived-session list with its two actions per row.
 * @param props - the shell's close action, the row source, the commands, and localized copy.
 * @returns the management page.
 */
export function ArchivedSessionsSection({
  close, useRows, openSession, restoreSession, t,
}: ArchivedSessionsSectionProps) {
  const rows = useRows(value => value)
  // One action at a time: a restore in flight disables every row's button, and
  // the failed row keeps its place with the reason beside it.
  const [pending, setPending] = useState<SessionId | null>(null)
  const [failed, setFailed] = useState<SessionId | null>(null)
  const restore = (sessionId: SessionId): void => {
    setPending(sessionId)
    setFailed(null)
    void restoreSession(sessionId).catch(() => { setFailed(sessionId) }).finally(() => { setPending(null) })
  }

  return (
    <section className={css.section} aria-label={t('title')}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      {rows.length === 0
        ? <p className={css.empty} role="status">{t('empty')}</p>
        : <ul className={css.rows} aria-label={t('title')}>
          {rows.map(row => <li key={row.sessionId} className={css.row}>
            <div className={css.rowText}>
              <span className={css.rowTitle}>{row.title}</span>
              <span className={css.rowMeta}>
                {row.workspace ?? t('ungrouped')}{' · '}{formatUpdated(row.updatedAt, t('date.locale'))}
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
                disabled={pending !== null}
                onClick={() => { restore(row.sessionId) }}
              >
                {pending === row.sessionId ? t('restoring') : t('restore')}
              </Button>
            </div>
          </li>)}
        </ul>}
    </section>
  )
}
