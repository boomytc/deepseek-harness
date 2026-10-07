/**
 * The Skills page: the user-invocable skills of the Session the main view
 * retains, with a local name/description filter.
 *
 * The page owns no read of its own — the injected catalog source follows the
 * Session and publishes one snapshot — so this component only renders states:
 * no open Session, a read in flight, a failed read with its retry, a settled
 * empty list, and a filter that matched nothing. Rows open their provider's
 * `SKILL.md` in the right Sidebar; a skill without a file path stays a plain
 * row, because there is nothing to open.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  Button, IconCloseOutlineRegular, IconSearchOutlineRegular, IconSkillOutlineRegular, IconWarningOutlineRegular, Input, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { SkillsPanelSnapshot, SkillsPanelStatus } from './skills-panel-source.ts'
import css from './SkillsPanel.module.css'

/** Catalog source and actions the Skills page receives. */
export interface SkillsPanelInjected {
  /** Catalog of the Session the main view retains. */
  readonly hooks: { readonly catalog: HostObservable<SkillsPanelSnapshot> }
  /** Read the current Session's catalog again after a failed read. */
  readonly onRetry: () => void
  /** Open one skill's `SKILL.md` in the right Sidebar. */
  readonly onOpenSkill: (skill: SkillEntry) => void
}

/** Root-scoped main-panel props: the framework share, the injected catalog, and localized copy. */
export type SkillsPanelProps = PropsRuntime<'main'>
  & InjectFace<SkillsPanelInjected>
  & PropsLocale<'skill'>

/** Whether a skill matches the filter in its name, description, or routing note. */
function matches(skill: SkillEntry, query: string): boolean {
  return skill.name.toLowerCase().includes(query)
    || skill.description.toLowerCase().includes(query)
    || (skill.whenToUse?.toLowerCase().includes(query) ?? false)
}

/** One row's content, shared by the openable button and the plain skill row. */
function SkillRowContent({ skill, t }: { skill: SkillEntry; t: PropsLocale<'skill'>['t'] }) {
  return <>
    <IconSkillOutlineRegular className={css.rowGlyph} />
    <span className={css.rowContent}>
      <span className={css.rowTitle}>{`/${skill.name}`}</span>
      <span className={css.rowDescription}>
        {/* The user-only marker rides the description, as in the `/` menu: it is
            the row's only secondary text, and `hint` there is ghost text. */}
        {!skill.modelInvocable && <>{t('menu.userOnly')}{' · '}</>}
        {skill.description}
      </span>
    </span>
  </>
}

/**
 * Render the current Session's skills.
 * @param props - injected catalog source and actions plus localized copy.
 * @returns the searchable skill list and its read states.
 */
export function SkillsPanel({ useCatalog, onRetry, onOpenSkill, t }: SkillsPanelProps) {
  const catalog = useCatalog(snapshot => snapshot)
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const rows = useMemo(
    () => query === '' ? catalog.skills : catalog.skills.filter(skill => matches(skill, query)),
    [catalog.skills, query],
  )
  // The filter addresses a settled list: states without one show no field.
  const searchable = catalog.status === 'ready' && catalog.skills.length > 0
  const state: SkillsPanelStatus | 'no-match' = searchable && rows.length === 0 ? 'no-match' : catalog.status

  return (
    <section className={css.page} aria-label={t('panel.title')} data-testid="skills-panel">
      <div className={css.pageScroll}>
        <div className={css.pageContent}>
          <div className={css.pageHeading}>
            <h1>{t('panel.title')}</h1>
          </div>
          {searchable && <div className={css.searchField}>
            <Input
              type="search"
              icon={<IconSearchOutlineRegular />}
              aria-label={t('panel.search.label')}
              placeholder={t('panel.search.placeholder')}
              value={search}
              onChange={(event) => { setSearch(event.target.value) }}
            />
            {search !== '' && <Button
              size="sm"
              className={css.searchClear}
              aria-label={t('panel.search.clear')}
              onClick={() => { setSearch('') }}
            >
              <IconCloseOutlineRegular />
            </Button>}
          </div>}
          {state === 'loading' && <div className={css.empty} role="status" aria-label={t('panel.loading')}>
            <StateDot state="ongoing" />
          </div>}
          {state === 'error' && <div className={css.empty}>
            <IconWarningOutlineRegular size={24} className={css.emptyGlyph} />
            <p role="alert" className={css.emptyTitle}>{t('panel.error')}</p>
            <Button variant="outline" className={css.emptyAction} onClick={onRetry}>{t('panel.retry')}</Button>
          </div>}
          {state === 'no-session' && <div className={css.empty} role="status">
            <IconSkillOutlineRegular size={24} className={css.emptyGlyph} />
            <p className={css.emptyTitle}>{t('panel.noSession.title')}</p>
            <p className={css.emptyHint}>{t('panel.noSession.hint')}</p>
          </div>}
          {state === 'ready' && catalog.skills.length === 0 && <div className={css.empty} role="status">
            <IconSkillOutlineRegular size={24} className={css.emptyGlyph} />
            <p className={css.emptyTitle}>{t('panel.empty')}</p>
          </div>}
          {state === 'no-match' && <div className={css.empty} role="status">
            <IconSkillOutlineRegular size={24} className={css.emptyGlyph} />
            <p className={css.emptyTitle}>{t('panel.noMatch')}</p>
          </div>}
          {rows.length > 0 && <ul className={css.listRows} aria-label={t('panel.list.label')}>
            {rows.map(skill => (
              <li key={skill.name}>
                {skill.path === undefined
                  ? <div className={css.row}><SkillRowContent skill={skill} t={t} /></div>
                  : <Button
                    className={clsx(css.row, css.openableRow)}
                    onClick={() => { onOpenSkill(skill) }}
                  >
                    <SkillRowContent skill={skill} t={t} />
                  </Button>}
              </li>
            ))}
          </ul>}
        </div>
      </div>
    </section>
  )
}
