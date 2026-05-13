# Main.ts - Entry & Wiring only

1. Purpose: Turn a pile of modules into one running process with a shared db and predictable startup/shutdown
2. Summary: 
This file serves as an entry point for the program. 
   loads env(dotenv)  
   opens SQLite under ~/.flow-agent/context.db,  
   validates/recreates a corrupt file, runs migrations,   
   constructs repos and services, starts the app activity sensor, 
   starts AppActivitySensor (writes raw only)
   starts ActivityEnricher (downstream classifier)
   registers two cron-driven background paths (orchestration + session logging),   
   on SIGINT stops the sensor and closes the DB.   

Runtime role: Process bootstrap, shared resource lifetime (DB), and starting long-lived timers—not business rules.  

3. Pattern: 
Composition root - main.ts  
Repository pattern - AppRepo / IdeRepo
Background jobs - node-cron in orchestrator + session logger
Dependency injection - pass repos into sensor/orchestrator; no framework
tree pipelines: 
   online(orchestrator->intervention)
   offline(session->Chroma)
   enrichment: raw app_activity → categorized app_activity

4. Tradeoffs / coupling / scalability: 
Coupling: main.ts knows every subsystem. That’s normal for a small daemon; if it grows, people extract a bootstrap() or factory.    
Scalability: Single process, single SQLite file—vertical scaling only; orchestrator + sensors share one DB connection—fine until write contention hurts.    
Risk: IDE-related data in IdeRepo without an IDE sensor in main means orchestrator may read stale or empty IDE signals unless something else writes—coupling between “what main starts” and “what orchestrator assumes.”    

5. reasoning about ownership
Who owns the DB connection? Today: main.ts creates db and passes it into repos; repos should not open their own DB. That’s correct layering.   

- creates 5 objects:
   appRepo, ideRepo, interventionService, appSensor, activityEnricher

### What .start() exists?
   appSensor.start() — begins polling OS
   activityEnricher.start() — begins 30s batch processing (auto-called in constructor)
   orchestrator.start() — schedules cron analysis
   sessionLogger.start() — schedules cron summarization

### What runs forever?
None of these block the main thread forever; they schedule work. The process stays alive because Node keeps the event loop (timers, I/O).  

   poll - observe, collect facts
   interval — transform facts (enricher)
   cron - to do a task, a scheduled recurring job

The app launches multiple independent long-running loops(4 run simultaneously):
1. Sensor polling loop - continuously collects telemetry
2. Enricher interval — continuously classifies raw → categorized
3. Orchestrator cron - periodically analyzes telemetry
4. Session logger cron - periodically summarizes long-term memory


## Follow-up questions:
1. Layer check: Is runMigrations(db) “business logic” or “infrastructure”? Why?  
infrastructure because it aligns with what the app expects. domain logic answers: "What is stuck"; migrations answer: "what tables exist"

2. Lifecycle: If appSensor.stop() runs but cron tasks keep firing, could you still get DB reads after the sensor stopped? What would you need to confirm?  
I can get db reads because the cron still might have the tasks scheduled.

3. Ownership: Why does main pass both appRepo and ideRepo into AppActivitySensor?  
appRepo = “write a log line about what was on screen” (app name, window title, time, Chrome tabs, etc.) That’s the main telemetry journal.  
ideRepo - a snapshot: “what counts as an active work session right now?” — derived from the same foreground window info (e.g. guessing a file path from the VS Code title).
the sensor does two jobs:
Full diary entry → appRepo
Session-style snapshot / housekeeping → ideRepo (insertActiveSession, and occasionally cleanupOldSessions)
Tiny analogy
One security guard writes everything in the daily notebook (appRepo), and also ticks a shift board (ideRepo) so later reports can say “who was ‘on duty’ / ‘in flow’” without rereading the whole notebook


