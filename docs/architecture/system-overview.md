# System Overview - what exists and how it connects

* explanation
* Mermaid diagrams
* subsystem responsibilities
* tradeoffs
* flows
* future improvements

Flow:
    Main (entry point) boots the process and runs four independent loops simultaneously:
    1. Sensor polling loop(frequency - 1 sec) - continuously collects telemetry -> has access to IAppRepo(Insert raw only)
    A primary architectural rule for embedded or data-collection systems is to separate the control processes for sensors from the data-processing processes.


    2. Enricher interval(frequency - 30 sec) — continuously classifies raw → categorized -> has access to IAppRepo(read raw, update category); uses four policies:
        - mediaSignals — derive signals from state
        - mediaDomains — static domain lists
        - activityCategoryPolicy — coarse work/entertainment classification
        - videoClassifierPolicy — video refinement with LLM fallback

    30-second enricher acts as the consumer in a Process Pipeline pattern. In this pattern, data is processed through a sequence of transformations to prevent the system from dropping incoming data
    
    3. Orchestrator cron(frequency - 30 min) - periodically analyzes telemetry -> reads IAppRepo (READ categorized data only)

    4. Session logger cron - periodically summarizes long-term memory -> reads IAppRepo -> writes embeddings/summaries to ChromaDB

    Key principle: write fast, enrich asynchronously, read clean.
    Command Query Responsibility Segregation (CQRS) pattern

