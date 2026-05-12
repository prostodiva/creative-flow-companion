import type { AppRepo } from "../repos/app.repo.js";

export class TelemetryService {
  constructor(private appRepo: AppRepo) {}

  getEntertainmentMs(fromMs: number, toMs: number) {
  return this.appRepo.getVideoConsumptionTotalByCategory(
    fromMs,
    toMs,
    "entertainment"
  );
}

  getWorkMs(oneHourAgo: number, now: number) {
    return this.appRepo.getVideoConsumptionTotalByCategory(
      oneHourAgo,
      now,
      "work"
    );
  }
}