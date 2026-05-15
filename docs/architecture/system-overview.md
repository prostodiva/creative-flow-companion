# System Overview - what exists and how it connects

## explanation
A telemetry-driven AI engineering mentor with:
    - activity tracking
    - behavioral pattern analysis
    - RAG memory
    - local LLaMA integration
    - contextual coaching
    - developer workflow intelligence


## Flow:
    Main (entry point) boots the process and runs four independent loops simultaneously:
    1. Sensor polling loop(frequency - 1 sec) - continuously collects telemetry -> has access to IAppRepo(Insert raw only)
        A primary architectural rule for embedded or data-collection systems is to separate the control processes for sensors from the data-processing processes.
         ↓
    2. Enricher interval(frequency - 30 sec) — continuously classifies raw → categorized -> has access to IAppRepo(read raw, update category); uses four policies:
        - mediaSignals — derive signals from state
        - mediaDomains — static domain lists
        - activityCategoryPolicy — coarse work/entertainment classification
        - videoClassifierPolicy — video refinement with LLM fallback
         ↓
    30-second enricher acts as the consumer in a Process Pipeline pattern. In this pattern, data is processed through a sequence of transformations to prevent the system from dropping incoming data
         ↓
    3. Orchestrator cron(frequency - 30 min) - periodically analyzes telemetry -> reads IAppRepo (READ categorized data only)
        every 30 sec cron work:
        - reads SQLite via IAppRepo + IIdeRepo
        - queries memory systems(SQLite - activity history, ChromaDB- semantic memory); has ai pipeline(the workflow what it needs to do)
        - build prompt for LLM
        - retrieve memory from Chromadb(past sessions)
        - analyzing the pattern
        - retrieve the result from chromadb
        - call LLaMMa LLM, sent a prompt;
         ↓
    4. Session logger + SessionSchedule
        SessionLogger = WHAT happens
        SessionScheduler = WHEN it happens 
        The session logger layer converts low-level telemetry into long-term semantic memory.
        Session logger cron - periodically summarizes long-term memory -> reads IAppRepo -> writes embeddings/summaries to ChromaDB

        Key principle: write fast, enrich asynchronously, read clean.
        Command Query Responsibility Segregation (CQRS) pattern


## Layers Definitions:

    main.ts - the only file that knows all concrete classes       
             instantiates repos, sensors, services, starts loops
    
    infrastructure      = I/O details, frameworks, external tools, runtime behavior 
                        "How does the system talk to the outside world?" 
                        Has real side effects. Knows about specific technologies.
                        Everything else depends on this being correct.     

    adapters/in         = driving adapters (they start the action)        
                        "Collects raw data from the world and hands it inward" 
                        Knows about macOS APIs, AppleScript, VSCode IPC.
                        Translates external signals into domain language.
    
    adapters/out        = driven adapters (domain calls them) 
                        "Implements what the domain needs using real technology"
                        Knows about SQLite, ChromaDB, Ollama HTTP API.      
                        Translates domain requests into SQL queries or HTTP calls.  
    
    domain/ports/out    = contracts the domain needs fulfilled  
                        contracts required by application workflows  
                        "What does the inside need from the outside?"   
                        Pure TypeScript interfaces. No implementation. No imports
                        from infrastructure. Adapters/out implement these.     


    domain/use-cases/   =  application workflows        
                        "Coordinates steps to achieve a goal"      
                        Has sequence. Calls other things. Produces outcomes. 
                        Never imports from adapters or infrastructure directly.

    domain/models/      = pure rules, shapes, decisions                                                                          
                        "Answers a question or holds a rule"                          
                        Pure input → output. No I/O. No side effects.                
                        No imports from any other layer. Innermost circle.  



Interface needed   → when the implementation has I/O
                     (DB, HTTP, filesystem, OS calls)
                     because you need to swap or mock it

Concrete class ok  → when the implementation is pure logic
                     (models, policies, state)
                     nothing to swap, nothing to mock


## Subsystem Responsibilities

[Main](../archaeology/main.md)
[Sensor](../archaeology/app-activity-sensor.md)
[Enricher](../archaeology/activity-enricher.md)
[Orchestrator](../archaeology/orchestrator.md)
[Session Scheduler & Session Logger](../archaeology/session-logger.md)
