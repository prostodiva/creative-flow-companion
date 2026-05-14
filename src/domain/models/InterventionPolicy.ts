import { config } from "../../infrastructure/config.js";
import { InterventionSignals } from "../ports/out/InternventionSignals.js";
import { InterventionState } from "./InterventionState.js";

export class InterventionPolicy {
  constructor(private readonly state: InterventionState) {}

  shouldIntervene(signals: InterventionSignals): boolean {
    const { lastCommitMinutes, chromeTabCount, keystrokesLast5Min } = signals;

    const basicTrigger =
      lastCommitMinutes > config.COMMIT_IDLE_MINUTES ||
      chromeTabCount >= config.TAB_OVERLOAD_THRESHOLD ||
      keystrokesLast5Min === 0;

    return basicTrigger && this.state.canFire();
  }
}
