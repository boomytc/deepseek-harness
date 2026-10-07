/** `skill` namespace dictionaries for the dedicated tool row and the Skills page. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'skill'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'row.title': '加载技能',
  'row.running': '正在加载 skill',
  'row.preparing': '准备加载技能',
  'row.failed': 'skill 加载失败',
  'row.stopped': 'skill 加载已中止',
  'row.instructions': '说明',
  'row.inspect': '查看',
  'menu.userOnly': '仅用户',
  'panel.title': '技能',
  'panel.search.label': '搜索技能',
  'panel.search.placeholder': '搜索技能',
  'panel.search.clear': '清除搜索',
  'panel.list.label': '可用技能',
  'panel.loading': '正在加载技能',
  'panel.error': '技能加载失败',
  'panel.retry': '重试',
  'panel.empty': '此会话当前没有可用技能',
  'panel.noMatch': '没有匹配的技能',
  'panel.noSession.title': '尚未打开会话',
  'panel.noSession.hint': '打开一个会话后查看它的可用技能',
} satisfies Record<string, string>

/** The skill namespace key union. */
export type SkillKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'row.title': 'Skill',
  'row.running': 'Loading skill',
  'row.preparing': 'Preparing to load a skill',
  'row.failed': 'Skill load failed',
  'row.stopped': 'Skill load stopped',
  'row.instructions': 'Instructions',
  'row.inspect': 'Inspect',
  'menu.userOnly': 'user-only',
  'panel.title': 'Skills',
  'panel.search.label': 'Search skills',
  'panel.search.placeholder': 'Search skills',
  'panel.search.clear': 'Clear search',
  'panel.list.label': 'Available skills',
  'panel.loading': 'Loading skills',
  'panel.error': 'Skills could not be loaded',
  'panel.retry': 'Retry',
  'panel.empty': 'This session has no available skills',
  'panel.noMatch': 'No skill matches this search',
  'panel.noSession.title': 'No session open',
  'panel.noSession.hint': 'Open a session to see the skills it can use',
} satisfies Record<SkillKey, string>
