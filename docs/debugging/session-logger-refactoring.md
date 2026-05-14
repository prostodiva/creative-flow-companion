

1. directly coupled to Chroma memory pipeline through writeSession()
    summarization logic and scheduling still live in same module
    refactor:
    SessionLogger - session summarization workflow;
    create SessionScheduler in infrastructure (cron scheduling/runtime lifecycle); 
    avoids tight coupling, follows clean architecture

    DI:
        main.ts
        ↓
        SessionScheduler (infrastructure)
        ↓
        SessionLogger (use-case)
        ↓
        ports
        ↓
        adapters/out

    SessionScheduler
        owns runtime timing

    SessionLogger - owns application workflow

    Repositories
        own data access

    memoryWriter
        owns persistence adapter