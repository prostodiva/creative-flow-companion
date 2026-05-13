# issues and fixes related to orchestrator.ts

refactor: the goal is to make the orchestration only decide how to act; 
1. extract StateAnnotation to model. The state shape is now independently readable, testable, and reusable without importing the entire orchestrator.
2. extract InterventionService to model. Avoid tight coupling; the orchestrator doesn't
need to know about WebSockets, OS notifications.
3. move Severity to models. Pure type - no logic, no dependencies
4. Ollama is instantiated every call. Inject an LLM interface; add OllamaClient to use in main. It acts as an adapter between the application and the external LLM library (LangChain Ollama).
5. inject InterventionState into OrchestratorDeps and delete the module-level variable. replace it with a stateful service (InterventionState).
6. buildPrompt queries the repo directly. buildPrompt's job is to assemble a string. The data fetch belongs in checkTelemetry where all other data fetching happens. This is a separation of concerns violation — mixing data collection with presentation logic. refactor: 