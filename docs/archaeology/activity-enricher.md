
# Activity Enricher

## Purpose
The enricher runs downstream of `AppActivitySensor` and turns raw OS events into stable, queryable categories. The sensor stays fast (<5ms per tick); the enricher can be slow, retry, and restart without data loss.

## Architecture

Sensor writes: `ts, app, title, url, domain, audible, fullscreen, category='raw'`
Enricher reads `WHERE category='raw' OR category IS NULL`, classifies, updates `category`.

## Policy Layers (moved out of sensor)

The sensor used to do all four. They now live in the enricher:

### 1. mediaSignals
- **Role:** derive signals from OS/browser state
- **Inputs:** url, hostname, audible, fullscreen, window title
- **Outputs:** `isMediaLike`, `hasAudio`, `isFullscreen`, etc.
- **No decisions** — just normalized signals

### 2. mediaDomains
- **Role:** static configuration
- **Contents:** whitelists, domain heuristics, known video hosts
- **No logic** — pure data for other policies to consume

### 3. activityCategoryPolicy
- **Role:** coarse classification
- **Outputs:** `work | entertainment | communication | development | research | unknown`
- **Logic:** app + domain + title regex patterns
- **Fast, deterministic, no LLM**

### 4. videoClassifierPolicy
- **Role:** specialized refinement for video hosts
- **Inputs:** title, domain + signals from (1)
- **Logic:** keyword match → optional LLM fallback
- **Outputs:** `work_video | entertainment_video` (merges over coarse category)

## Processing Flow
1. `getRawActivities(limit)` — oldest first
2. Check cache (`getCachedCategory`)
3. Run `activityCategoryPolicy`
4. If `isVideoLikeHost(domain)` → run `videoClassifierPolicy`
5. `updateActivityCategory(id, category)`
6. `cacheCategory(title, domain, category)`

## Performance
- Sensor: ~5ms/tick, never blocks
- Enricher: batch 100 rows, runs every 30s (configurable)
- Backlog safe: raw rows accumulate, enricher catches up on restart

## Error Handling
- Individual row failures logged, row stays `raw` for retry
- LLM timeout → falls back to keyword result
- Enricher crash does not affect sensor

## Why this split?
- Keeps sensor simple and crash-proof
- Allows slow/expensive classification (LLM) without dropping events
- Policies are testable in isolation
- Categories can be re-run retroactively
