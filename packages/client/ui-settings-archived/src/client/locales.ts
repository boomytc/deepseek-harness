/**
 * `settings.archived` namespace dictionaries for the Archived sessions page.
 * The date formatter's locale id is copy too: `Intl` needs a BCP 47 tag, and
 * the active language owns which one the rows read.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.archived'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  nav: '已归档',
  title: '已归档会话',
  intro: '这些会话保留完整记录。打开可以查看，恢复后才能继续对话。',
  empty: '暂无已归档会话',
  archivedOn: '已归档于',
  ungrouped: '未分组',
  open: '打开',
  restore: '恢复',
  restoring: '正在恢复…',
  restoreFailed: '恢复失败，请重试',
  'date.locale': 'zh-CN',
} satisfies Record<string, string>

/** The Archived sessions namespace key union. */
export type ArchivedSessionsKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  nav: 'Archived',
  title: 'Archived sessions',
  intro: 'These sessions keep their full record. Open one to read it; restore it to continue the conversation.',
  empty: 'No archived sessions',
  archivedOn: 'Archived',
  ungrouped: 'Ungrouped',
  open: 'Open',
  restore: 'Restore',
  restoring: 'Restoring…',
  restoreFailed: 'Restore failed. Try again.',
  'date.locale': 'en-US',
} satisfies Record<ArchivedSessionsKey, string>
