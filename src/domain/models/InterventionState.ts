export class InterventionState {
  private lastInterventionTs = 0;

  constructor(private readonly cooldownMs: number) {
    console.log("InterventionState created", cooldownMs);
  }

  canFire(now: number = Date.now()): boolean {
    return now - this.lastInterventionTs >= this.cooldownMs;
  }

  remainingCooldownMs(now: number = Date.now()): number {
    const remaining = this.cooldownMs - (now - this.lastInterventionTs);
    return Math.max(0, remaining);
  }

  markFired(now: number = Date.now()): void {
    this.lastInterventionTs = now;
  }

  reset(): void {
    this.lastInterventionTs = 0;
  }
}
