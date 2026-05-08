import { StateGraph, START, END, Annotation } from '@langchain/langgraph'
import { Ollama } from '@langchain/ollama'
import { logger } from './logger.js'
import cron from 'node-cron'
import type { AppRepo } from '../repos/app.repo.js'
import type { IdeRepo } from '../repos/ide.repo.js'
import type { InterventionService } from './intervention.service.js'
import chalk from 'chalk'


interface OrchestratorDeps {
  appRepo: AppRepo
  ideRepo: IdeRepo
  interventionService: InterventionService
}

// Define state with Annotation instead of Zod
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
    appRepo.getVideoConsumptionMs(oneHourAgo, now, 'entertainment'), // Changed from 'entertainment_video'
    appRepo.getVideoConsumptionMs(oneHourAgo, now, 'work') // Changed from 'work_video'
  ])

  const chromeTabCount = tabs ?? 0
  const lastCommitMinutes = lastCommit ? Math.floor((now - lastCommit) / 60000) : 999
  const keystrokesLast5Min = keystrokes ?? 0
  const activeApp = currentApp ?? 'Unknown'

  const shouldIntervene =
    entertainmentVideoMs > 1 * 60 * 1000 || 
    (lastCommitMinutes > 45 && chromeTabCount >= 10 && keystrokesLast5Min === 0)

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
    
    const trigger = entMin > 1
    ? `You watched ${entMin}min of entertainment videos in the last hour.`
      : `You have ${state.chromeTabCount} tabs open, no commits in ${state.lastCommitMinutes}min, and no typing.`

    const prompt = `You are a flow-state coach. User is stuck.

Current state:
- ${trigger}
- Work videos watched: ${workMin}min
- Active app: ${state.activeApp}

Give 1 specific, actionable suggestion to unblock them. Max 2 sentences.`

    return { interventionPrompt: prompt }
  }

  async function callLlama(state: TState): Promise<Partial<TState>> {
    if (!state.interventionPrompt) return {}

    const llm = new Ollama({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.1:8b',
      temperature: 0.7
    })

    const response = await llm.invoke(state.interventionPrompt)
    const triggerType = state.entertainmentVideoMs > 1 * 60 * 1000 ? 'video-overload' : 'tab-overload'
      const entMin = Math.floor(state.entertainmentVideoMs / 60000)
    // Make it highly visible in terminal
  console.log('\n' + chalk.red.bold('═'.repeat(80)))
  console.log(chalk.red.bold('  ⚠️  FLOW INTERVENTION FIRED  ⚠️'))
  console.log(chalk.red.bold('═'.repeat(80)))
  console.log(chalk.yellow.bold(`\n  Trigger: ${triggerType.toUpperCase()}`))
  console.log(chalk.yellow(`  Entertainment watched: ${entMin}min`))
  console.log(chalk.yellow(`  Chrome tabs: ${state.chromeTabCount}`))
  console.log(chalk.yellow(`  Last commit: ${state.lastCommitMinutes}min ago`))
  console.log(chalk.cyan.bold('\n  → ') + chalk.white.bold(response) + '\n')
  console.log(chalk.red.bold('═'.repeat(80)) + '\n')
  

    logger.warn({ intervention: response }, 'FLOW INTERVENTION FIRED')
    
    interventionService.fire(triggerType, 'high', response)
    return {}
  }

  return { checkTelemetry, buildPrompt, callLlama }
}

function createOrchestrator(deps: OrchestratorDeps) {
  const { checkTelemetry, buildPrompt, callLlama } = createNodes(deps)

  const workflow = new StateGraph(StateAnnotation)

  workflow
  .addNode('check', checkTelemetry)
  .addNode('prompt', buildPrompt)
  .addNode('intervene', callLlama)
  .addEdge(START, 'check')
  .addConditionalEdges('check', (state) => state.shouldIntervene? 'prompt' : END)
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