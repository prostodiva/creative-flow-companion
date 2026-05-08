import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mocks -----------------------------------------------------------------

vi.mock('../src/core/config.js', () => ({
  config: {
    get: () => ({ POLL_INTERVAL_MS: 1000, LOG_LEVEL: 'silent' }),
    on: vi.fn(),
    redactPatterns: [],
    redactPaths: [],
  },
}));

vi.mock('../src/core/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../src/core/metrics.js', () => ({
  sensorTicksTotal: { inc: vi.fn() },
  sensorErrorsTotal: { inc: vi.fn() },
}));

// ---- Concrete test sensor --------------------------------------------------

const { PollingSensor } = await import('../src/sensors/base/polling.sensor.js');

class CounterSensor extends PollingSensor<{ value: number }> {
  readonly name = 'test-counter';
  private _counter = 0;
  readonly flushed: Array<{ value: number }[]> = [];
  shouldError = false;

  protected override get intervalMs() { return 1000; }
  protected override get batchSize() { return 3; }
  protected override get flushIntervalMs() { return 10_000; }

  protected async poll(): Promise<{ value: number } | null> {
    if (this.shouldError) throw new Error('poll error');
    this._counter++;
    return { value: this._counter };
  }

  protected async flush(batch: { value: number }[]): Promise<void> {
    this.flushed.push([...batch]);
  }
}

// ---- Tests -----------------------------------------------------------------

describe('PollingSensor', () => {
  let sensor: CounterSensor;

  beforeEach(() => {
    vi.useFakeTimers();
    sensor = new CounterSensor();
  });

  afterEach(() => {
    sensor.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('starts and does not tick before interval elapses', async () => {
    sensor.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(sensor.batchSnapshot).toHaveLength(0);
  });

  it('collects one item per tick', async () => {
    sensor.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sensor.batchSnapshot).toHaveLength(1);
  });

  it('auto-flushes when batchSize (3) is reached', async () => {
    sensor.start();
    // 3 ticks → batch fills → flush triggered
    await vi.advanceTimersByTimeAsync(3000);
    expect(sensor.flushed.length).toBeGreaterThanOrEqual(1);
    expect(sensor.flushed[0]).toHaveLength(3);
  });

  it('clears batch after flush', async () => {
    sensor.start();
    await vi.advanceTimersByTimeAsync(3000);
    // After flush the batch is empty (or has items from tick 4+)
    expect(sensor.batchSnapshot.length).toBeLessThan(3);
  });

  it('increments tick and error counts correctly', async () => {
    sensor.start();
    sensor.shouldError = false;
    await vi.advanceTimersByTimeAsync(2000); // 2 ticks
    expect(sensor.health().tickCount).toBe(2);
    expect(sensor.health().errorCount).toBe(0);
  });

  it('increments errorCount on poll error', async () => {
    sensor.start();
    sensor.shouldError = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(sensor.health().errorCount).toBe(1);
    expect(sensor.health().status).toBe('error');
  });

  it('reports idle status when stopped', () => {
    expect(sensor.health().status).toBe('idle');
  });

  it('reports ok status when running with no errors', async () => {
    sensor.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sensor.health().status).toBe('ok');
  });

  it('flushes remaining batch on stop()', async () => {
    sensor.start();
    await vi.advanceTimersByTimeAsync(2000); // 2 ticks, batch not full yet
    sensor.stop();
    // stop() should flush the 2-item batch
    expect(sensor.flushed.length).toBeGreaterThanOrEqual(1);
    const all = sensor.flushed.flat();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('does not double-start', async () => {
    sensor.start();
    sensor.start(); // second call should be no-op
    await vi.advanceTimersByTimeAsync(1000);
    // Still only 1 tick (not 2 from two intervals)
    expect(sensor.health().tickCount).toBe(1);
  });

  it('updates lastTickAt after each tick', async () => {
    sensor.start();
    expect(sensor.health().lastTickAt).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sensor.health().lastTickAt).not.toBeNull();
  });
});