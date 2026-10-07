/**
 * Archived sessions settings plugin, browser half: the section that lists the
 * registry-global archive set with a per-row Open and Restore, registered into
 * the Settings dialog's section list.
 *
 * The page owns no read of its own — the injected source follows the Session
 * list and the Workspace snapshot and publishes one settled row list — so the
 * component only renders states and raises commands.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
// Type-only: pulls the Controller service merges.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: declares the `settings.section` list this entry registers into.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: declares the `uiWorkspace` navigation service and its standard hooks.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { ArchivedSessionsSection, type ArchivedSessionsSectionInjected } from './ArchivedSessionsSection.tsx'
import { createArchivedSessionsSource } from './archived-rows.ts'
import { en, NS, zh, type ArchivedSessionsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Archived sessions settings page copy. */
    'settings.archived': ArchivedSessionsKey
  }
}

/** Required services: the Settings section registry, both controllers, and Session navigation. */
export const inject = ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace']

/**
 * Client plugin body: register the dictionaries and the Archived sessions page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-archived: dictionaries')
  const sessions = ctx.get('sessions') as ISessions
  const workspaces = ctx.get('workspaces') as IWorkspaces
  const source = createArchivedSessionsSource(sessions.list, workspaces.list)
  ctx.effect(() => () => { source.dispose() }, 'ui-settings-archived: archived rows')
  const t = ctx.locale.bind(NS)

  const injected = (): ArchivedSessionsSectionInjected => ({
    hooks: { rows: source.hooks.rows },
    // Opening goes through the navigation service, so the Settings panel
    // closes onto a real main-view reference rather than a bare id.
    openSession: (sessionId) => { ctx.uiWorkspace.openSession(sessionId) },
    restoreSession: sessionId => ctx.uiWorkspace.unarchiveSession(sessionId),
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'archived-sessions',
    // After General (0) and before Models (10): the Sessions a person archived
    // are their own history, not a deployment-wide preference.
    order: 5,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, ArchivedSessionsSection))
}
