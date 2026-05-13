# AppActivitySensor class - Sensor polling loop that continuously collects telemetry. To record.

1. Purpose: Turn “what’s on screen right now on macOS?” into time-bucketed rows in SQLite so the rest of the system (orchestrator, session logger) can aggregate “what happened over the last N minutes.” The purpose is to record, not decide. 

2. Summary: This class runs a 2-second setInterval, each tick calls getActiveWindow() (AppleScript), then if there was a previous foreground snapshot (lastApp + duration_ms > 0), it classifies/caches category, writes appRepo.insertMany (one activity segment for the previous window state over duration_ms) and ideRepo.insertActiveSession (a parallel “session” row), then always updates in-memory last* + lastTs to the current window. Every 30 ticks it runs ideRepo.cleanupOldSessions(). Health is exposed for observability.

Runtime role: A high-frequency writer on the event loop: periodic I/O (AppleScript + DB + sometimes LLM). It runs concurrently with orchestrator/session cron jobs in the same process.

AppActivitySensor uses 4 policy layers:
* mediaSignals
    → derives signals from OS/browser state (URL, hostname, audible, fullscreen)
    → answers: “Is this media-like activity and what raw signals exist?”
* mediaDomains
    → shared static constants (whitelists / heuristics)
    → no logic, no decisions, just configuration data
* activityCategoryPolicy
    → coarse classification of activity:
    → work | entertainment | unknown
    → based on app + domain + title patterns
* videoClassifierPolicy
    → specialized refinement layer for video content
    → uses keywords + optional LLM fallback
    → converts ambiguous Chrome/video signals into:
    → work_video | entertainment_video

3. Pattern: 
Polling / sampling loop — fixed interval, pull OS state.
Repository pattern — sensor talks to AppRepo / IdeRepo, not raw SQL.
Manual dependency injection — repos passed in constructor.
State machine–lite — last* fields are “previous sample”; current sample becomes next last*.
Adapter — AppleScript + parsing is an OS adapter boundary.

4. Tradeoffs / coupling / scalability: 
Coupling:
* Sensor is tightly coupled to OS-specific extraction (AppleScript + window parsing)
* Sensor is coupled to persistence layer (AppRepo + IdeRepo)
* Sensor is partially coupled to ML policy (videoClassifierPolicy + LLM inside runtime path)
* Category logic is split across sensor + policy modules → implicit decision graph

Scalability: 
* Horizontal scaling: ❌ not applicable (single-device telemetry collector)
* Vertical scaling: limited by:
* AppleScript polling cost (2s interval)
* synchronous DB writes per tick
* occasional LLM calls inside sensor path (latency spikes)
* Works well for single-user local telemetry system, not distributed ingestion

Risk:    
* Sensor has mixed responsibilities:
    * sensing (good)
    * classification (borderline)
    * persistence (OK but tightly coupled)
    * caching logic (cross-cutting concern)
* LLM invocation inside sensor can introduce:
    * latency jitter in polling loop
    * non-deterministic classification timing
Potential backpressure risk if DB or LLM slows down (no queue buffer)

5. reasoning about ownership
Right now ownership is:

AppActivitySensor owns:

* OS polling (AppleScript)
* raw signal extraction
* time slicing (duration_ms)
* category resolution (partially)
* caching interaction (via repo abstraction)
* persistence (writes rows)

It should ONLY own:

* OS polling
* raw snapshot creation
* duration calculation
* forwarding event to persistence layer

It should NOT own:

* videoClassifierPolicy decision logic (should be upstream policy service)
* caching strategy (belongs to repo/service layer)
* any LLM calls (should never be in sensor hot path ideally)



on start:    
first tick runs after ~2s, then every 2s after that (unless poll() returns early when nothing changed).
2000 is milliseconds → 2 seconds  


poll():
getActiveWindow (AppleScript / OS query)
Compare to last state; maybe return early if unchanged
Duration = time since last snapshot
Category (cache / classify / optional LLM for video)
Persist: appRepo.insertMany + ideRepo.insertActiveSession
Advance last-seen state
Occasionally cleanupOldSessions
