export type InterventionSignal =
  | "watching_video"
  | "paralysis"
  | "research_spiral"
  | "light_drift"
  | "long_session"
  | "none";

export function getInterventionSignal(params: {
  entertainmentVideoMs: number;
  lastCommitMinutes: number;
  keystrokesLast5Min: number;
  chromeTabCount: number;
  commitIdleMinutes: number;
  tabThreshold: number;
}): InterventionSignal {
  const {
    entertainmentVideoMs,
    lastCommitMinutes,
    keystrokesLast5Min,
    chromeTabCount,
    commitIdleMinutes,
    tabThreshold,
  } = params;

  if (entertainmentVideoMs > 20 * 60 * 1000) {
    return "watching_video";
  }

  if (
    lastCommitMinutes > 20 &&
    keystrokesLast5Min === 0
  ) {
    return "paralysis";
  }

  if (
    chromeTabCount >= tabThreshold &&
    keystrokesLast5Min === 0
  ) {
    return "research_spiral";
  }

  if (
    keystrokesLast5Min === 0 &&
    lastCommitMinutes > 10
    ) {
    return "light_drift";
  }

  if (
    lastCommitMinutes > 60 &&
    keystrokesLast5Min === 0
  ) {
    return "long_session";
  }

  return "none";
}