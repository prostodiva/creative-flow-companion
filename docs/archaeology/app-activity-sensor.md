# AppActivitySensor class - Sensor polling loop that continuously collects telemetry. To record.

ask macOS what is frontmost
write a raw row with duration

1. Purpose: Turn “what’s on screen right now on macOS?” into time-bucketed rows in SQLite so the rest of the system (orchestrator, session logger) can aggregate “what happened over the last N minutes.” The purpose is to record, not decide. 

2. Summary: This class runs a 2-second setInterval, each tick calls getActiveWindow() (AppleScript)
The class is just a polling loop that collects raw telemetry and writes it:
- start/stop creates a 2-second setInterval
- tick updates health counters and calls poll
- poll:
    runs the AppleScript in getActiveWindow
    keeps the previous window as this.last
    calculates durationMs
    builds one AppActivity with category: "raw" and calls appRepo.insertMany([activity])
- getActiveWindow is the only OS interaction


Runtime role: A high-frequency writer on the event loop: periodic I/O (AppleScript). It runs concurrently with orchestrator/session cron jobs in the same process.


3. Pattern: 
Polling / sampling loop — fixed interval, pull OS state.
Repository pattern — sensor talks to IAppRepo
Adapter — AppleScript + parsing is an OS adapter boundary.

4. Tradeoffs / coupling / scalability: 
- Tightly coupled to macOS: AppleScript strings, osascript binary, Chrome/Safari window model. Not portable to Windows/Linux.
- Coupled to AppActivity shape: if you change the table, sensor must change.
- Time coupling: assumes the process stays alive. If the app sleeps, durationMs will spike on wake.

Scalability: 
- Write volume: 1 row per change, worst case 1 row per 2s → ∼43,200 rows per day per user. SQLite handles this, but you will need pruning or rollup after 7-30 days.
- Single-threaded: all ticks share the Node event loop. AppleScript exec is async but still spawns a process each tick.
- No backpressure: if insertMany slows, ticks queue up. Current code does not await, so you could lose ordering.

Risk:    
- AppleScript failure: returns "unknown" and you write a gap. No retry.
- Missed ticks during sleep or debugger pause: duration is overcounted.
- No persistence of this.last on shutdown: if you stop the app mid-window, that last slice is lost.
- Downstream dependency: if the enricher stops, raw rows pile up with category = "raw".

5. reasoning about ownership
* OS polling
* raw snapshot creation
* duration calculation
* forwarding event to persistence layer

on start:    
first tick runs after ~2s, then every 2s after that (unless poll() returns early when nothing changed).
2000 is milliseconds → 2 seconds 
First tick fires after ∼2s because setInterval delays. If you need an immediate sample, call this.tick() once in start() before creating the interval.
2000 ms is a tradeoff: lower gives better resolution but more AppleScript overhead, higher reduces accuracy for quick app switches. 


