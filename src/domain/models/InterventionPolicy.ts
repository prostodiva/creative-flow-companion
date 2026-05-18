import { InterventionSignal } from "../ports/out/InternventionSignals.js";

export class InterventionPolicy {
  shouldIntervene(signal: InterventionSignal): boolean {
    return signal !== "none";
  }
}