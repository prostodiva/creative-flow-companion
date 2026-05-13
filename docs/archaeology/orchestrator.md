# orchestrator.ts

1. Purpose:
Every 30 seconds, someone needs to ask: "Is this developer stuck right now, and if so, what should we tell them?" The orchestrator is that someone. It coordinates all the other systems without doing the work itself.

Problem solved:
Decides how to act, but doesn't do it itself.

why this layer:
This is pure decision-making logic. It doesn't know how data is stored, how LLaMA is hosted, or how notifications are sent. It only knows what decision to make given the current state. That's why it belongs in the domain — it's the brain, not the hands.

what breaks if it vanishes(disappear):
Everything keeps collecting data forever and nothing ever acts on it. Sensors write to SQLite, ChromaDB fills up with sessions, but no intervention ever fires. The system becomes a very expensive logging tool.

2. summary:
runtime role:
    every 30 sec cron work:
    - reads SQLite via IAppRepo + IIdeRepo
    - has an ai-agent memory; has ai pipeline(the workflow what it needs to do)
    - build prompt for LLM
    - retrieve memory from Chromadb(past sessions)
    - analyzing the pattern
    - retrieve the result from chromadb
    - call LLaMMa LLM, sent a prompt;


Important calls to trace:
    - appRepo.getChromeTabCount() — sync SQLite read
    - ideRepo.getRecentlyTouchedFiles() — sync SQLite read
    - retrieveMemory() — async ChromaDB vector query
    - llm.invoke() — async HTTP call to Ollama
    - interventionService.fire() — WebSocket + OS toast

tracing:
details only where they clarify boundaries:

3. Patterns explicitly map:
Orchestration Loop - cron.schedule + orchestrator.invoke() - Heartbeat that drives everything
State Machine - StateGraph + StateAnnotation - LangGraph tracks state between nodes
Pipeline - check->retrieveMemory->prompt->intervene - Each node transforms state
Dependency Injection - OrchestratorDeps passed to createModes - Repos injected, not imported directly
Ports - IAppRepo, IIdeRepo - interfaces
Background job - cronJob module-level variable - Runs independently of request cycle
Conditional routing - addConditionalEdges - pipeline short-curcuits if no intervention needed


4. Tradeoffs:
Coupling:

Scalability:

Failure modes where they matter:

5. Reasoning about ownership:

owns:



Flow:
- reads the repo interfaces
- uses an annotation system for LangGraph to track active coding, distraction, inactivity
This acts like an ai-memory:
    - store the currently focused app
    - tracks time spent on entertainment and work videos
    - and set the decision flag for firing intervene or not(send a feedback or not) also using an interventionPrompt
    everything lives in one shared state:
- create Node with data(ai pipeline for ai to execute. what kind of job to do, AI agent workflow):
    - checkTelementry(Should the AI intervene right now?):
        - shouldIntervene decides where to fire the response from Ollama:
            - tracking lastCommit, tabCountsm keystrokesLast5Min
     - retrieveMemoryNode(Have we seen this pattern before?)
    - build prompt:
            - pass a prompt to Ollama
     - calls Ollama
- createOrchestrator:
        - wire full pipeline together

- orchestration loop with cron job to run every 30 min
- stop orchestration loop

