import { config } from "../../infrastructure/config.js";
import { InterventionSignals } from "../ports/out/InternventionSignals.js";

export class InterventionPolicy {

  shouldIntervene(signals: InterventionSignals): boolean {
    const {
      lastCommitMinutes,
      chromeTabCount,
      keystrokesLast5Min,
      entertainmentVideoMs,
    } = signals;

    // Distraction: watching entertainment during work time
    const isWatchingVideo =
      entertainmentVideoMs > 20 * 60 * 1000;

    // Paralysis: not typing AND not shipping
    const isParalysed =
      lastCommitMinutes > config.COMMIT_IDLE_MINUTES &&
      keystrokesLast5Min === 0;

    // Research spiral: too many tabs, no output
    const isResearchSpiral =
      chromeTabCount >= config.TAB_OVERLOAD_THRESHOLD &&
      keystrokesLast5Min === 0;

    // Long session with no checkpoint
    const isLongSessionNoCommit =
      lastCommitMinutes > 120;

    return (
      isWatchingVideo     ||
      isParalysed         ||
      isResearchSpiral    ||
      isLongSessionNoCommit
    );
  }
}