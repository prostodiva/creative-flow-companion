// Business logic extracted from AppRepo — repos only do data access.

export type ActivityCategory = 'entertainment' | 'work' | 'unknown'

const ENTERTAINMENT_DOMAINS = new Set([
  'youtube.com', 'youtu.be', 'netflix.com', 'twitch.tv',
  'hulu.com', 'disneyplus.com', 'primevideo.com',
])

const WORK_DOMAINS = new Set([
  'meta.ai', 'claude.ai', 'chat.openai.com',
  'github.com', 'localhost',
])

const WORK_TITLE_PATTERN = /github|vscode|cursor|stack overflow/i

export function classifyTitle(
  title: string,
  domain: string | null,
): ActivityCategory {
  const d = (domain ?? '').toLowerCase()

  if (ENTERTAINMENT_DOMAINS.has(d)) return 'entertainment'
  if (WORK_DOMAINS.has(d))         return 'work'
  if (WORK_TITLE_PATTERN.test(title)) return 'work'

  return 'unknown'
}