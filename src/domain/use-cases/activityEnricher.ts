// src/domain/use-cases/activityEnricher.ts
import { IAppRepo } from "../ports/out/IAppRepo.js";
import { classifyActivityCategory, type ActivityCategory } from "../models/activityCategoryPolicy.js";
import { classifyVideoCategory, type VideoCategory } from "../models/videoClassifierPolicy.js";
import { isVideoLikeHost } from "../models/mediaSignals.js";
import { OllamaClient } from "../../adapters/out/OllamaClient.js";

function mergeCoarseWithVideo(coarse: ActivityCategory, video: VideoCategory): ActivityCategory {
  return video;
}

export class ActivityEnricher {
  private timer: NodeJS.Timeout | null = null;

  constructor(private appRepo: IAppRepo, private llm: OllamaClient) {
    console.log('[Enricher] constructed — auto-starting');
    this.start(); 
  }

  start() {
    if (this.timer) return;
    console.log('[Enricher] starting 5s timer');
    this.timer = setInterval(() => this.runBatch().catch(e => console.error('[Enricher] batch error', e)), 30000);
    this.runBatch().catch(e => console.error('[Enricher] first run error', e)); 
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runBatch() {
  const raws = await this.appRepo.getRawActivities(100);
  if (raws.length) console.log(`[Enricher] tick: ${raws.length} raw`);

  for (const r of raws) {
    try {
      const title = (r as any).title?? (r as any).windowTitle?? '';
        const domain = (r.domain?? undefined) as string | undefined;

      let category: ActivityCategory =
        (this.appRepo.getCachedCategory(title, domain) as ActivityCategory)??
        classifyActivityCategory(title, domain?? null);

      if (domain && isVideoLikeHost(domain)) {
        const deps = {
          llm: this.llm,
          getCached: async (t: string, d?: string) =>
            this.appRepo.getCachedCategory(t, d),
          putCached: async (t: string, d: string | undefined, cat: VideoCategory) =>
            this.appRepo.cacheCategory(t, d, cat),
        };
        const videoCat = await classifyVideoCategory(deps, title, domain);
        category = mergeCoarseWithVideo(category, videoCat);
      }

      // 1) mark activity as processed (always)
      await this.appRepo.updateActivityCategory(r.id, category);

      // 2) cache the title → category mapping (only if title exists)
      if (title && title.trim()) {
        await this.appRepo.cacheCategory(title, domain, category);
      }

    } catch (err) {
      console.error('[Enricher] failed on id', r.id, err);
    }
  }
}
}