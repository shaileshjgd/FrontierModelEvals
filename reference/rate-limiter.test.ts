/**
 * Reference Implementation Tests — Sliding Window Rate Limiter
 *
 * These tests define the expected behavior that full-credit model responses
 * should demonstrate. Scoring dimension: Test Quality.
 *
 * Key test: the sliding window expiry property MUST be tested with
 * jest.useFakeTimers() — tests that only check happy-path allow/block
 * without advancing time cannot verify the algorithm is actually sliding.
 */

import request from 'supertest';
import express, { type Express } from 'express';
import { InMemoryStore, createRateLimiter, type StorageAdapter } from './rate-limiter';

// ─── InMemoryStore unit tests ─────────────────────────────────────────────────

describe('InMemoryStore', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows the first request', async () => {
    const store = new InMemoryStore();
    const result = await store.increment('key', 60_000, 5);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
    await store.shutdown();
  });

  it('allows requests up to the limit', async () => {
    const store = new InMemoryStore();
    for (let i = 0; i < 3; i++) {
      const r = await store.increment('key', 60_000, 3);
      expect(r.allowed).toBe(true);
      expect(r.count).toBe(i + 1);
    }
    await store.shutdown();
  });

  it('blocks the request that exceeds the limit', async () => {
    const store = new InMemoryStore();
    await store.increment('key', 60_000, 2);
    await store.increment('key', 60_000, 2);
    const result = await store.increment('key', 60_000, 2); // over limit
    expect(result.allowed).toBe(false);
    await store.shutdown();
  });

  it('does not record blocked requests — blocked count stays at limit', async () => {
    const store = new InMemoryStore();
    await store.increment('key', 60_000, 1);                 // allowed, count → 1
    const blocked = await store.increment('key', 60_000, 1); // blocked
    expect(blocked.count).toBe(1);                           // must not increment to 2
    await store.shutdown();
  });

  /**
   * THE CRITICAL TEST: the sliding window property.
   *
   * A fixed-window implementation would pass most tests but fail this one:
   * after advancing past the window boundary, old requests must expire and
   * new requests must be allowed again.
   */
  it('expires old requests as the window slides forward (fake timers)', async () => {
    jest.useFakeTimers();
    const store = new InMemoryStore();

    await store.increment('key', 1_000, 2);  // t=0ms, count=1
    await store.increment('key', 1_000, 2);  // t=0ms, count=2 (at limit)

    // Advance time past the full window — both timestamps from t=0 are now expired
    jest.advanceTimersByTime(1_001);

    const result = await store.increment('key', 1_000, 2);  // t=1001ms
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);  // fresh window: only this request counts

    await store.shutdown();
  });

  it('partial window slide — only expired requests are pruned', async () => {
    jest.useFakeTimers();
    const store = new InMemoryStore();

    await store.increment('key', 1_000, 3);  // t=0, count=1
    jest.advanceTimersByTime(600);
    await store.increment('key', 1_000, 3);  // t=600, count=2
    jest.advanceTimersByTime(500);
    // t=1100: the t=0 request has expired, t=600 is still in window
    const result = await store.increment('key', 1_000, 3);  // count=2 (600ms + 1100ms)
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(2);

    await store.shutdown();
  });

  it('tracks separate keys independently', async () => {
    const store = new InMemoryStore();
    await store.increment('user-a', 60_000, 1);              // exhausts limit for user-a
    const result = await store.increment('user-b', 60_000, 1);
    expect(result.allowed).toBe(true);                       // user-b unaffected
    await store.shutdown();
  });

  it('returns a resetTime in the future', async () => {
    const store = new InMemoryStore();
    const before = Date.now();
    const result = await store.increment('key', 5_000, 10);
    expect(result.resetTime).toBeGreaterThan(before);
    await store.shutdown();
  });
});

// ─── Middleware integration tests ─────────────────────────────────────────────

function buildTestApp(
  windowMs: number,
  maxRequests: number,
  storage?: StorageAdapter,
  keyGenerator?: (req: express.Request) => string,
): { app: Express; store: InMemoryStore } {
  const app   = express();
  const store = (storage as InMemoryStore) ?? new InMemoryStore();
  const limiter = createRateLimiter(
    { windowMs, maxRequests, ...(keyGenerator ? { keyGenerator } : {}) },
    store,
  );
  app.use(limiter);
  app.get('/api/data', (_req, res) => res.json({ ok: true }));
  return { app, store };
}

describe('createRateLimiter middleware', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns 200 for a request within the limit', async () => {
    const { app, store } = buildTestApp(60_000, 5);
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(200);
    await store.shutdown();
  });

  it('returns 429 when the limit is exceeded', async () => {
    const { app, store } = buildTestApp(60_000, 1);
    await request(app).get('/api/data');
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(429);
    await store.shutdown();
  });

  it('sets X-RateLimit-Limit on every response', async () => {
    const { app, store } = buildTestApp(60_000, 10);
    const res = await request(app).get('/api/data');
    expect(res.headers['x-ratelimit-limit']).toBe('10');
    await store.shutdown();
  });

  it('decrements X-RateLimit-Remaining correctly', async () => {
    const { app, store } = buildTestApp(60_000, 5);
    const res1 = await request(app).get('/api/data');
    const res2 = await request(app).get('/api/data');
    expect(Number(res1.headers['x-ratelimit-remaining'])).toBe(4);
    expect(Number(res2.headers['x-ratelimit-remaining'])).toBe(3);
    await store.shutdown();
  });

  it('sets X-RateLimit-Reset as a Unix timestamp in seconds', async () => {
    const { app, store } = buildTestApp(60_000, 10);
    const before = Math.floor(Date.now() / 1000);
    const res    = await request(app).get('/api/data');
    const reset  = Number(res.headers['x-ratelimit-reset']);
    expect(reset).toBeGreaterThanOrEqual(before);
    expect(reset).toBeLessThanOrEqual(before + 61); // within the window
    await store.shutdown();
  });

  it('sets Retry-After on 429 responses', async () => {
    const { app, store } = buildTestApp(60_000, 1);
    await request(app).get('/api/data');
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    await store.shutdown();
  });

  it('does not set Retry-After on allowed responses', async () => {
    const { app, store } = buildTestApp(60_000, 10);
    const res = await request(app).get('/api/data');
    expect(res.headers['retry-after']).toBeUndefined();
    await store.shutdown();
  });

  /**
   * THE CRITICAL MIDDLEWARE TEST: sliding window expiry via fake timers.
   * A model that uses a fixed-window counter will fail here.
   */
  it('allows new requests after the window slides past old ones (fake timers)', async () => {
    jest.useFakeTimers();
    const { app, store } = buildTestApp(1_000, 1);

    const res1 = await request(app).get('/api/data');  // allowed, exhausts limit
    expect(res1.status).toBe(200);

    jest.advanceTimersByTime(1_001);                   // slide window

    const res2 = await request(app).get('/api/data');  // must be allowed again
    expect(res2.status).toBe(200);

    await store.shutdown();
  });

  it('isolates rate limits by keyGenerator output', async () => {
    const { app, store } = buildTestApp(
      60_000,
      1,
      undefined,
      (req) => req.headers['x-user-id'] as string ?? 'anon',
    );
    // user-a exhausts their limit
    await request(app).get('/api/data').set('x-user-id', 'user-a');
    const resA = await request(app).get('/api/data').set('x-user-id', 'user-a');

    // user-b has a fresh window
    const resB = await request(app).get('/api/data').set('x-user-id', 'user-b');

    expect(resA.status).toBe(429);
    expect(resB.status).toBe(200);
    await store.shutdown();
  });

  it('fails open when storage throws — returns 200, not 500', async () => {
    const faultyStore: StorageAdapter = {
      increment: async () => { throw new Error('storage unavailable'); },
      shutdown:  async () => {},
    };
    const { app } = buildTestApp(60_000, 5, faultyStore);
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(200); // fail-open: availability over correctness
  });
});
