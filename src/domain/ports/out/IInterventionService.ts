/**
 *
 * The interface is used by orchestrator.ts
 * The orchestrator only calls .fire() — it doesn't need to know about WebSockets, OS notifications,
 * or any of the implementation. An interface with one method is all it needs.
 *
 * Intervention is used by intervention.service
 */

import { Severity } from "../../models/Severity.js";

export interface IInterventionService {
  fire(
    rule: string,
    severity: Severity,
    payload: InterventionPayload

  ): IIntervention;

}

export interface InterventionPayload {
  speech: string;        // spoken via TTS (say)
  notification: string;  // UI toast (node-notifier)
}

export interface IIntervention {
  id: string;
  rule: string;
  severity: Severity;
  ts: number;

  speech: string;
  notification: string;
}