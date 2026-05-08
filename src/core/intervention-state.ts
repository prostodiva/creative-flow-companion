export class InterventionState {
  private _lastInterventionTs = 0

  constructor(private readonly cooldownMs: number) {}

  canFire(now = Date.now()): boolean {
    return now - this._lastInterventionTs >= this.cooldownMs
  }

  remainingCooldownMs(now = Date.now()): number {
    const remaining = this.cooldownMs - (now - this._lastInterventionTs)
    return remaining > 0 ? remaining : 0
  }

  markFired(now = Date.now()): void {
    this._lastInterventionTs = now
  }
}

