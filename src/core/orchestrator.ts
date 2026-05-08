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
  recentFiles: Annotation<string[]>(),
  gitDiffSummary: Annotation<string>(),
  todoList: Annotation<string[]>(),
})

type TState = typeof StateAnnotation.State

let lastInterventionTs = 0
const COOLDOWN_MS = config.INTERVENTION_COOLDOWN_MS

function createNodes(deps: OrchestratorDeps) {
  const { appRepo, ideRepo, interventionService } = deps

  async function checkTelemetry(state: TState): Promise<Partial<TState>> {
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    const fiveMinAgo = now - 5 * 60 * 1000

    const [tabs, lastCommit, keystrokes, currentApp, entertainmentVideoMs, workVideoMs, recentFiles, gitDiffSummary, todoList  ] = await Promise.all([
      appRepo.getChromeTabCount(now - 60000),
      ideRepo.getLastCommitTs(),
      ideRepo.getKeystrokeCountSince(fiveMinAgo),
      appRepo.getCurrentApp(),
      appRepo.getVideoConsumptionMs(oneHourAgo, now, 'entertainment'),
      appRepo.getVideoConsumptionMs(oneHourAgo, now, 'work') ,
      ideRepo.getRecentlyTouchedFiles(3), 
    ideRepo.getGitDiffSummary(),        
    ideRepo.getTodoComments()     
    ])

    const chromeTabCount = tabs ?? 0
    const lastCommitMinutes = lastCommit ? Math.floor((now - lastCommit) / 60000) : 999
    const keystrokesLast5Min = keystrokes ?? 0
    const activeApp = currentApp ?? 'Unknown'

    const shouldIntervene =
  entertainmentVideoMs >= config.VIDEO_IDLE_MINUTES * 60 * 1000 || 
  (lastCommitMinutes > config.COMMIT_IDLE_MINUTES &&
    chromeTabCount >= config.TAB_OVERLOAD_THRESHOLD &&
    keystrokesLast5Min === 0)

// Add this log right after
console.log('SHOULD_INTERVENE:', shouldIntervene, {
  entertainmentVideoMs,
  threshold: config.VIDEO_IDLE_MINUTES * 60 * 1000,
  entMin: Math.floor(entertainmentVideoMs / 60000),
  lastCommitMinutes,
  commitThreshold: config.COMMIT_IDLE_MINUTES,
  chromeTabCount,
  tabThreshold: config.TAB_OVERLOAD_THRESHOLD,
  keystrokesLast5Min
})

logger.info({ 
  chromeTabCount, 
  lastCommitMinutes, 
  keystrokesLast5Min,
  entertainmentMin: Math.floor(entertainmentVideoMs / 60000),
  workMin: Math.floor(workVideoMs / 60000),
  shouldIntervene  // add this
}, 'Telemetry check')

    return { 
      chromeTabCount, 
      lastCommitMinutes, 
      keystrokesLast5Min, 
      activeApp, 
      entertainmentVideoMs,
      workVideoMs,
      shouldIntervene,
      recentFiles: recentFiles ?? [],
        gitDiffSummary: gitDiffSummary ?? 'No changes',
     todoList: todoList ?? []
    }
  }

  async function buildPrompt(state: TState): Promise<Partial<TState>> {
  console.log('PROMPT NODE: entered, shouldIntervene=', state.shouldIntervene)
  
  if (!state.shouldIntervene) {
    console.log('PROMPT NODE: skipped - shouldIntervene false')
    return {}
  }

  console.log('PROMPT NODE: building prompt')
  
  const entMin = Math.floor(state.entertainmentVideoMs / 60000)
  const isVideoTrigger = entMin >= 1
  
  const behavioralContext = isVideoTrigger
    ? `Avoiding work: ${entMin}m entertainment video watched`
    : `Task paralysis: ${state.chromeTabCount} tabs open, ${state.lastCommitMinutes}m no commits, 0 keystrokes`

  const prompt = `You are a flow-state coach using CBT techniques.

CONTEXT:
Behavior: ${behavioralContext}
Active app: ${state.activeApp}
Recent files: ${state.recentFiles.join(', ') || 'None'}
Git status: ${state.gitDiffSummary}
TODOs in code: ${state.todoList.slice(0,2).join(' | ') || 'None'}

YOUR JOB:
1. DIAGNOSE the pattern. Is this anxiety avoidance, perfectionism, overwhelm, or decision fatigue? Use the file/git context to infer what they were working on.
2. SHRINK the task. Pick ONE file from "Recent files" or "Git status". Give a 15min micro-sprint on just that file.

RULES:
- Max 20 words total
- Format: "[Pattern]: 15min sprint on [file] - [tiny action]"
- Be specific to their actual files, not generic

Examples:
"Anxiety avoidance: 15min sprint on Player.cs - add 1 method stub"
"Overwhelm: 15min sprint on UiManager.cs - delete 1 dead function"

Your diagnosis + task:`

  console.log('PROMPT NODE: returning prompt length=', prompt.length)
  return { interventionPrompt: prompt }
}

async function callLlama(state: TState): Promise<Partial<TState>> {
  console.log('LLAMA NODE: entered, hasPrompt=', !!state.interventionPrompt)
  
  if (!state.interventionPrompt) {
    console.log('LLAMA NODE: skipped - no prompt')
    return {}
  }
  
  console.log('LLAMA NODE: calling Ollama...')

    
    const now = Date.now()
    if (now - lastInterventionTs < COOLDOWN_MS) {
      logger.info({ cooldownMs: COOLDOWN_MS - (now - lastInterventionTs) }, 'Intervention on cooldown')
      return {}
    }

    try {
      const llm = new Ollama({
        baseUrl: config.OLLAMA_BASE_URL,
        model: config.OLLAMA_MODEL,
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
} 

function createOrchestrator(deps: OrchestratorDeps) {
  const { checkTelemetry, buildPrompt, callLlama } = createNodes(deps)

  const workflow = new StateGraph(StateAnnotation)
    .addNode('check', checkTelemetry)
    .addNode('prompt', buildPrompt)
    .addNode('intervene', callLlama)
    .addEdge(START, 'check')
    .addConditionalEdges('check', (state) => {
      console.log('EDGE EVALUATED: shouldIntervene=', state.shouldIntervene)
      return state.shouldIntervene ? 'prompt' : '__end__'
    })
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