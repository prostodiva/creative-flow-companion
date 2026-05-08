import { StateGraph, START, END, Annotation } from '@langchain/langgraph'
import { Ollama } from '@langchain/ollama'
import { logger } from './logger.js'
import cron from 'node-cron'
import type { AppRepo } from '../repos/app.repo.js'
import type { IdeRepo } from '../repos/ide.repo.js'
import type { InterventionService } from './intervention.service.js'
import chalk from 'chalk'
import { config } from './config.js'

interface OrchestratorDeps {
  appRepo: AppRepo
  ideRepo: IdeRepo
  interventionService: InterventionService
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
})

type TState = typeof StateAnnotation.State

let lastInterventionTs = 0
const COOLDOWN_MS = 10 * 60 * 1000

function createNodes(deps: OrchestratorDeps) {
  const { appRepo, ideRepo, interventionService } = deps

  async function checkTelemetry(state: TState): Promise<Partial<TState>> {
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    const fiveMinAgo = now - 5 * 60 * 1000

    const [tabs, lastCommit, keystrokes, currentApp, entertainmentVideoMs, workVideoMs] = await Promise.all([
      appRepo.getChromeTabCount(now - 60000),
      ideRepo.getLastCommitTs(),
      ideRepo.getKeystrokeCountSince(fiveMinAgo),
      appRepo.getCurrentApp(),
      appRepo.getVideoConsumptionMs(oneHourAgo, now, 'entertainment'),
      appRepo.getVideoConsumptionMs(oneHourAgo, now, 'work') 
    ])

    const chromeTabCount = tabs ?? 0
    const lastCommitMinutes = lastCommit ? Math.floor((now - lastCommit) / 60000) : 999
    const keystrokesLast5Min = keystrokes ?? 0
    const activeApp = currentApp ?? 'Unknown'

    const shouldIntervene =
      entertainmentVideoMs >= 1 * 60 * 1000 || 
      (lastCommitMinutes > 10 && chromeTabCount >= 10 && keystrokesLast5Min === 0)

    logger.info({ 
      chromeTabCount, 
      lastCommitMinutes, 
      keystrokesLast5Min,
      entertainmentMin: Math.floor(entertainmentVideoMs / 60000),
      workMin: Math.floor(workVideoMs / 60000)
    }, 'Telemetry check')

    return { 
      chromeTabCount, 
      lastCommitMinutes, 
      keystrokesLast5Min, 
      activeApp, 
      entertainmentVideoMs,
      workVideoMs,
      shouldIntervene 
    }
  }

  async function buildPrompt(state: TState): Promise<Partial<TState>> {
    if (!state.shouldIntervene) return {}

    const entMin = Math.floor(state.entertainmentVideoMs / 60000)
    const workMin = Math.floor(state.workVideoMs / 60000)
    const isVideoTrigger = entMin >= 1
    
    const trigger = isVideoTrigger
      ? `Watched ${entMin}m entertainment video, ${workMin}m work video in last hour`
      : `${state.chromeTabCount} Chrome tabs open, ${state.lastCommitMinutes}m since last git commit, 0 keystrokes in 5m`

    const prompt = `You are a brutal productivity coach. User is in distraction loop.

DATA: ${trigger}
APP: ${state.activeApp}

Rules:
1. Give exactly 1 physical action they can do in 30 seconds
2. Max 15 words
3. No "try to", "consider", "maybe". Use commands.
4. Reference their actual data

Examples:
"Close YouTube tab. Type git commit -m 'resume' now."
"Cmd+W 8 tabs. Open VSCode and type 1 comment."

Your command:`

    return { interventionPrompt: prompt }
  }

  async function callLlama(state: TState): Promise<Partial<TState>> {
    if (!state.interventionPrompt) return {}
    
    const now = Date.now()
    if (now - lastInterventionTs < COOLDOWN_MS) {
      logger.info({ cooldownMs: COOLDOWN_MS - (now - lastInterventionTs) }, 'Intervention on cooldown')
      return {}
    }

    try {
      const llm = new Ollama({
        baseUrl: config.get().OLLAMA_BASE_URL,
        model: config.get().OLLAMA_MODEL,
        temperature: 0.9
      })

      const response = await llm.invoke(state.interventionPrompt)
      
      if (!response?.trim()) {
        logger.error('LLaMA returned empty response')
        return {}
      }

      const isVideoTrigger = state.entertainmentVideoMs >= 1 * 60 * 1000
      const triggerType = isVideoTrigger ? 'video-overload' : 'tab-overload'
      const entMin = Math.floor(state.entertainmentVideoMs / 60000)
      const workMin = Math.floor(state.workVideoMs / 60000)
      
      console.log('\n' + chalk.red.bold('═'.repeat(80)))
      console.log(chalk.red.bold('  FLOW INTERVENTION FIRED '))
      console.log(chalk.red.bold('═'.repeat(80)))
      console.log(chalk.yellow.bold(`\n  Trigger: ${triggerType.toUpperCase()}`))
      console.log(chalk.yellow(`  Entertainment: ${entMin}m | Work: ${workMin}m`))
      console.log(chalk.yellow(`  Chrome tabs: ${state.chromeTabCount}`))
      console.log(chalk.yellow(`  Last commit: ${state.lastCommitMinutes}m ago | Keystrokes: ${state.keystrokesLast5Min}`))
      console.log(chalk.cyan.bold('\n  → ') + chalk.white.bold(response) + '\n')
      console.log(chalk.red.bold('═'.repeat(80)) + '\n')

      logger.warn({ 
        intervention: response, 
        triggerType,
        entMin,
        tabCount: state.chromeTabCount 
      }, 'FLOW INTERVENTION FIRED')
      
      interventionService.fire(triggerType, 'high', response)
      lastInterventionTs = now
      
      return {}
      
    } catch (err) {
      logger.error({ err }, 'LLaMA call failed')
      console.error(chalk.red('LLAMA ERROR:'), err)
      return {}
    }
  }

  // THIS WAS MISSING - you must return the functions
  return {
    checkTelemetry,
    buildPrompt,
    callLlama
  }
} // <- close createNodes here

// This was nested inside createNodes by mistake
function createOrchestrator(deps: OrchestratorDeps) {
  const { checkTelemetry, buildPrompt, callLlama } = createNodes(deps)

  const workflow = new StateGraph(StateAnnotation)
    .addNode('check', checkTelemetry)
    .addNode('prompt', buildPrompt)
    .addNode('intervene', callLlama)
    .addEdge(START, 'check')
    .addConditionalEdges('check', (state) => state.shouldIntervene ? 'prompt' : END)
    .addEdge('prompt', 'intervene')
    .addEdge('intervene', END)

  return workflow.compile()
}

let cronJob: cron.ScheduledTask | null = null

export function startOrchestrationLoop(deps: OrchestratorDeps) {
  logger.info('Starting orchestration loop - checking every 30s')
  const orchestrator = createOrchestrator(deps)

  cronJob = cron.schedule('*/30 * * * * *', async () => {
    try {
      await orchestrator.invoke({
        chromeTabCount: 0,
        lastCommitMinutes: 0,
        keystrokesLast5Min: 0,
        activeApp: '',
        entertainmentVideoMs: 0,
        workVideoMs: 0,
        shouldIntervene: false,
        interventionPrompt: undefined
      })
    } catch (err) {
      logger.error({ err }, 'Orchestration loop failed')
    }
  })
}

export function stopOrchestrationLoop() {
  cronJob?.stop()
  logger.info('Orchestration loop stopped')
}