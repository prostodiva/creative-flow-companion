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
    - queries memory systems(SQLite - activity history, ChromaDB- semantic memory); has ai pipeline(the workflow what it needs to do)
    - build prompt for LLM
    - retrieve memory from Chromadb(past sessions)
    - analyzing the pattern
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
- Orchestration Loop - cron.schedule + orchestrator.invoke() - Heartbeat that drives everything
- State Machine - StateGraph + StateAnnotation - LangGraph(ephemeral execution state) tracks state between nodes. transient execution state for decision making
- Pipeline - check->retrieveMemory->prompt->intervene - Each node transforms state
- Dependency Injection - OrchestratorDeps passed to createModes - Repos injected, not imported directly
- Ports - IAppRepo, IIdeRepo, IInterventionService, ILlmClient - interfaces
- Background job - cronJob module-level variable - Runs independently of request cycle
- Conditional routing - addConditionalEdges - pipeline short-curcuits if no intervention needed
- Temporal batch decision system - a periodic inference engine over developer behavior signals
- Closed-loop feedback system: observe → analyze → intervene → modify future behavior(interventions affect future telemetry.)


4. Tradeoffs:
   
    The orchestrator is intentionally coupled to:

    * domain ports (IAppRepo, IIdeRepo, ILlmClient, IInterventionService)
    * LangGraph state transitions
    * intervention workflow order

    But it is decoupled from:

    * SQLite implementation details
    * Ollama/LangChain internals
    * WebSocket or OS notification APIs
    * ChromaDB implementation

    Tradeoff:

    * Strong coordination coupling is acceptable because orchestration layers naturally know system flow.
    * Business rules were extracted into InterventionPolicy to reduce logic coupling.

Scalability:
    Current design scales well for:

    * adding more telemetry signals
    * adding new workflow nodes
    * swapping LLM providers
    * replacing storage implementations
    * introducing multiple intervention policies

    Potential bottlenecks:

    * LLM invocation latency
    * synchronous SQLite reads
    * single-process cron execution
    * growing prompt size from memory retrieval

    Future scaling options:

    * queue-based orchestration
    * distributed workers
    * async event bus
    * streaming telemetry aggregation
    * rule scoring engine instead of threshold checks
    Failure modes where they matter:

    Failure modes where they matter:

    LLM unavailable
    Impact:
        * interventions stop generating
        * telemetry collection still works
    Mitigation:
        * isolated try/catch around llm.invoke()

    ⸻

    SQLite corruption
    Impact:
        * telemetry history unavailable
        * intervention quality degrades
    Mitigation:
        * startup corruption detection + DB recreation

    ⸻

    ChromaDB/memory retrieval failure
    Impact:
        * interventions lose historical context
        * system still functions with live telemetry
    Mitigation:
        * orchestration pipeline can continue without memory results

    ⸻

    Cooldown logic failure
    Impact:
        * intervention spam
        * developer fatigue
        * reduced trust in system
    Mitigation:
        * centralized InterventionState

    Cron loop crash
    Impact:
        * orchestration stops entirely
        * system becomes passive telemetry logger
    Mitigation:
        * outer orchestration try/catch + isolated node failures


5. Reasoning about ownership:

    The orchestrator owns:
    * workflow order
    * state transitions
    * node coordination
    * intervention decision flow
    * execution timing (30-second heartbeat)
    * passing context between systems

overall:
    * modular
    * testable
    * dependency-inverted
    * state-driven
    * policy-oriented
    * infrastructure-isolated



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

