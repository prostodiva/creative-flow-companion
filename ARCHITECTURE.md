## Overview

This repo is a **local-first telemetry daemon**. It collects:

- **App/window activity** via AppleScript (`osascript`) polling
- **IDE activity** via a Unix domain socket fed by IDE plugins + a periodic `git log` poll

It stores events in a **local SQLite database** and runs a **LangGraph orchestrator** every 30s to decide whether to fire an intervention (toast + websocket broadcast).

Primary entrypoint: `src/main.ts`

## Module responsibilities (single responsibility boundaries)

- **`src/sensors/`**: Data collection only (polling, parsing, IPC ingestion). No DB schema, no orchestration logic.
  - `app-activity.sensor.ts`: front app + window title + URL domain, plus optional LLM classification.
  - `ide/ide.sensor.ts`: IPC keystroke ingestion + periodic git last-commit timestamp.
  - `ide/ipc.ts`: unix socket server + input validation/redaction.
  - `base/*`: shared polling templates and health reporting.
- **`src/repos/`**: Persistence / query layer only. No shell commands, no orchestration rules.
  - All SQL lives in `db/queries/**.sql` and is loaded via `src/db/sql.ts`.
- **`src/core/`**: Cross-cutting infrastructure.
  - `config.ts`: validated config (Zod) + hot-reload of `.env`.
  - `logger.ts`: pino logger using `config`.
  - `metrics.ts`: Prometheus registry + counters/histograms.
  - `intervention.service.ts`: websocket fanout + OS notifications.
  - `orchestrator.ts`: LangGraph flow-state logic (reads via repos, triggers interventions).
- **`src/db/`**: Database assets + migration runtime.
  - `migrate.ts`: runs `db/migrations/*.sql` and records `schema_migrations`.
  - `sql.ts`: loads `.sql` assets from `db/` (dev) or `dist/db/` (prod).
- **`db/` (repo root)**: SQL assets that are copied into `dist/db/` at build time.
  - `db/migrations/*.sql`: schema migrations
  - `db/queries/**/*.sql`: repository queries

## Data flow (sensor → repo → orchestrator → intervention)

1. **Sensors** collect raw signals:
   - `AppActivitySensor` polls active window and emits app/title/domain/fullscreen/audible deltas.
   - `IdeSensor` ingests IDE events from IPC and polls git last-commit timestamp.
2. **Repos** persist and query:
   - `AppRepo.insertMany()` stores activity rows.
   - `IdeRepo.insertKeystroke()` and `IdeRepo.upsertLastCommit()` store IDE signals.
3. **Orchestrator** reads aggregates on a schedule:
   - `startOrchestrationLoop()` invokes LangGraph every 30 seconds.
   - It queries repos (tabs, last commit, keystrokes, video minutes) and decides `shouldIntervene`.
4. **InterventionService** broadcasts:
   - If triggered, sends a websocket message to local clients and shows an OS notification.

## Dependency graph (file-level)

### Entry

- `src/main.ts`
  - imports `src/db/migrate.ts`
  - imports `src/repos/*`
  - imports `src/sensors/*`
  - imports `src/core/orchestrator.ts`
  - imports `src/core/intervention.service.ts`

### Core

- `src/core/orchestrator.ts`
  - depends on `src/repos/app.repo.ts`, `src/repos/ide.repo.ts`
  - depends on `src/core/intervention.service.ts`
  - depends on `src/core/config.ts` (LLM baseUrl/model)
- `src/core/intervention.service.ts`
  - depends on `src/core/config.ts` (port)
  - depends on `src/core/metrics.ts` (counter)
- `src/core/logger.ts`
  - depends on `src/core/config.ts`
- `src/core/config.ts`
  - depends on `dotenv`, `zod`

### Sensors

- `src/sensors/app-activity.sensor.ts`
  - depends on `src/repos/app.repo.ts`
  - depends on `src/core/config.ts` (LLM baseUrl/model)
  - uses `execFile('osascript', ...)` (no shell)
- `src/sensors/ide/ide.sensor.ts`
  - depends on `src/sensors/ide/ipc.ts`
  - depends on `src/repos/ide.repo.ts`
  - uses `execFile('git', ...)` (no shell)
- `src/sensors/ide/ipc.ts`
  - depends on `src/utils/redact.ts` and `src/core/logger.ts`

### Repos / DB

- `src/repos/app.repo.ts`, `src/repos/ide.repo.ts`
  - depend on `src/db/sql.ts`
  - load SQL from `db/queries/**.sql`
- `src/db/migrate.ts`
  - reads `db/migrations/**.sql` or `dist/db/migrations/**.sql`

## How to add a new sensor (without touching orchestrator)

Goal: add a new telemetry data source without modifying `src/core/orchestrator.ts`.

- **Create a repo** if new data needs persistence:
  - Add tables/columns via a new migration in `db/migrations/NNN_*.sql`.
  - Add queries in `db/queries/<domain>/*.sql`.
  - Implement a new `src/repos/<domain>.repo.ts` that only uses loaded `.sql`.
- **Create the sensor**:
  - Implement `src/sensors/<domain>/<domain>.sensor.ts` extending `Sensor` or `PollingSensor<T>`.
  - Inject the repo via constructor (don’t import DB directly).
- **Wire it in `src/main.ts` only**:
  - Instantiate the repo and sensor and call `sensor.start()`.
  - Orchestrator remains unchanged as long as it doesn’t depend on the new signal.

To let orchestrator use the new signal **without coupling**, add a **narrow interface** (see below) and depend on that interface, not the concrete repo.

## Swappable repos (interfaces for AppRepo / IdeRepo)

To support alternate DBs/implementations, the orchestrator should depend on interfaces:

- `AppRepoPort`
  - `getChromeTabCount(sinceMs): Promise<number>`
  - `getCurrentApp(): Promise<string | null>`
  - `getVideoConsumptionMs(fromMs, toMs, category?): Promise<number>`
- `IdeRepoPort`
  - `getLastCommitTs(): number | null`
  - `getKeystrokeCountSince(sinceMs): number`

Current implementation uses `better-sqlite3`. A Postgres-backed implementation would implement the same methods using a Postgres client, while keeping orchestrator unchanged.

## SQLite → Postgres swap plan (minimal changes)

Recommended structure for the swap:

- Introduce a DB-agnostic repo interface layer (`AppRepoPort`, `IdeRepoPort`) used by orchestrator and sensors.
- Provide concrete implementations:
  - `SqliteAppRepo` / `SqliteIdeRepo` (current)
  - `PostgresAppRepo` / `PostgresIdeRepo` (new)
- Keep SQL isolated:
  - For Postgres, either:
    - use a typed query builder (Kysely/Drizzle) with generated types, or
    - keep `.sql` files but with Postgres syntax and strict parameterization.
- Migrations:
  - Split migration directories per engine (e.g. `db/migrations/sqlite` and `db/migrations/postgres`) once needed.

## Where to add new LangGraph nodes

`src/core/orchestrator.ts` currently has:

- `checkTelemetry` (read signals)
- `buildPrompt` (compose intervention prompt)
- `callLlama` (invoke LLM + fire intervention)

Add nodes by:

- Keeping **reads** in one node (or a small number of nodes) that only depends on repo ports
- Keeping **decision logic** in pure functions so it can be unit tested without DB/LLM
- Keeping **side effects** (LLM invocation, notifications) in the last node(s)

## Security notes (current posture)

- Shell execution has been reduced to `execFile()` (no shell), preventing command injection via string concatenation.
- IPC input is length-guarded, JSON-parsed, schema-validated, and file paths are redacted.
- **Dependency audit** currently reports high/moderate issues in `@langchain/community`, `expr-eval`, `glob`, `fastmcp` transitive deps. Addressing these requires version bumps that may be breaking; treat as planned upgrades.

