// policy/mediaDomains.ts — shared constants only (no Ollama, no DB)

/** Hostnames used for "this tab is plausibly video-like" heuristics */
export const VIDEO_HOST_SUBSTRINGS = [
  "youtube.com",
  "netflix.com",
  "hulu.com",
  "disneyplus.com",
  "primevideo.com",
  "twitch.tv",
  "vimeo.com",
] as const;

/** Hostnames that strongly imply entertainment (coarse category) */
export const ENTERTAINMENT_HOSTS = new Set([
  "youtube.com",
  "youtu.be",
  "netflix.com",
  "twitch.tv",
  "hulu.com",
  "disneyplus.com",
  "primevideo.com",
]);

export const WORK_HOSTS = new Set([
  "meta.ai",
  "claude.ai",
  "chat.openai.com",
  "github.com",
  "localhost",
]);
