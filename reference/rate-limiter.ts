/**
 * Reference Implementation — Sliding Window Rate Limiter
 *
 * This is the evaluator's ground truth for NNC-EVAL-2026-001. It defines what a
 * full-credit response looks like on each scoring dimension of the benchmark rubric.
 * Models were scored by comparing their output against the behaviors demonstrated here.
 *
 * Stack: Express.js · TypeScript · Redis (ioredis) · Node.js
 */

import type { Request, Response, NextFunction } from 'express';
import type { Redis } from 'ioredis';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateLimiterOptions {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed per window per key. */
  maxRequests: number;
  /**
   * Derives the rate-limit key from the request.
   * Defaults to IP + route path: "{ip}:{path}"
   */
  keyGenerator?: (req: Request) => string;
}

export interface StorageAdapter {
  /**
   * Record a request attempt for the given key and return the window state.
   * The implementation MUST NOT add the timestamp if the request is over the limit —
   * blocked requests must not contaminate the next window.
   */
  increment(key: string, windowMs: number, maxRequests: number): Promise<WindowState>;

  /** Release resources (timers, connections). */
  shutdown(): Promise<void>;
}

export interface WindowState {
  /** Number of requests in the current window, counting this one if allowed. */
  count: number;
  /** Whether this request was permitted. */
  allowed: boolean;
  /**
   * Unix timestamp (ms) when the oldest in-window request expires.
   * Used to compute Retry-After and X-RateLimit-Reset headers.
   */
  resetTime: number;
}

// ─── In-Memory Storage ────────────────────────────────────────────────────────

/**
 * In-process sliding window store. Correct for single-instance deployments.
 * Not suitable for distributed/multi-replica use — use RedisStore instead.
 */
export class InMemoryStore implements StorageAdapter {
  /** Maps each key to a sorted array of request timestamps (ascending). */
  private windows = new Map<string, number[]>();
  private sweepInterval: ReturnType<typeof setInterval>;

  /**
   * @param sweepIntervalMs  How often to evict fully-expired keys. Default: 60s.
   *                         The timer is unref()'d so it will not keep the Node.js
   *                         process alive after all other work completes.
   */
  constructor(sweepIntervalMs = 60_000) {
    this.sweepInterval = setInterval(() => this.sweep(), sweepIntervalMs);
    this.sweepInterval.unref();
  }

  async increment(key: string, windowMs: number, maxRequests: number): Promise<WindowState> {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Retrieve (or initialize) the sorted timestamp list for this key
    let timestamps = this.windows.get(key) ?? [];

    // Binary search: find the first timestamp still inside the window — O(log N) pruning
    const cutoff = this.lowerBound(timestamps, windowStart);
    timestamps = timestamps.slice(cutoff);

    const count = timestamps.length;
    const allowed = count < maxRequests;

    if (allowed) {
      // Only record the timestamp if the request is permitted.
      // Blocked timestamps must NOT be stored — they would inflate the count
      // and unfairly penalize the client's next window.
      timestamps.push(now);
      this.windows.set(key, timestamps);
    }

    // resetTime: when the oldest in-window request expires
    const resetTime = timestamps.length > 0
      ? timestamps[0] + windowMs
      : now + windowMs;

    return {
      count: allowed ? count + 1 : count,
      allowed,
      resetTime,
    };
  }

  async shutdown(): Promise<void> {
    clearInterval(this.sweepInterval);
    this.windows.clear();
  }

  /** Evict keys whose entire timestamp window has expired. */
  private sweep(): void {
    const cutoffAge = Date.now() - 86_400_000; // 24h — generous upper bound
    for (const [key, timestamps] of this.windows) {
      const cutoff = this.lowerBound(timestamps, cutoffAge);
      if (cutoff === timestamps.length) {
        this.windows.delete(key);
      } else if (cutoff > 0) {
        this.windows.set(key, timestamps.slice(cutoff));
      }
    }
  }

  /**
   * Returns the index of the first element strictly greater than `threshold`.
   * Standard lower-bound binary search — O(log N).
   */
  private lowerBound(arr: number[], threshold: number): number {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] <= threshold) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }
}

// ─── Redis Storage (Lua — fully atomic) ──────────────────────────────────────

/**
 * Distributed sliding window store backed by Redis sorted sets.
 *
 * Atomicity guarantee: the entire prune → conditional-add → count sequence
 * executes as a single Lua script on the Redis server. No race condition is
 * possible at any concurrency level. This is the only approach that is
 * provably correct under arbitrary concurrent access.
 *
 * Contrast with pipeline/multi-exec approaches: pipelines batch network
 * round-trips but are NOT atomic — a theoretical race window exists between
 * ZCARD and the allow/deny decision.
 */
export class RedisStore implements StorageAdapter {
  private client: Redis;

  /**
   * Lua script executed atomically on the Redis server.
   *
   * Logic:
   *  1. Remove all entries with score ≤ windowStart (expired timestamps)
   *  2. Count remaining entries
   *  3. If count < maxRequests: add current timestamp (allowed)
   *     Else: do not add (blocked — preserves window integrity)
   *  4. Set key TTL to windowMs (auto-cleanup for idle users)
   *  5. Return [count, allowed (0|1), resetTime]
   */
  private readonly luaScript = `
    local key         = KEYS[1]
    local windowStart = tonumber(ARGV[1])
    local now         = tonumber(ARGV[2])
    local maxReqs     = tonumber(ARGV[3])
    local windowMs    = tonumber(ARGV[4])

    redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
    local count = redis.call('ZCARD', key)

    local allowed = 0
    if count < maxReqs then
      -- Use a unique member value to handle requests arriving in the same millisecond
      redis.call('ZADD', key, now, tostring(now) .. ':' .. redis.call('INCR', key .. ':seq'))
      count = count + 1
      allowed = 1
    end

    redis.call('PEXPIRE', key, windowMs)

    local oldest    = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local resetTime = oldest[2] and (tonumber(oldest[2]) + windowMs) or (now + windowMs)

    return {count, allowed, resetTime}
  `;

  constructor(client: Redis) {
    this.client = client;
  }

  async increment(key: string, windowMs: number, maxRequests: number): Promise<WindowState> {
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      const result = await this.client.eval(
        this.luaScript,
        1,           // number of keys
        key,         // KEYS[1]
        String(windowStart),
        String(now),
        String(maxRequests),
        String(windowMs),
      ) as [number, number, number];

      return {
        count:     result[0],
        allowed:   result[1] === 1,
        resetTime: result[2],
      };
    } catch (err) {
      // Fail-open: if Redis is unavailable, allow the request rather than
      // taking down the service. Log the error for observability.
      console.error('[rate-limiter] Redis error — failing open:', err);
      return { count: 0, allowed: true, resetTime: now + windowMs };
    }
  }

  async shutdown(): Promise<void> {
    this.client.disconnect();
  }
}

// ─── Middleware Factory ───────────────────────────────────────────────────────

/**
 * Returns an Express middleware that enforces a sliding window rate limit.
 *
 * Usage:
 *   const store = new InMemoryStore();
 *   app.use('/api', createRateLimiter({ windowMs: 60_000, maxRequests: 100 }, store));
 *
 * For distributed deployments:
 *   const redis = new Redis({ host: 'localhost', port: 6379 });
 *   const store = new RedisStore(redis);
 *   app.use(createRateLimiter({ windowMs: 60_000, maxRequests: 100 }, store));
 */
export function createRateLimiter(
  options: RateLimiterOptions,
  storage: StorageAdapter,
) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req: Request) => `${req.ip ?? 'unknown'}:${req.path}`,
  } = options;

  return async function rateLimiterMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const key = keyGenerator(req);

    let state: WindowState;
    try {
      state = await storage.increment(key, windowMs, maxRequests);
    } catch (err) {
      // Unexpected error from storage layer — fail open, log, continue
      console.error('[rate-limiter] Unexpected storage error — failing open:', err);
      return next();
    }

    // RFC 6585 §4 headers
    const remaining = Math.max(0, maxRequests - state.count);
    const resetSec   = Math.ceil(state.resetTime / 1000);  // Unix epoch seconds
    const retryAfter = Math.max(1, Math.ceil((state.resetTime - Date.now()) / 1000));

    res.setHeader('X-RateLimit-Limit',     maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset',     resetSec);

    if (!state.allowed) {
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json({
        error:      'Too Many Requests',
        retryAfter,
      });
      return;
    }

    next();
  };
}
