import { AppActivity } from '../../../domain/models/activity.js';

export type RawActivity = AppActivity & { id: number };
export interface IAppRepo {
  insertMany(activities: AppActivity[]): void
  getVideoConsumptionTotalByCategory(fromMs: number, toMs: number, category: string): number

  getRawActivities(limit: number): Promise<RawActivity[]>;
  updateActivityCategory(id: number, category: string): Promise<void>;

  getChromeTabCount(fromMs: number): number
  getCurrentApp(): string | null
  getCachedCategory(title: string, domain?: string): string | null
  cacheCategory(title: string, domain: string | undefined, category: string): void
}

