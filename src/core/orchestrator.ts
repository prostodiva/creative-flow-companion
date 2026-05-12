import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { Ollama } from "@langchain/ollama";
import { logger } from "./logger.js";
import cron from "node-cron";
import type { AppRepo } from "../repos/app.repo.js";
import type { IdeRepo } from "../repos/ide.repo.js";
import type { InterventionService } from "./intervention.service.js";
import { retrieveMemory } from "./memoryRetriever.js";
import chalk from "chalk";
import { config } from "./config.js";

interface OrchestratorDeps {
  appRepo: AppRepo;
  ideRepo: IdeRepo;
  interventionService: InterventionService;
}

const StateAnnotation = Annotation.Root({
  chromeTabCount: Annotation<number>(),
  lastCommitMinutes: Annotation<number>(),
  keystrokesLast5Min: Annotation<number>(),
  activeApp: Annotation<string>(),
  entertainmentVideoMs: Annotation<number>(),
  workVideoMs: Annotation<number>(),
  shouldIntervene: Annotation<boolean>(),
  interventionPrompt: Annotation<string | undefined>(),
  recentFiles: Annotation<string[]>(),
  gitDiffSummary: Annotation<string>(),
  todoList: Annotation<string[]>(),
  retrievedHistory: Annotation<string[]>(),
});

type TState = typeof StateAnnotation.State;

let lastInterventionTs = 0;
const COOLDOWN_MS = config.INTERVENTION_COOLDOWN_MS;

function createNodes(deps: OrchestratorDeps) {
  const { appRepo, ideRepo, interventionService } = deps;

  async function checkTelemetry(state: TState): Promise<Partial<TState>> {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const fiveMinAgo = now - 5 * 60 * 1000;

    const chromeTabCount       = appRepo.getChromeTabCount(now - 60000) ?? 0
    const activeApp            = appRepo.getCurrentApp() ?? 'Unknown'
    const entertainmentVideoMs = appRepo.getVideoConsumptionTotalByCategory(oneHourAgo, now, 'entertainment')
    const workVideoMs          = appRepo.getVideoConsumptionTotalByCategory(oneHourAgo, now, 'work')

    const [lastCommit, keystrokes, recentFiles, gitDiffSummary, todoList] = await Promise.all([
      ideRepo.getLastCommitTs(),
      ideRepo.getKeystrokeCountSince(fiveMinAgo),
      ideRepo.getRecentlyTouchedFiles(3),
      ideRepo.getGitDiffSummary(),
      ideRepo.getTodoComments(),
    ])

    const lastCommitMinutes = lastCommit
      ? Math.floor((now - lastCommit) / 60000)
      : 999;
    const keystrokesLast5Min = keystrokes ?? 0;

    const shouldIntervene =
      entertainmentVideoMs >= config.VIDEO_IDLE_MINUTES * 60 * 1000 ||
      (lastCommitMinutes > config.COMMIT_IDLE_MINUTES &&
        chromeTabCount >= config.TAB_OVERLOAD_THRESHOLD &&
        keystrokesLast5Min === 0);
//uncomment for testing firing
    // const shouldIntervene = true;

    // Add this log right after
    console.log("SHOULD_INTERVENE:", shouldIntervene, {
      entertainmentVideoMs,
      threshold: config.VIDEO_IDLE_MINUTES * 60 * 1000,
      entMin: Math.floor(entertainmentVideoMs / 60000),
      lastCommitMinutes,
      commitThreshold: config.COMMIT_IDLE_MINUTES,
      chromeTabCount,
      tabThreshold: config.TAB_OVERLOAD_THRESHOLD,
      keystrokesLast5Min,
    });

    logger.info(
      {
        chromeTabCount,
        lastCommitMinutes,
        keystrokesLast5Min,
        entertainmentMin: Math.floor(entertainmentVideoMs / 60000),
        workMin: Math.floor(workVideoMs / 60000),
        recentFiles,
        shouldIntervene,
      },
      "Telemetry check",
    );

    return {
      chromeTabCount,
      lastCommitMinutes,
      keystrokesLast5Min,
      activeApp,
      entertainmentVideoMs,
      workVideoMs,
      shouldIntervene,
      recentFiles: recentFiles ?? [],
      gitDiffSummary: gitDiffSummary ?? "No changes",
      todoList: todoList ?? [],
      retrievedHistory: [],
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
    const isVideoTrigger = entMin >= 1;

    const behavioralContext = isVideoTrigger
      ? `Avoiding work: ${entMin}m entertainment video watched`
      : `Task paralysis: ${state.chromeTabCount} tabs open, ${state.lastCommitMinutes}m no commits, 0 keystrokes`;

    const historyBlock =
      state.retrievedHistory.length > 0
        ? state.retrievedHistory.map((h, i) => `${i + 1}. ${h}`).join("\n")
        : "No similar past sessions found yet.";

    const SYSTEM_PROMPT = `You are a senior Meta tech lead mentoring a staff engineer through flow-state blocks. You use CBT + first-principles debugging.

      CURRENT BEHAVIOR:
      Behavior: ${behavioralContext}
      Active app: ${state.activeApp}
      Recent files: ${state.recentFiles.join(", ") || "None — user is NOT coding"}
      Git status: ${state.gitDiffSummary}
      TODOs in code: ${state.todoList.slice(0, 2).join(" | ") || "None"}

      YOUR PAST PATTERNS (from memory):
      ${historyBlock}

      YOUR JOB:
      1. EMPATHIZE: In 1 short clause, name the emotional/technical state this telemetry implies. Be direct, human. Examples: "4h in the weeds with 0 commits is brutal", "Context-switch thrash", "Shipping anxiety"
      2. DIAGNOSE: Compare to past patterns. Name it like a postmortem: "Tutorial loop like Tuesday", "Infra yak-shaving, 3rd time this week"
      3. SHRINK: 
        - If files exist → pick ONE file. Give 1 concrete 15min unblock: "add the log line", "stub the function", "delete the dead code"
        - If no files → meta-task only: "write the diff summary", "define the API contract in 2 bullets"

      RULES:
      - Max 30 words total across all 3 parts
      - Technical + blunt. No corporate therapy speak. You can say "this is dumb" if the pattern is dumb
      - Use history to avoid hallucinating. If you cite a past pattern, it must be in history
      - If recent files is empty, NEVER mention a code file
      - Format: "[Empathy]. [Diagnosis]: 15min sprint - [action]"

      Examples with files:
      "Shipping anxiety with 0 commits. Yak-shaving like Monday: 15min sprint - commit the logging in memoryWriter.ts"
      "Stuck in the weeds. Tutorial loop like Tuesday: 15min sprint - delete one dead function in orchestrator.ts"

      Examples without files:
      "Decision paralysis after 4h idle. Analysis mode like last week: 15min sprint - write 1-sentence PR description"

      Your diagnosis + task:`;

    console.log(
      "PROMPT NODE: built, history entries=",
      state.retrievedHistory.length,
    );
    return { interventionPrompt: SYSTEM_PROMPT  };
  }

  async function callLlama(state: TState): Promise<Partial<TState>> {
    console.log("LLAMA NODE: entered, hasPrompt=", !!state.interventionPrompt);

    if (!state.interventionPrompt) {
      console.log("LLAMA NODE: skipped - no prompt");
      return {};
    }

    console.log("LLAMA NODE: calling Ollama...");

    const now = Date.now();
    if (now - lastInterventionTs < COOLDOWN_MS) {
      logger.info(
        { cooldownMs: COOLDOWN_MS - (now - lastInterventionTs) },
        "Intervention on cooldown",
      );
      return {};
    }

    try {
      const llm = new Ollama({
        baseUrl: config.OLLAMA_BASE_URL,
        model: config.OLLAMA_MODEL,
        temperature: 0.9,
      });

      const response = await llm.invoke(state.interventionPrompt);

      if (!response?.trim()) {
        logger.error("LLaMA returned empty response");
        return {};
      }

      const isVideoTrigger = state.entertainmentVideoMs >= 1 * 60 * 1000;
      const triggerType = isVideoTrigger ? "video-overload" : "tab-overload";
      const entMin = Math.floor(state.entertainmentVideoMs / 60000);
      const workMin = Math.floor(state.workVideoMs / 60000);

      console.log("\n" + chalk.red.bold("═".repeat(80)));
      console.log(chalk.red.bold("  FLOW INTERVENTION FIRED "));
      console.log(chalk.red.bold("═".repeat(80)));
      console.log(
        chalk.yellow.bold(`\n  Trigger: ${triggerType.toUpperCase()}`),
      );
      console.log(
        chalk.yellow(`  Entertainment: ${entMin}m | Work: ${workMin}m`),
      );
      console.log(chalk.yellow(`  Chrome tabs: ${state.chromeTabCount}`));
      console.log(
        chalk.yellow(
          `  Last commit: ${state.lastCommitMinutes}m ago | Keystrokes: ${state.keystrokesLast5Min}`,
        ),
      );
      console.log(
        chalk.yellow(
          `  History used: ${state.retrievedHistory.length} past session(s)`,
        ),
      );
      console.log(
        chalk.cyan.bold("\n  → ") + chalk.white.bold(response) + "\n",
      );
      console.log(chalk.red.bold("═".repeat(80)) + "\n");

      logger.warn(
        {
          intervention: response,
          triggerType,
          entMin,
          tabCount: state.chromeTabCount,
          historyCount: state.retrievedHistory.length,
        },
        "FLOW INTERVENTION FIRED",
      );

      interventionService.fire(triggerType, "high", response);
      lastInterventionTs = now;

      return {};
    } catch (err) {
      logger.error({ err }, "LLaMA call failed");
      console.error(chalk.red("LLAMA ERROR:"), err);
      return {};
    }
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

  const workflow = new StateGraph(StateAnnotation)
    .addNode("check", checkTelemetry)
    .addNode("retrieveMemory", retrieveMemoryNode)
    .addNode("prompt", buildPrompt)
    .addNode("intervene", callLlama)
    .addEdge(START, "check")
    .addConditionalEdges("check", (state) => {
      return state.shouldIntervene ? "retrieveMemory" : "__end__";
    })
    .addEdge("retrieveMemory", "prompt")
    .addEdge("prompt", "intervene")
    .addEdge("intervene", END);

  return workflow.compile();
}

let cronJob: cron.ScheduledTask | null = null;

export function startOrchestrationLoop(deps: OrchestratorDeps) {
  const orchestrator = createOrchestrator(deps);

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
  logger.info("Orchestration loop stopped");
}
