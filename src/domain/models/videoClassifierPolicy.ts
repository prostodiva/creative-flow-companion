// async work vs entertainment (keywords + LLM)
import { WORK_HOSTS } from "./mediaDomains.js";
import { OllamaClient } from "../../adapters/out/OllamaClient.js";

export type VideoCategory = "work" | "entertainment";

export type VideoClassifierDeps = {
  llm: OllamaClient;
  getCached: (title: string, domain?: string) => Promise<string | null>;
  putCached: (
    title: string,
    domain: string | undefined,
    category: VideoCategory,
  ) => Promise<void>;
};

const WORK_KEYWORDS = [
  "tutorial",
  "course",
  "lecture",
  "react",
  "typescript",
  "python",
  "aws",
  "kubernetes",
  "algorithm",
];

const ENT_KEYWORDS = [
  "netflix",
  "movie",
  "episode",
  "anime",
  "trailer",
  "tv show",
  "documentary",
];

/** Map DB/cache strings to coarse video decision */
function cachedToVideoCategory(cached: string | null): VideoCategory | null {
  if (!cached) return null;
  if (cached === "work" || cached === "work_video") return "work";
  if (cached === "entertainment" || cached === "entertainment_video")
    return "entertainment";
  return null;
}

export async function classifyVideoCategory(
  deps: VideoClassifierDeps,
  title: string,
  domain?: string,
): Promise<VideoCategory> {
  const raw = await deps.getCached(title, domain);
  const fromCache = cachedToVideoCategory(raw);
  if (fromCache) return fromCache;

  const text = `${title} ${domain ?? ""}`.toLowerCase();
  const d = (domain ?? "").toLowerCase();

  if (
    domain &&
    WORK_HOSTS.has(d) &&
    WORK_KEYWORDS.some((k) => text.includes(k))
  ) {
    await deps.putCached(title, domain, "work");
    return "work";
  }

  const workScore = WORK_KEYWORDS.filter((k) => text.includes(k)).length;
  const entScore = ENT_KEYWORDS.filter((k) => text.includes(k)).length;

  if (workScore > entScore && workScore > 0) {
    await deps.putCached(title, domain, "work");
    return "work";
  }
  if (entScore > 0) {
    await deps.putCached(title, domain, "entertainment");
    return "entertainment";
  }

  try {
    const prompt = `Title: "${title}"\nDomain: ${domain ?? "unknown"}\n\nIs this educational/work content or entertainment? Reply one word: work or entertainment.`;
    const result = await deps.llm.invoke(prompt);
    const category: VideoCategory = result.toLowerCase().includes("work")
      ? "work"
      : "entertainment";
    await deps.putCached(title, domain, category);
    return category;
  } catch {
    return "entertainment";
  }
}
