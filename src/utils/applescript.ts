import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "../core/logger.js";

const execFileAsync = promisify(execFile);

export async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 5000,
    });
    return stdout.trim();
  } catch (err) {
    logger.error({ err }, "AppleScript execution failed");
    throw new Error(`AppleScript failed: ${err}`);
  }
}
