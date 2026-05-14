import { ENTERTAINMENT_HOSTS, WORK_HOSTS } from "./mediaDomains.js";

export type ActivityCategory = "entertainment" | "work" | "unknown";

const WORK_TITLE_PATTERN = /github|vscode|cursor|stack overflow/i;

export function classifyActivityCategory(
  title: string,
  domain: string | null,
): ActivityCategory {
  const d = (domain ?? "").toLowerCase();

  if (ENTERTAINMENT_HOSTS.has(d)) return "entertainment";
  if (WORK_HOSTS.has(d)) return "work";
  if (WORK_TITLE_PATTERN.test(title)) return "work";

  return "unknown";
}
