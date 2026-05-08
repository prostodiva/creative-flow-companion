import { Sensor, type SensorHealth } from './base/sensor.js'
import { exec } from 'child_process'
import { promisify } from 'util'
import { Ollama } from '@langchain/ollama'
import type { AppRepo } from '../repos/app.repo.js'
import { logger } from '../core/logger.js'

const execAsync = promisify(exec)

const WORK_DOMAINS = new Set([
  'youtube.com','egghead.io','frontendmasters.com','pluralsight.com',
  'udemy.com','coursera.org','edx.org','laracasts.com','khanacademy.org'
])

const WORK_KEYWORDS = ['tutorial','course','lecture','react','typescript','python','aws','kubernetes','algorithm']
const ENT_KEYWORDS = ['netflix','movie','episode','anime','trailer','tv show']

export class AppActivitySensor extends Sensor {
  readonly name = 'app-activity'
  private interval: NodeJS.Timeout | null = null
  private tickCount = 0
  private errorCount = 0
  private lastTickAt: number | null = null
  private llm = new Ollama({ baseUrl: 'http://localhost:11434', model: 'llama3.1:8b', temperature: 0 })

  // State for tracking window changes
  private lastApp = ''
  private lastTitle = ''
  private lastDomain: string | null = null  
  private lastFullscreen = false
  private lastAudible = false
  private lastTs = Date.now()

  constructor(private appRepo: AppRepo) {
    super()
  }

  start(): void {
    if (this.interval) return
    this.interval = setInterval(() => this.tick(), 2000)
    logger.info('AppActivitySensor started')
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval)
    this.interval = null
  }

  health(): SensorHealth {
    return {
      name: this.name,
      status: this.errorCount > 10 ? 'error' : this.interval ? 'ok' : 'idle',
      lastTickAt: this.lastTickAt,
      errorCount: this.errorCount,
      tickCount: this.tickCount
    }
  }

  private async tick(): Promise<void> {
    this.tickCount++
    this.lastTickAt = Date.now()
    try {
      await this.poll()
    } catch (err) {
      this.errorCount++
      logger.error({ err }, 'Poll failed')
    }
  }

  protected async poll(): Promise<void> {
    const now = Date.now()
    const { app, title, domain, fullscreen, audible } = await this.getActiveWindow()
    
    if (app === this.lastApp && title === this.lastTitle) {
      return
    }
    
    const duration_ms = now - this.lastTs
    
    if (this.lastApp) {
      let category = await this.appRepo.getCachedCategory(this.lastTitle, this.lastDomain || undefined)
      
      if (!category) {
        category = this.appRepo.classifyTitle(this.lastTitle, this.lastDomain)
        
        if (this.lastApp === 'Google Chrome' && this.lastFullscreen && this.lastAudible) {
          category = await this.classifyVideo(this.lastTitle, this.lastDomain || undefined)
        }
        
        await this.appRepo.cacheCategory(this.lastTitle, this.lastDomain || undefined, category)
      }
      
      await this.appRepo.insertMany([{
        ts: this.lastTs,
        app: this.lastApp,
        title: this.lastTitle,
        domain: this.lastDomain || null,  // Convert null to null explicitly
        is_fullscreen: this.lastFullscreen,
        has_audio: this.lastAudible,
        category: category || null,  // Convert undefined to null
        duration_ms
      }])
      
      logger.debug({ app: this.lastApp, title: this.lastTitle, domain: this.lastDomain, category, duration_ms }, 'Saved activity')
    }
    
    this.lastApp = app
    this.lastTitle = title
    this.lastDomain = domain  // domain is string | null, matches field type
    this.lastFullscreen = fullscreen
    this.lastAudible = audible
    this.lastTs = now
  }


  private async getActiveWindow(): Promise<{ 
  app: string
  title: string
  domain: string | null
  fullscreen: boolean
  audible: boolean 
}> {
  try {
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
      end tell
      
      set winTitle to ""
      set tabUrl to ""
      set isFull to false
      set isAudible to false
      
      if frontApp is "Google Chrome" then
        tell application "Google Chrome"
          if (count of windows) > 0 then
            try
              set winTitle to title of active tab of front window
            end try
            try
              set tabUrl to URL of active tab of front window
            end try
            try
              set isAudible to audible of active tab of front window
            end try
            try
              set isFull to fullscreen of front window
            end try
          end if
        end tell
      else if frontApp is "Safari" then
        tell application "Safari"
          if (count of windows) > 0 then
            try
              set winTitle to name of current tab of front window
            end try
            try
              set tabUrl to URL of current tab of front window
            end try
          end if
        end tell
      else
        tell application "System Events"
          tell process frontApp
            try
              set winTitle to name of front window
            end try
          end tell
        end tell
      end if
      
      return frontApp & "|||" & winTitle & "|||" & tabUrl & "|||" & isFull & "|||" & isAudible
    `
    
    const { stdout } = await execAsync(`osascript -e '${script}'`)
    const [app, title, url, fullStr, audStr] = stdout.trim().split('|||')
    
    let domain: string | null = null
    if (url && url !== 'missing value' && url !== '') {
      try { 
        domain = new URL(url).hostname.replace('www.', '') 
      } catch {}
    }
    
    return {
      app: app || 'unknown',
      title: title || '',
      domain,
      fullscreen: fullStr === 'true',
      audible: audStr === 'true'
    }
  } catch (err) {
    logger.error({ err }, 'getActiveWindow failed')
    return { app: 'unknown', title: '', domain: null, fullscreen: false, audible: false }
  }
}
      
    
  private async classifyVideo(title: string, domain?: string): Promise<string> {
    const cached = await this.appRepo.getCachedCategory(title, domain)
    if (cached) return cached

    const text = `${title} ${domain ?? ''}`.toLowerCase()
    if (domain && WORK_DOMAINS.has(domain) && WORK_KEYWORDS.some(k => text.includes(k))) {
      await this.appRepo.cacheCategory(title, domain, 'work_video')
      return 'work_video'
    }

    const workScore = WORK_KEYWORDS.filter(k => text.includes(k)).length
    const entScore = ENT_KEYWORDS.filter(k => text.includes(k)).length
    
    if (workScore > entScore && workScore > 0) {
      await this.appRepo.cacheCategory(title, domain, 'work_video')
      return 'work_video'
    }
    if (entScore > 0) {
      await this.appRepo.cacheCategory(title, domain, 'entertainment_video')
      return 'entertainment_video'
    }

    try {
      const prompt = `Title: "${title}"\nDomain: ${domain ?? 'unknown'}\n\nIs this educational/work content or entertainment? Reply one word: work or entertainment.`
      const result = await this.llm.invoke(prompt)
      const category = result.toLowerCase().includes('work') ? 'work_video' : 'entertainment_video'
      await this.appRepo.cacheCategory(title, domain, category)
      return category
    } catch {
      return 'entertainment_video'
    }
  }
}