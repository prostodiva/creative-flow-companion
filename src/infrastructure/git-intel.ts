import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function formatNameStatus(stdout: string, limit: number): string {
  const lines = stdout
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, limit);

  if (lines.length === 0) return "No uncommitted changes";

  return lines.map((l) => l.replace(/\t+/g, " ").trim()).join(", ");
}

export async function getGitDiffSummary(cwd = process.cwd()): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--name-status"], {
      cwd,
      timeout: 2000,
    });
    return formatNameStatus(String(stdout ?? ""), 3);
  } catch {
    return "No git repo";
  }
}

export async function getTodoComments(cwd = process.cwd()): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["grep", "-n", "-E", "TODO|FIXME"],
      {
        cwd,
        timeout: 2000,
      },
    );

    return String(stdout ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((l) => {
        const parts = l.split(":");
        if (parts.length <= 2) return parts.slice(1).join(":").trim();
        return parts.slice(2).join(":").trim();
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
