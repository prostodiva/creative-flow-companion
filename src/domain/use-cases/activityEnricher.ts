// src/domain/use-cases/activityEnricher.ts
import { IAppRepo } from "../ports/out/IAppRepo.js";
import { classifyActivityCategory, type ActivityCategory } from "../../policy/activityCategoryPolicy.js";
import { classifyVideoCategory, type VideoCategory } from "../../policy/videoClassifierPolicy.js";
import { isVideoLikeHost } from "../../policy/mediaSignals.js";
import type { Ollama } from "@langchain/ollama";

function mergeCoarseWithVideo(coarse: ActivityCategory, video: VideoCategory): ActivityCategory {
  return video;
}

export class ActivityEnricher {
  private timer: NodeJS.Timeout | null = null;

  constructor(private appRepo: IAppRepo, private llm: Ollama) {
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
        let category: ActivityCategory =
          (this.appRepo.getCachedCategory(r.windowTitle, r.domain) as ActivityCategory)??
          classifyActivityCategory(r.windowTitle, r.domain?? null);

        if (r.domain && isVideoLikeHost(r.domain)) {
          const deps = {
            llm: this.llm,
            getCached: async (title: string, domain?: string) =>
              this.appRepo.getCachedCategory(title, domain),
            putCached: async (title: string, domain: string | undefined, cat: VideoCategory) =>
              this.appRepo.cacheCategory(title, domain, cat),
          };
          const videoCat = await classifyVideoCategory(deps, r.windowTitle, r.domain);
          category = mergeCoarseWithVideo(category, videoCat);
        }

        await this.appRepo.updateActivityCategory(r.id, category);
        this.appRepo.cacheCategory(r.windowTitle, r.domain, category);
      } catch (err) {
        console.error('[Enricher] failed on id', r.id, err); 
      }
    }
  }
}