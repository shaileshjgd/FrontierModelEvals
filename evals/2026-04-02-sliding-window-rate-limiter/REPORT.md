# Sliding Window Rate Limiter — Model Eval
April 2, 2026

Eight models. One task. The same prompt, no system instructions, default temperature.

---

## The task

> Write a production-ready sliding window rate limiter middleware for Express.js. Per-route configurable limits. In-memory default storage. Pluggable Redis adapter. HTTP 429 with Retry-After and X-RateLimit-* headers. TypeScript. Unit tests.

I picked this because it's genuinely hard to do right. Getting the sliding window logic correct is table stakes. The real test is whether the model understands Redis atomicity — because a naive implementation *looks* correct, passes tests, and then silently breaks under concurrent production traffic. It's the kind of bug that reaches you via an incident, not a code review.

The task also requires real test engineering. To actually validate a sliding window, you need fake timers. A test that only checks the happy path is worse than no test — it gives false confidence.

---

## Models tested

| Model | Access | Cost |
|-------|--------|------|
| Gemma 4 31B (`google/gemma-4-31b-it`) | NVIDIA free gateway | $0 |
| Qwen3 Coder 480B (`qwen/qwen3-coder-480b-a35b-instruct`) | NVIDIA free gateway | $0 |
| Gemma4 e4b | Ollama, M4 Mac (local) | $0 |
| Claude Opus 4.6 | Anthropic API | $$$$ |
| Claude Sonnet 4.5 | Anthropic API | $$ |
| GPT-4.1 | OpenAI API | $$$ |
| GPT-4o | OpenAI API | $$ |
| o3 | OpenAI API | $$$$ |

o3 returned an API error before producing any output. OpenAI changed `max_tokens` to `max_completion_tokens` for o3 without a deprecation window. 1.1 seconds, error body, nothing evaluable.

---

## Scoring rubric

Six dimensions, 1–10 each, unweighted average.

| Dimension | What I'm looking at |
|-----------|---------------------|
| Strategy & Architecture | Explicit layered design? Algorithm choice justified, not just chosen? |
| Code Correctness | Sliding window semantics right? Off-by-ones? Type bugs? |
| Redis Implementation | Atomicity level — see below |
| Test Quality | Do tests actually validate the sliding window property? Fake timers? Header assertions? |
| Production Readiness | Fail-open on storage failure? Timer lifecycle? Memory leak prevention? |
| Drop-in Readiness | Usable with minimal editing, or does it need a full Redis implementation before it deploys? |

---

## Quality scores

Infrastructure doesn't write code. These scores reflect what each model produced, regardless of how long it took to arrive.

Run1 scores are from the canonical April 2 evaluation. N-run averages incorporate additional runs collected April 3 (see [MANIFEST.md](MANIFEST.md) for per-run breakdown).

| Model | Strategy | Correctness | Redis | Tests | Production | Drop-in | Run1 | N-run avg |
|-------|----------|-------------|-------|-------|------------|---------|------|-----------|
| Claude Opus 4.6 | 10 | 10 | 10 | 9 | 10 | 9 | 9.7 | **9.6** (N=2) |
| Gemma 4 31B | 10 | 10 | 9 | 9 | 8† | 10 | 9.3† | **7.1** (N=3) |
| GPT-4.1 | 8 | 9 | 8 | 9 | 8 | 9 | 8.5 | **8.3** (N=2) |
| Claude Sonnet 4.5 | 8 | 8 | 5 | 7 | 8 | 8 | 7.3 | **7.4** (N=2) |
| Gemma4 e4b (local) | 8 | 8 | 2† | 6 | 8 | 7 | 6.5† | **6.2** (N=2) |
| Qwen3 Coder 480B | 6 | 6 | 4 | 5 | 5 | 5 | 5.6 | **5.6** (N=3) |
| GPT-4o | 6 | 6 | 2 | 7 | 5 | 5 | 5.2 | **5.0** (N=3) |
| o3 | — | — | — | — | — | — | fail | fail |

Dimension scores above reflect the run1 (canonical) output only. † = corrected post-publication after inter-rater review (Gemma 4 31B Production 10→8; e4b Redis 5→2 — both confirmed by direct file inspection; see [EVIDENCE.md](EVIDENCE.md)).

---

## Observed latency

Not a fair comparison across access types. Paid dedicated APIs, shared free-tier GPU, and local hardware each carry different overhead. Read the timing section before drawing conclusions.

| Model | Access | Warm-timed latency | Driver |
|-------|--------|--------------------|--------|
| Qwen3 Coder 480B | NVIDIA free tier | 13.8s ✓ | Model generation — MoE, low compute per token |
| GPT-4o | OpenAI API | 16.3s ✓ | Model generation |
| Claude Sonnet 4.5 | Anthropic API | 33.8s ✓ | Model generation |
| GPT-4.1 | OpenAI API | 23.2s ✓ | Model generation |
| Claude Opus 4.6 | Anthropic API | ~35s | Model generation, large dense model |
| Gemma4 e4b | Ollama / M4 16GB | ~75s | Local hardware ceiling |
| Gemma 4 31B | NVIDIA free tier | 255s ✓ | Free tier throughput throttle, not model speed |
| o3 | OpenAI API | 1.1s | API error, no output |

✓ = warm probe fired immediately before full task. See timing section for methodology.

---

## Redis: where everything separated

No other dimension showed this range, and none has more direct production risk.

Opus 4.6 was the only model that used Lua scripting — prune, add, count as a single atomic transaction on the Redis server. Nothing can interleave. This is how `rate-limiter-flexible` works in production, and it's the only approach that's correct under arbitrary concurrency. Every other model left a race window somewhere.

Gemma 4 31B and GPT-4.1 both used ZSET pipelines. Commands batch but don't execute atomically — there's a gap between reading the count and writing the new entry where a concurrent request can sneak in. At most traffic levels this won't matter. At extreme concurrency on a hot key it will, and you'll see the limit exceeded by some margin. Both models correctly handled the subtler issue that most implementations miss: a blocked request should not be added to the timestamp log, because that penalizes the user's next window. Both got it right.

Sonnet 4.5 stored timestamps as a serialized JSON string and used SETEX for TTL. The sequence is GET → deserialize → filter → push → SET. Two concurrent requests read the same count, both pass the limit check, both write back — one overwrites the other. Rate limit bypassed. This will happen under any meaningful concurrency, not occasionally. The in-memory implementation was fine, which is why it didn't score lower — but this Redis adapter goes in the bin.

GPT-4o wrote one paragraph explaining that a Redis adapter could be built using ioredis. No code.

Qwen3 had a missing prune call in the Redis implementation — `ZRANGEBYSCORE` was used to count entries within the window, but there was no corresponding `ZREMRANGEBYSCORE` to remove old ones. The ZSET grows without bound during sustained traffic. The in-memory implementation was correct, so this only breaks in distributed deployment, which is the worst place to find a bug.

Full code for each is in [EVIDENCE.md](EVIDENCE.md).

---

## What made Gemma 4 31B score 9.3 on run1

It opened with a complexity table — O(N) for memory store, O(log N) for Redis ZSET — before any code. It explained why timestamp tracking is more accurate than the fixed-window counter approximation, not just which one it was using.

Three things matter in sliding window correctness and most implementations miss at least one: `count < limit` not `<=`, prune before counting not after, and don't add blocked requests to the log. It got all three. That last one is subtle — if you log a request that you just blocked, that request starts eating into the user's next window before they've used it.

Tests included `jest.useFakeTimers()` to simulate window expiry without sleeping. That's how you actually test a sliding window. Fail-open catch block. `pexpire` on every Redis key for idle-user cleanup. Retry-After from the oldest window timestamp, not a fixed offset.

The gap from Opus: no Lua scripting. Pipeline is good enough for most workloads but isn't bulletproof.

---

## Where Opus edged ahead

Lua atomicity is the main one. Beyond that: binary search for O(log N) timestamp pruning instead of linear filter, `sweepInterval.unref()` so the cleanup timer doesn't prevent Node.js from exiting cleanly, a `shutdown()` lifecycle hook, and picomatch for glob route patterns. All production operations details. The response was truncated before completion — hit the token limit on scaffolding, not core logic.

---

## GPT-4.1 — best tests

Integration tests using supertest with actual header assertions on `x-ratelimit-limit`, `x-ratelimit-remaining`, `retry-after`. Injected `keyGenerator` for controlled test isolation. Both passing and blocking scenarios end-to-end. That's how production middleware should be tested. Redis used node-redis v4 multi() — correct approach, different API from ioredis but the same pattern as Gemma.

Confirmed warm-timed latency: 23,208ms.

---

## Why Qwen3 Coder 480B scored 5.6

This one surprised me given its benchmark position. The in-memory implementation was correct. The Redis implementation was missing a prune call entirely — `ZRANGEBYSCORE` counted entries within the window but there was no `ZREMRANGEBYSCORE`, so the ZSET grows without bound under sustained traffic. Tests were stubs — no fake timers, no header assertions, no sliding window expiry validation. Fail-open handling was absent. The output was technically capable code that wouldn't survive a distributed production deployment.

I think the benchmark scores reflect something real: Qwen3 is strong at algorithmic correctness and syntax. The operational layer — the things that separate code that works on localhost from code that ships — is weaker. That's not a knock on the model generally, it's what this specific eval measured.

---

## Timing

All wall-clock timings via Python `time.time()`. I was using zsh `$((END-START))` initially — it silently breaks when an API response body contains a newline, which they all do. Switched to Python after catching wrong GPT-4o numbers.

For paid APIs (Anthropic, OpenAI), observed latency reflects model generation speed. They run on dedicated infrastructure with no queue overhead. For NVIDIA's free tier, observed latency is model generation plus however long the request sat in queue plus any throughput throttle applied to sustained generation. Those components aren't separable from outside the cluster.

The benchmark ran sequentially: each model gets a short warm probe, then the full task fires immediately. For NVIDIA models this maximises the chance the GPU is still allocated when the full task lands.

Gemma 4 31B completed the full task in 255,590ms after a 7,544ms warm probe — a warm-model number, not cold start. That latency is the free tier's sustained throughput ceiling for a dense 31B model generating 3,000 tokens. It's real, but it's an access constraint. The same model on dedicated or paid NVIDIA infrastructure wouldn't behave this way. Qwen3 480B completed in 13,762ms after a 754ms warm probe — its MoE architecture (~35B active params per pass) stays within the free tier's throughput budget.

Quality scoring ran on April 2. The sequential warm-probe latency run (short probe then immediate full task, one model at a time) ran on April 3. Those are the confirmed timings in the table above. Scores reflect April 2 outputs; latencies reflect April 3 reruns where marked ✓, prior runs for the rest.

Score differences above 1.5 points reflect structural capability gaps and are reliable — the difference between Lua atomicity and a missing prune call is not ambiguous. Differences under 1.0 point may reflect run-to-run variance and should be treated as approximately equivalent. N-run averages (collected April 3) are more reliable than any single run; the run1 scores are canonical for the individual run but should not be read as ceiling estimates.

---

## What this changes

On a single run, the free tier reached the same tier as the most expensive paid model — 9.3 vs. 9.7, a 0.4-point gap. Across multiple runs, the picture is more nuanced.

Opus was consistent: 9.7 on run1, 9.5 on run2 — both runs produced Lua scripting with correct conditional add. Average 9.6. That's a reliable capability, not a lucky sample.

Gemma 4 31B showed high variance: 9.3 on run1, 6.3 and 5.7 on runs 2 and 3. The difference was specifically the cleanup of blocked entries — run1 did a `ZREM` after the pipeline to remove entries for rejected requests; runs 2 and 3 omitted it. The model has the ceiling. It doesn't always hit it.

The subtler finding: Redis atomicity is a better signal of systems reasoning depth than any coding benchmark I've seen. You can't answer it correctly without understanding concurrency, distributed correctness, and what happens when your abstraction leaks under load — all at once. One model out of eight consistently nailed it. Two got close enough. The rest had gaps ranging from acceptable-with-caveats to don't-ship-this.

How I'm routing now: Opus for infrastructure work where correctness is non-negotiable — the Lua atomicity result was consistent across runs. Gemma 4 31B for architecture and design reviews where it's a starting point, not the final output. Qwen3 for fast implementation loops. Sonnet for work touching sensitive data (zero-retention policy). GPT-4o dropped a full algorithm class on run3 — use with active review on production code.

---

*Raw outputs: [raw-outputs/](raw-outputs/)*  
*Code excerpts and timing data: [EVIDENCE.md](EVIDENCE.md)*  
*Author: [medium.com/@shaileshjgd](https://medium.com/@shaileshjgd)*
