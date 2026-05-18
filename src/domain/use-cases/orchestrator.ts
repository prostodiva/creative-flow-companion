/**
 * The orchestrator coordinates all the other systems without doing the work itself.
 */

import { END, START, StateGraph } from "@langchain/langgraph";
import cron from "node-cron";
import { logger } from "../../infrastructure/logger.js";
import { InterventionPolicy } from "../models/InterventionPolicy.js";
import { InterventionState } from "../models/InterventionState.js";
import { StateAnnotation, TState } from "../models/orchestrationState.js";
import { IAppRepo } from "../ports/out/IAppRepo.js";
import { IIdeRepo } from "../ports/out/IIdeRepo.js";
import { IInterventionService } from "../ports/out/IInterventionService.js";
import { ILlmClient } from "../ports/out/ILlmClient.js";
import { retrieveMemory } from "./memoryRetriever.js";
import { config } from "../../infrastructure/config.js";
import { getInterventionSignal } from "../ports/out/InternventionSignals.js";

interface OrchestratorDeps {
  appRepo: IAppRepo;
  ideRepo: IIdeRepo;
  interventionService: IInterventionService;
  llm: ILlmClient;
  interventionState: InterventionState;
  interventionPolicy: InterventionPolicy;
}

function createNodes(deps: OrchestratorDeps) {

  const {
    appRepo,
    ideRepo,
    interventionService,
    llm,
    interventionState,
    interventionPolicy,
  } = deps;

  async function checkTelemetry(state: TState): Promise<Partial<TState>> {
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;

    const entertainmentVideoMs = appRepo.getVideoConsumptionTotalByCategory(
      oneHourAgo,
      now,
      "entertainment",
    );

    const chromeTabCount = appRepo.getChromeTabCount(now - 60000) ?? 0;
    const activeApp = appRepo.getCurrentApp() ?? "Unknown";

    const [lastCommit, keystrokes, recentFiles, gitDiffSummary, todoList] =
      await Promise.all([
        ideRepo.getLastCommitTs(),
        ideRepo.getKeystrokeCountSince(fiveMinAgo),
        ideRepo.getRecentlyTouchedFiles(3),
        ideRepo.getGitDiffSummary(),
        ideRepo.getTodoComments(),
      ]);

    const lastCommitMinutes = lastCommit ? Math.floor((now - lastCommit) / 60000) : 999;
    const keystrokesLast5Min = keystrokes ?? 0;

    const signal = getInterventionSignal({
      entertainmentVideoMs,
      lastCommitMinutes,
      keystrokesLast5Min,
      chromeTabCount,
      commitIdleMinutes: config.COMMIT_IDLE_MINUTES,
      tabThreshold: config.TAB_OVERLOAD_THRESHOLD,
    });

    const shouldIntervene = interventionPolicy.shouldIntervene(signal);


    logger.info(
      {
        chromeTabCount,
        lastCommitMinutes,
        keystrokesLast5Min,
        activeApp,
      },
      "Telemetry check",
    );

    return {
      chromeTabCount,
      lastCommitMinutes,
      keystrokesLast5Min,
      activeApp,
      shouldIntervene,
      recentFiles: recentFiles ?? [],
      gitDiffSummary: gitDiffSummary ?? "No changes",
      todoList: todoList ?? [],
      retrievedHistory: [],
      entertainmentVideoMs,
    };
  }

  async function retrieveMemoryNode(state: TState): Promise<Partial<TState>> {
    const history = await retrieveMemory({
      activeApp: state.activeApp,
      recentFiles: state.recentFiles,
      entertainmentVideoMs: state.entertainmentVideoMs,
      commitCount: state.lastCommitMinutes < 999 ? 1 : 0,
    });

    return { retrievedHistory: history };
  }

  async function buildPrompt(state: TState): Promise<Partial<TState>> {
    const entMin = Math.floor(state.entertainmentVideoMs / 60000);

    const behavioralContext =
      entMin >= 1
        ? `Avoiding work: ${entMin}m entertainment video watched`
        : `Task paralysis: ${state.chromeTabCount} tabs, ${state.lastCommitMinutes}m no commits`;

    const historyBlock =
      state.retrievedHistory.length > 0
        ? state.retrievedHistory.map((h, i) => `${i + 1}. ${h}`).join("\n")
        : "No similar past sessions found yet.";

    const SYSTEM_PROMPT = `You are a calm, direct senior engineer giving short behavioral interventions.

    CURRENT BEHAVIOR:
    ${behavioralContext}

    Active app: ${state.activeApp}
    Recent files: ${state.recentFiles.join(', ') || 'none'}
    Git status: ${state.gitDiffSummary}
    TODOs: ${state.todoList.slice(0, 2).join(' | ') || 'none'}

    PAST PATTERNS:
    ${historyBlock}

    TASK:

    Generate two outputs:

    1) speech:
    - natural spoken American English
    - max 20 words
    - one sentence
    - must feel human, not formatted

    2) notification:
    - ultra short
    - max 8 words
    - no punctuation needed
    - readable at a glance

    RULES:

    - no labels
    - no markdown
    - no extra text

    NOW RESPOND:`;

    return { interventionPrompt: SYSTEM_PROMPT };
  }

  async function callLlama(state: TState): Promise<Partial<TState>> {
    if (!state.interventionPrompt) return {};

    if (!interventionState.canFire()) {
    logger.debug({
      remainingMs: interventionState.remainingCooldownMs()
    }, "Cooldown active - skipping LLM");
    return {};
  }

    let response: string;

    try {
      response = await llm.invoke(state.interventionPrompt);
    } catch (e) {
      logger.error({ e }, "LLM failed");
      return {};
    }

    if (!response?.trim()) return {};

    const speech = response.replace(/^"|"$/g, "").trim();
    const firstSentence = speech.split(".")[0] ?? speech;
    const notification = firstSentence.split(",")[0] ?? firstSentence;
    const finalNotification = notification.slice(0, 60);

    interventionService.fire("trigger", "high", {
      speech,
      notification: finalNotification,
    });

    interventionState.markFired();
    console.log("STATE INSTANCE ID", interventionState);

    logger.warn({
      canFire: interventionState.canFire(),
      remaining: interventionState.remainingCooldownMs()
    });
    

    return {};
  }

  return {
    checkTelemetry,
    retrieveMemoryNode,
    buildPrompt,
    callLlama,
  };
}

function createOrchestrator(deps: OrchestratorDeps) {
  const { checkTelemetry, retrieveMemoryNode, buildPrompt, callLlama } =
    createNodes(deps);

  return new StateGraph(StateAnnotation)
    .addNode("check", checkTelemetry)
    .addNode("retrieveMemory", retrieveMemoryNode)
    .addNode("prompt", buildPrompt)
    .addNode("intervene", callLlama)
    .addEdge(START, "check")
    .addConditionalEdges("check", (state) =>
      state.shouldIntervene ? "retrieveMemory" : "__end__",
    )
    .addEdge("retrieveMemory", "prompt")
    .addEdge("prompt", "intervene")
    .addEdge("intervene", END)
    .compile();
}

/**
 * Cron runner (unchanged, safe)
 */
let cronJob: cron.ScheduledTask | null = null;

export function startOrchestrationLoop(deps: OrchestratorDeps) {
  const orchestrator = createOrchestrator(deps);

  //set up for testing - 30 sec. change later to 10 minutes: 0 */10 * * * *
  cronJob = cron.schedule("*/30 * * * * *", async () => {
    try {
      await orchestrator.invoke({
        chromeTabCount: 0,
        lastCommitMinutes: 0,
        keystrokesLast5Min: 0,
        activeApp: "",

        entertainmentVideoMs: 0,
        workVideoMs: 0,

        shouldIntervene: false,
        interventionPrompt: undefined,

        recentFiles: [],
        gitDiffSummary: "",
        todoList: [],
        retrievedHistory: [],
      });
    } catch (err) {
      logger.error({ err }, "Orchestration loop failed");
    }
  });
}

export function stopOrchestrationLoop() {
  cronJob?.stop();
}
