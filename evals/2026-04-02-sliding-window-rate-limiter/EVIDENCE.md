# Evidence

Redis implementation code from each model and timing data. This is the basis for the Redis scores in [REPORT.md](REPORT.md) — read it here and decide whether you'd score them differently.

---

## Rubric Consistency Check (April 3, 2026)

A second AI model was independently prompted to apply the same rubric, with no access to the original scores, score tables, or any existing analysis. It received only the six-dimension rubric with scoring descriptors and the seven scored raw output files, read sequentially. This is a rubric consistency check — it tests whether the rubric produces stable rank ordering when applied independently. It is not inter-rater reliability in the psychometric sense; independent human expert scoring remains the primary methodological gap. Limitations are disclosed in [REPORT.md](REPORT.md) (Limitation 3).

### Score comparison — run1

| Model | S&A (S1/S2) | Corr (S1/S2) | Redis (S1/S2) | Tests (S1/S2) | Prod (S1/S2) | Drop-in (S1/S2) | Total S1 | Total S2 | Δ |
|-------|-------------|--------------|---------------|---------------|--------------|-----------------|----------|----------|---|
| Claude Opus 4.6 | 10/10 | 10/9 | 10/9 | 9/7 | 10/9 | 9/6 | 9.7 | 8.3 | −1.4 |
| Gemma 4 31B | 10/8 | 10/7 | 9/6 | 9/8 | 8†/5 | 10/8 | 9.3† | 7.0 | −2.3 |
| GPT-4.1 | 8/8 | 9/8 | 8/7 | 9/8 | 8/6 | 9/8 | 8.5 | 7.5 | −1.0 |
| Claude Sonnet 4.5 | 8/8 | 8/8 | 5/3 | 7/5 | 8/6 | 8/5 | 7.3 | 5.8 | −1.5 |
| Gemma4 e4b | 8/6 | 8/5 | 2†/2 | 6/3 | 8/4 | 7/3 | 6.5† | 3.8 | −2.7 |
| Qwen3 Coder 480B | 6/5 | 6/4 | 4/3 | 5/2 | 5/3 | 5/3 | 5.6 | 3.3 | −2.3 |
| GPT-4o | 6/5 | 6/4 | 2/2 | 7/4 | 5/3 | 5/3 | 5.2 | 3.5 | −1.7 |

S1 = author (original scorer). S2 = second AI model, applied rubric independently. Δ = S2 − S1. † = corrected after second-pass review; see "Confirmed scoring corrections" below.

### Agreement statistics

- **Spearman rank correlation ρ = 0.83** — strong rank-order agreement. The same structural ordering is preserved: Opus top, GPT-4.1 and Gemma close behind, Sonnet mid-tier, lower models consistent.
- **Pearson r = 0.93** — very strong linear correlation on total scores.
- **Systematic calibration offset: S2 consistently ~2 points lower** — not random noise. S2 applied stricter standards to truncated outputs (not crediting capabilities the scorer could not directly observe in the file), and scored Production and Tests more harshly throughout. This is a calibration difference, not a finding of scoring error.

### Confirmed scoring corrections from S2 review

S2's off-by-one claim for Gemma 31B Correctness (`count <= limit`) was investigated and found to be a misreading: in Gemma's implementation, `current` = post-add count, so `current <= limit` is mathematically equivalent to `count_before_add < limit`. **No correction applied to Correctness.**

Two findings were confirmed by direct file inspection:

**1. Gemma 4 31B — Production: 10 → 8**

File inspection confirms no `setInterval`, no sweep timer, and no `unref()` in the in-memory store (`gemma4-31b-run1.txt`). The original score of 10 is also internally inconsistent with REPORT.md Section 4.2.4, which states: "Only Claude Opus 4.6 and Claude Sonnet 4.5 included this [sweepInterval.unref()]." The corrected score of 8 reflects strong production readiness (fail-open, composite keys, pexpire on Redis) while acknowledging the missing lifecycle management. Revised run1 total: **9.3** (was 9.7).

**2. Gemma4 e4b — Redis: 5 → 2**

`gemma4-e4b-local.txt` explicitly labels the Redis adapter a stub: *"For brevity, I am using a stub for the actual Redis client interaction."* The `get()` method returns `null`; `set()` calls `console.log`. This is "described but not implemented" per the rubric (score=2), not a partial implementation (score=4–5). The in-memory store is a real implementation and is unaffected. Revised run1 total: **6.5** (was 7.0).

### What the second-pass review did not change

- The Redis dimension stratification (Lua > pipeline > JSON blob > not implemented) was preserved across both scorers — the most operationally significant finding is also the most robust.
- The top-tier / strong-tier / weak-tier ordering is preserved.
- Opus remains the clear leader on Redis atomicity and overall.
- Gemma 31B's variance story (9.3, 6.3, 5.7 → avg 7.1) is unchanged in character.

---

## Third Rubric Application — Cross-Family Bias Check (April 3, 2026)

A third independent rubric application (S3) was conducted using `nvidia/llama-3.1-nemotron-ultra-253b-v1` (Nemotron Ultra 253B) via NVIDIA's inference API. S3 is from a different model family than S2. This pass was added specifically to check for same-family bias: S2 is in the same model family as the highest-scoring model (Claude Opus 4.6). If S2 had introduced pro-Anthropic bias, S3 — from a different family — would be expected to show a smaller gap between Anthropic and non-Anthropic models than S2 did.

Scorer: `nvidia/llama-3.1-nemotron-ultra-253b-v1`. Chain-of-thought reasoning model; response extracted from `reasoning_content` field where `content` was None (model exhausted output budget during reasoning phase on some responses). All seven run1 raw output files scored blind; S3 had no access to S1 or S2 scores.

**Note on Opus S3 score:** Opus scored 10.0 from Nemotron. The response was extracted from `reasoning_content` (truncated output). This perfect score should be treated with caution — it may reflect incomplete scoring of the file rather than a genuine 10.0 assessment. It is included in the statistics for completeness but flagged.

**Note on Sonnet and e4b Tests=1:** Both scored 1 on the Tests dimension; the test sections in their outputs were not visible in the excerpt the scorer processed due to truncation. This is a data artifact, not a finding about test quality.

### S3 score comparison — run1

| Model | S&A | Corr | Redis | Tests | Prod | Drop-in | Total S3 | Total S1 | Total S2 |
|-------|-----|------|-------|-------|------|---------|---------|---------|---------|
| Claude Opus 4.6 | 10 | 10 | 10 | 10 | 10 | 10 | **10.0** | 9.7 | 8.3 |
| GPT-4.1 | 9 | 9 | 9 | 9 | 8 | 9 | **8.8** | 8.5 | 7.5 |
| Gemma 4 31B | 9 | 8 | 7 | 8 | 9 | 9 | **8.3** | 9.3 | 7.0 |
| Claude Sonnet 4.5 | 9 | 9 | 2 | 1† | 8 | 7 | **6.0** | 7.3 | 5.8 |
| Qwen3 Coder 480B | 9 | 7 | 4 | 5 | 6 | 7 | **6.3** | 5.6 | 3.3 |
| GPT-4o | 8 | 6 | 2 | 6 | 5 | 7 | **5.7** | 5.2 | 3.5 |
| Gemma4 e4b | 9 | 8 | 2 | 1† | 6 | 7 | **5.5** | 6.5 | 3.8 |

† Tests=1 reflects truncation artifact (test section not visible in scored excerpt), not absence of tests.

### Three-way agreement statistics

| Pair | Spearman ρ | Pearson r |
|------|-----------|----------|
| S1 vs S2 | 0.929 | 0.962 |
| S1 vs S3 | 0.786 | 0.887 |
| S2 vs S3 | 0.750 | 0.911 |

Mean total scores across all models: S1 = 7.44, S2 = 5.60, S3 = 7.23.

All three scorers preserve strong rank-order agreement (ρ ≥ 0.75). S1 and S3 (the two scorers closest in calibration) have the highest pairwise linear agreement (r=0.887 between them; S2 pairs at r=0.911/0.962). The systematic S2 calibration offset (approximately −2 points) observed in the S1/S2 comparison is confirmed: S2's mean (5.60) sits well below both S1 (7.44) and S3 (7.23).

### Bias analysis

The key question: does S2 show pro-Anthropic bias relative to S3 (the cross-family scorer)?

| Model | S3 − S2 | Family |
|-------|---------|--------|
| Claude Opus 4.6 | +1.7 | Anthropic |
| Claude Sonnet 4.5 | +0.2 | Anthropic |
| Gemma 4 31B | +1.3 | Google |
| GPT-4.1 | +1.3 | OpenAI |
| Qwen3 Coder 480B | +3.0 | Alibaba |
| GPT-4o | +2.2 | OpenAI |
| Gemma4 e4b | +1.7 | Google |

Average S3−S2 delta — **Anthropic models: +0.95** / **Non-Anthropic models: +1.90**

If S2 had introduced pro-Anthropic bias, we would expect Anthropic models to score *relatively higher* under S2 than under S3 — meaning a smaller S3-S2 delta for Anthropic models. The data shows the opposite: S2 was *harder on* Anthropic models relative to S3 (Anthropic delta +0.95 vs. non-Anthropic delta +1.90). **The cross-family comparison does not support a pro-Anthropic bias in S2.** The bias concern is not confirmed empirically and remains a disclosure item only.

The Redis stratification (Lua > pipeline > JSON blob > not implemented) is preserved across all three scorers. Structural findings are robust to scorer family.

---

**Run lineage:** Run1 (April 2) was the initial quality-scoring run per model. Additional runs (April 3) were also quality-scored using the same six-dimension rubric — all runs listed in the "Additional scored runs" column of [MANIFEST.md](MANIFEST.md) are scored evidence, not timing-only controls. Files with "warm" in the name were collected using the warm-probe timing methodology (a short warm-up probe fired first, then the full task immediately); "warm" refers to the collection method, not the scoring status. Per-dimension breakdowns for run1 are in [REPORT.md](REPORT.md); Round 2 per-run scoring rationale is in the Round 2 Evidence section below.

---

### Claude Opus 4.6 — Lua scripting

Score: 10. The only fully atomic implementation. Prune, add, count in one Redis transaction.

```typescript
private readonly luaScript = `
  local key = KEYS[1]
  local windowStart = tonumber(ARGV[1])
  local now = tonumber(ARGV[2])
  local nowStr = ARGV[3]

  redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
  redis.call('ZADD', key, now, nowStr)
  local count = redis.call('ZCARD', key)
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  redis.call('PEXPIRE', key, ARGV[4])
  return {count, oldest[2] or nowStr}
`;
```

---

### Gemma 4 31B — ZSET pipeline

Score: 9. Pipeline, not atomic. But it correctly removes the just-added entry when a request gets blocked — most implementations miss this and penalize the user's next window.

```typescript
const pipeline = this.redis.pipeline();
pipeline.zremrangebyscore(redisKey, 0, windowStart);
pipeline.zcard(redisKey);
pipeline.zadd(redisKey, now, now.toString());
pipeline.pexpire(redisKey, windowMs);

const results = await pipeline.exec();
const current = (results[1][1] as number) + 1;
const allowed = current <= limit;

if (!allowed) {
  await this.redis.zrem(redisKey, now.toString()); // don't penalize blocked requests
}
```

---

### GPT-4.1 — node-redis multi()

Score: 8. Same pattern as Gemma using the node-redis v4 API. Had the best test suite of the batch — supertest integration tests with real header assertions.

```typescript
const pipe = this.redis.multi();
pipe.zRemRangeByScore(redisKey, 0, minTime);
pipe.zAdd(redisKey, [{ score: timestamp, value: '' + timestamp }]);
pipe.zCard(redisKey);
pipe.zRange(redisKey, 0, 0);
pipe.pexpire(redisKey, windowMs);

const [, , countRaw, oldestArr]: any = await pipe.exec();
```

---

### Claude Sonnet 4.5 — SETEX JSON blob

Score: 5. Scored from `claude-sonnet-4-5.txt`. Race condition. Two concurrent requests read the same `requestLog`, both pass the limit check, both write back. One overwrites the other. This happens under normal concurrency, not just under load.

```typescript
// In storage:
await this.client.setex(redisKey, Math.ceil(ttl / 1000), JSON.stringify(value));

// In the rate limiter — the race:
let requestLog = await this.storage.get(key);       // request A and B both read here
requestLog.timestamps = requestLog.timestamps.filter(...);
if (isAllowed) {
  requestLog.timestamps.push(now);
  await this.storage.set(key, requestLog, ...);     // A writes, then B overwrites A's write
}
```

Note: `claude-sonnet-4-5-run2-warm.txt` (run2) produced a Lua-scripted implementation — a materially different approach from run1's SETEX JSON blob. It was quality-scored at 7.5 and is included in the N-run average. See Round 2 Evidence section below for scoring rationale.

---

### GPT-4o — not implemented

Score: 2. This is the full Redis implementation:

```
"To implement a Redis adapter, you would need to use a library like `ioredis`.
The adapter would follow the same interface as `InMemoryRateLimiter` but would
use Redis commands to store and retrieve request timestamps."
```

---

### Qwen3 Coder 480B — buggy ZSET

Score: 4. The implementation (run1: `qwen3-coder-480b-run1.txt`) uses `ZRANGEBYSCORE` to count entries within the window, but there is no `ZREMRANGEBYSCORE` call — old entries are never pruned from the ZSET. The key grows without bound during sustained traffic. The per-window count is still computed correctly (the range query filters correctly), but the ZSET itself accumulates all historical entries. There is also a race condition: the count is read before the current entry is added, without atomicity.

```typescript
// No prune call anywhere — the ZSET grows indefinitely:
const keyScores = await this.client.ZRANGEBYSCORE(keyBase, windowStart, now, 'BYSCORE');
await this.client.ZADD(keyBase, { score: now, member: now.toString() });
await this.client.EXPIRE(keyBase, windowMs / 1000);
return { count: keyScores.length + 1, resetTime: now + windowMs };
```

Note: `qwen3-coder-480b-run3-warm.txt` (run3) produced a different Redis implementation that included a correct `ZREMRANGEBYSCORE` prune call — the specific defect absent from run1. It was quality-scored at 7.8 and is included in the N-run average. See Round 2 Evidence section below for scoring rationale.

---

---

## Round 2 Evidence — Additional Scored Runs (April 3, 2026)

Each entry below documents: the specific code change from run1, which dimensions were affected and why, and the resulting aggregate score. For Qwen3 Coder 480B run2 a full per-dimension table is included; for other runs the dimension impact is stated inline. All raw output files are in `raw-outputs/` for independent re-scoring using the rubric in REPORT.md Section 3.4.

---

### Claude Opus 4.6 — run2 (`claude-opus-4-6-run2.txt`) — Score: 9.5

Lua scripting again. The script prunes with `ZREMRANGEBYSCORE`, conditionally adds only if `currentCount < maxRequests` (so blocked requests never enter the ZSET), and calls `PEXPIRE` — all in one atomic transaction. Mechanistically identical to run1 on Redis.

**What changed vs run1:** Tests were present but no `jest.useFakeTimers()` usage found — the test suite covered middleware behavior but not the sliding window expiry property. This dropped the Test dimension by one point relative to run1.

**Dimension impact:** Test Quality 8 (−1). All other dimensions consistent with run1. Aggregate: 9.5.

---

### Gemma 4 31B — run2 (`gemma4-31b-run2.txt`) — Score: 6.3

ZSET pipeline retained. The specific detail that drove run1's 9.7 — a follow-up `ZREM` to remove the just-added entry when a request is blocked — is absent in run2. Blocked requests' timestamps remain in the ZSET, contaminating the count for subsequent requests in the same window.

**What changed vs run1:** Redis implementation missing the blocked-entry cleanup (3 lines). Architecture, in-memory correctness, and production readiness otherwise intact.

**Dimension impact:** Redis −2, Drop-in −1 (incomplete behavior visible to a reviewer), Test Quality −1 (minor). Aggregate: 6.3.

---

### Gemma 4 31B — run3 (`gemma4-31b-run3-warm.txt`) — Score: 5.7

Same pattern as run2 — ZSET pipeline without blocked-entry cleanup. Further regression on completeness and test coverage relative to run2.

**Dimension impact:** Continued absence of blocked-entry cleanup. Additional drops in Test Quality and Drop-in readiness. Aggregate: 5.7.

---

### GPT-4.1 — run2 (`gpt-4-1-run2.txt`) — Score: 8.0

ZSET pipeline via node-redis `multi()`: `zRemRangeByScore → zAdd → zCard → zRange → expire`. The add-before-check pattern means blocked requests are added to the ZSET before the count is evaluated — with no cleanup call for rejected entries. Strong supertest integration tests with header assertions preserved.

**What changed vs run1:** Redis implementation adds before checking (blocked entries contaminate ZSET), down from run1's cleaner implementation. Production Readiness dropped slightly.

**Dimension impact:** Redis −1, Production −1 (blocked-entry contamination is an operational issue under sustained load). Aggregate: 8.0.

---

### Claude Sonnet 4.5 — run2 (`claude-sonnet-4-5-run2-warm.txt`) — Score: 7.5

Materially different implementation from run1. Run2 used Lua scripting — the same approach as Opus — rather than the SETEX JSON blob that caused the race condition in run1. This is a significant improvement on the Redis dimension.

**What changed vs run1:** Redis implementation upgraded from SETEX JSON blob (race-prone, score 5) to Lua scripting (atomic, score 10). Minor drops on completeness.

**Dimension impact:** Redis +5 (from 5 to 10). Partial offsets in other dimensions for completeness and test coverage. Aggregate: 7.5. The high run-to-run variance on the Redis dimension for Sonnet (5 → 10 across runs) reflects genuine non-determinism in implementation strategy, not just surface-level variation.

---

### Claude Sonnet 4.5 — run3 (`claude-sonnet-4-5-run3.txt`) — Score: not included in N-run average (truncated)

The response hit the `max_tokens=4000` limit mid-method before the tests section was written. Architecture and Redis adapter are scoreable; the Test Quality dimension cannot be evaluated from a truncated response. Excluded from the N-run average to avoid penalizing a capability limit imposed by the evaluation script, not the model. A rerun at `max_tokens=8192` would produce a fully scoreable response.

---

### Gemma4 e4b — run2 (`gemma4-e4b-local-run2.txt`) — Score: 5.8

Redis implementation regressed to `INCR+EXPIRE` — a fixed-window counter — despite comments in the code acknowledging the sliding window requirement. Run1 used a ZSET approach (score 5 on Redis); run2's INCR+EXPIRE is a different and simpler algorithm that does not implement the sliding window log at all.

**What changed vs run1:** Redis implementation switched from ZSET (incorrect but sliding-window-shaped) to INCR+EXPIRE (fixed-window). In-memory store remained correct for sliding window. No `jest.useFakeTimers()` in tests.

**Dimension impact:** Redis −2 (fixed window is categorically wrong for the specification). Test Quality −1 (no fake timers). Aggregate: 5.8.

---

### Qwen3 Coder 480B — run2 (`qwen3-coder-480b-run2.txt`) — Score: 3.5

Significant regression from run1. ZSET operations present but implementation structurally degraded across multiple dimensions: no architectural preamble or design narrative, reduced correctness on boundary handling, error handling replaced with bare `throw`, and tests reduced to placeholders without real assertions.

| Dimension | Run1 | Run2 | Delta | Reason |
|-----------|------|------|-------|--------|
| Strategy & Architecture | 6 | 4 | −2 | No component table or design narrative; jumps straight to code |
| Code Correctness | 6 | 5 | −1 | Boundary condition handling reduced; minor off-by-one risk |
| Redis | 4 | 4 | 0 | ZSET present, still missing ZREMRANGEBYSCORE prune call |
| Tests | 5 | 2 | −3 | Stub test bodies; `expect(true).toBe(true)` placeholders |
| Production | 5 | 3 | −2 | Bare `throw` on errors; no fail-open; no shutdown |
| Drop-in | 5 | 4 | −1 | Functional but requires significant additions before use |
| **Total** | **5.6** | **3.5** | **−2.1** | |

---

### Qwen3 Coder 480B — run3 (`qwen3-coder-480b-run3-warm.txt`) — Score: 7.8

Materially different implementation from run1 and run2. Run3 included a correct `ZREMRANGEBYSCORE` prune call — the specific defect missing from run1's ZSET implementation. This resolved the unbounded memory growth issue.

**What changed vs run1:** Redis implementation corrected to include expired-entry pruning. Architecture and test quality improved.

**Dimension impact:** Redis +3 (correct prune call), Strategy and Test Quality improvements. Aggregate: 7.8. This run demonstrates the model is capable of the correct implementation; the high run-to-run variance (5.6, 3.5, 7.8 — avg 5.6) indicates the behavior is not reliably produced.

---

### GPT-4o — run2 (`gpt-4o-run2-warm.txt`) — Score: 5.7

Improvement over run1's score of 5.2. Run1 described Redis integration in prose without code; run2 provided a partial implementation. Still below the threshold for production-ready distributed deployment.

**Dimension impact:** Redis improved from 2 (no code) to a partial implementation. Other dimensions modest. Aggregate: 5.7.

---

### GPT-4o — run3 (`gpt-4o-run3.txt`) — Score: 4.0

Run3 implemented a fixed-window counter (`INCR+PEXPIRE` / in-memory Map with reset-on-expiry) rather than a sliding window log. This is a different algorithm from runs 1 and 2 — it does not track per-request timestamps and does not satisfy the specification.

**Dimension impact:** Code Correctness and Redis both drop substantially (wrong algorithm). Aggregate: 4.0. This is the largest single-run regression in the dataset and is why GPT-4o's N-run average (5.0) is below its run1 score (5.2).

---

## Timing data

All Python `time.time()`. zsh arithmetic breaks with API response bodies containing newlines — switched after catching wrong GPT-4o numbers.

---

Sequential warm-probe methodology: short probe fires first, full task fires immediately on return. One model at a time to avoid GPU competition. Run April 3, 2026.

| Model | Warm probe | Full task | Access | Raw output |
|-------|-----------|-----------|--------|------------|
| Qwen3 Coder 480B | 754ms | 13,762ms | NVIDIA free | qwen3-coder-480b-run3-warm.txt |
| GPT-4o | 2,948ms | 16,288ms | OpenAI paid | gpt-4o-run2-warm.txt |
| GPT-4.1 | — | 23,208ms | OpenAI paid | gpt-4-1.txt (prior run) |
| Claude Sonnet 4.5 | 1,179ms | 33,843ms | Anthropic paid | claude-sonnet-4-5-run2-warm.txt |
| Claude Opus 4.6 | — | ~35s | Anthropic paid | claude-opus-4-6.txt (estimated) |
| Gemma 4 31B | 7,544ms | 255,590ms | NVIDIA free | gemma4-31b-run3-warm.txt |
| Gemma4 e4b | — | ~75s | Ollama / local | gemma4-e4b-local.txt (estimated) |
| o3 | — | 1,056ms | OpenAI paid | o3-api-error.txt — API error, no output |

Paid API timings reflect model generation speed on dedicated infrastructure and are directly comparable to each other. NVIDIA free tier timings include queue and throughput overhead and are not directly comparable.

Gemma 4 31B completed in 255,590ms after a 7,544ms warm probe — the probe confirms it was scheduled before the full task fired, so this is a warm-model number. That 4.3 minutes is the free tier's sustained throughput ceiling for a dense 31B model generating ~3,000 tokens. Qwen3 finished in 13.8s because its MoE architecture uses only ~35B active parameters per forward pass — well within what the free tier's shared compute can sustain.

Prior Gemma 4 31B full-task runs for reference:

| Run | Elapsed | Condition |
|-----|---------|-----------|
| Run 1 | N/A | Script failure |
| Run 2 | 151,181ms | Cold start |
| Run 3 | >300s | Warm model, hit 5-min timeout before completing |
| Run 4 | 255,590ms | Warm probe 7.5s before — cleanest warm-timed number |

Local: Gemma4 e4b on M4 Mac, 16GB RAM, ~75s estimated. No queue, no cold start, ceiling is hardware.
