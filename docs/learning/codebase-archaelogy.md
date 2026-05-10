# Professional Codebase archaeology

Below is a template which I will use for each file investigation and exploration for [Archaeology Notes: exploration notes; discoveries; runtime tracing; hypotheses](../archaeology/)

To create a mental model when analyzing the codebase. 

1. Find the entrypoint → trace one happy path. What actually executes first?   
2. Name layers (bootstrap → IO → domain rules → persistence → side effects)   
3. Follow data: what enters the system, where it’s stored, who reads it later  
4. Defer depth: only open a file when a question forces it.
5. Draw a map that’s wrong on purpose, then correct it as you read.    

### when we open any file:

1. Problem solved → why this layer → what breaks if it vanishes  
2. 3–5 sentence summary → runtime role → important calls / tracing → details only where they clarify boundaries     
3. Patterns map explicitly (repository, polling, orchestration loop, DI-by-constructor, background jobs, memory pipeline, etc.)   
4. Tradeoffs / coupling / scalability / failure modes where they matter   
5. Questions back to you so you practice labeling layers and reasoning about ownership    

Ask these questions:
###  Orchestration vs execution  
Who schedules work vs who does I/O or LLM calls?

### Collection vs decision
Who writes facts vs who interprets facts into actions?

### Persistence vs domain logic
Are we expressing rules or storage shapes?

### Sync vs async
Does this block the event loop, await I/O, or fire-and-forget?

### Ownership & lifecycle   
Who creates this object?    
Who starts it?    
Who stops it?   
Is it long-lived, request-scoped, scheduled, or ephemeral?   

### State & truth
Where is the canonical state? SQLite? Memory? Chroma? Process-local cache? Derived aggregate?

### Failure containment
If this subsystem fails:
- what stops working?
- what degrades gracefully?
- what retries?
- what silently fails?

### Architectural Smell
What is structurally dangerous?
- business logic leaking into repos
- sensors making decisions
- orchestrators doing persistence directly
- circular dependencies
- hidden global state
- long methods with mixed responsibilities
- side effects buried in utilities
- polling loops with no cancellation/shutdown
- unclear ownership of state

## Living sketch
Boxes: entrypoint, sensors, repos, DB, orchestrator, interventions, session/memory     
Arrows labeled: “facts,” “aggregates,” “commands,” “side effects”    
Notes: “not started,” “cron 30s,” “writes table X”   