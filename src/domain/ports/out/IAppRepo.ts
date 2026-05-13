import { AppActivity } from '../../../domain/models/activity.js';

export interface IAppRepo {
  insertMany(activities: AppActivity[]): void
  getVideoConsumptionTotalByCategory(fromMs: number, toMs: number, category: string): number
  getChromeTabCount(fromMs: number): number
  getCurrentApp(): string | null
  getCachedCategory(title: string, domain?: string): string | null
  cacheCategory(title: string, domain: string | undefined, category: string): void
}