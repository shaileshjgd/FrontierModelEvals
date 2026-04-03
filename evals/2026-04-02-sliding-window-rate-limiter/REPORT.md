# Comparative Evaluation of Large Language Models on Production Software Engineering Tasks

**Report ID:** NNC-EVAL-2026-001  
**Date:** April 2, 2026  
**Author:** Shailesh Bhujbal  
**Classification:** Public  
**Version:** 1.0

### About the Author

Shailesh Bhujbal — ML and analytics systems practitioner. [medium.com/@shaileshjgd](https://medium.com/@shaileshjgd)

### Raw Evidence

All Redis implementation code, scoring rationale, and timing data referenced in this report are published for independent verification:  
**GitHub:** https://github.com/shaileshjgd/FrontierModelEvals

---

## Abstract

This report presents a rigorous, multi-dimensional evaluation of eight large language models (LLMs) on a production-grade software engineering task. Models evaluated include frontier paid models — Claude Opus 4.6, Claude Sonnet 4.5, GPT-4.1, GPT-4o, and o3 — alongside freely available models accessed via NVIDIA's inference gateway — Gemma 4 31B, Qwen3 Coder 480B — and a locally-hosted quantized model, Gemma4 e4b via Ollama. The benchmark task requires complete implementation of a sliding window rate limiter middleware for Express.js, encompassing architectural reasoning, algorithmic correctness, distributed systems design, test quality, and production readiness. Scoring is conducted across six rubric dimensions scored independently, then averaged. Two to three independent quality-scoring runs were collected for seven of eight models (N=3 for Gemma 4 31B, Qwen3 Coder 480B, and GPT-4o; N=2 for Opus 4.6, GPT-4.1, Sonnet 4.5, and Gemma4 e4b); o3 produced no evaluable output due to a documented API parameter change. Key findings: (1) On a single run, **Google's Gemma 4 31B scored 9.3/10 vs. Claude Opus 4.6's 9.7/10** — both in the Top tier — demonstrating that the free tier can approach the quality ceiling of the most expensive paid models on this task class; (2) across N=2–3 runs, **Opus was consistent (avg 9.6) while Gemma showed significant variance (avg 7.1)**, indicating that single-run top-tier performance does not imply reliability; (3) Opus was the only model to produce Lua scripting across both scored runs, the only approach provably correct under arbitrary concurrency. On confirmed warm-probe latency, GPT-4o was fastest among paid models at 16.3s, followed by GPT-4.1 at 23.2s, Sonnet 4.5 at 33.8s, and Opus at ~35s. Qwen3 480B returned in 13.8s but runs on NVIDIA's free tier where latency includes queue overhead and is not directly comparable to paid API response times.

---

## 1. Introduction

The adoption of AI coding assistants in professional software engineering has accelerated dramatically over the past 24 months. However, practitioner decision-making remains hampered by a lack of domain-specific, task-grounded benchmarks. Popular leaderboards — MMLU, HumanEval, MATH — measure discrete reasoning capabilities in controlled settings that bear limited resemblance to the messy, multi-constraint nature of real software engineering tasks.

This evaluation is motivated by a practical question: **for a senior engineer building production infrastructure, which model delivers the best return on investment across quality, cost, speed, and data privacy?**

The benchmark was designed with three explicit constraints:

1. **Realism** — The task must represent a real production deliverable, not a toy problem.
2. **Multi-dimensional scoring** — No single metric captures engineering quality; the rubric must decompose correctness, architecture, tests, and operational readiness independently.
3. **Transparency** — Raw outputs, scoring rationale, and methodology must be reproducible.

---

## 2. Task Specification

### 2.1 Benchmark Prompt

> *"Write a production-ready sliding window rate limiter middleware for Express.js. Requirements: per-route configurable limits; in-memory storage as the default backend; pluggable Redis adapter for distributed deployments; HTTP 429 responses with Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset headers; full TypeScript types and interfaces; unit tests covering core algorithm and middleware behavior."*

### 2.2 Task Complexity Rationale

This task was selected because it is:

- **Algorithmically non-trivial** — The sliding window log algorithm requires correct timestamp management; the simpler fixed-window approach would not satisfy the specification.
- **Distributed systems aware** — Correct Redis implementation requires understanding of atomicity, race conditions, and the tradeoffs between Lua scripts, pipelining, and naive GET-SET sequences.
- **Architecturally decomposable** — A strong response requires explicit layer separation (storage, algorithm, middleware), not a monolithic function.
- **Testable** — The sliding window property (old requests expire as time advances) can only be validated with time injection or fake timers, distinguishing thorough from superficial test suites.
- **Operationally sensitive** — Production considerations (fail-open on storage failure, memory leak prevention, connection lifecycle, header compliance) separate professional implementations from technically correct but operationally fragile ones.

### 2.3 Ground Truth

The evaluator used a reference implementation developed independently prior to running model tests. The reference implementation included:

- Sliding window log algorithm with binary search timestamp pruning (O(log N))
- Redis adapter using Lua scripting for atomic ZREMRANGEBYSCORE + ZADD + ZCARD
- In-memory store with `setInterval.unref()` to prevent Node.js process retention
- Jest tests with `jest.useFakeTimers()` for deterministic sliding window simulation
- Fail-open error handling with structured logging
- Full RFC-compliant header generation

---

## 3. Methodology

### 3.1 Models and Access

| Model | Provider | Access Method | Cost | Data Residency |
|-------|----------|---------------|------|----------------|
| Gemma 4 31B (`google/gemma-4-31b-it`) | NVIDIA Inference Gateway | API (free tier) | $0 | NVIDIA servers |
| Qwen3 Coder 480B (`qwen/qwen3-coder-480b-a35b-instruct`) | NVIDIA Inference Gateway | API (free tier) | $0 | NVIDIA servers |
| Gemma4 e4b | Ollama (local) | localhost:11434 | $0 | On-device (M4 Mac) |
| Claude Opus 4.6 | Anthropic API | API (paid) | $$$$ | Anthropic (enterprise data controls†) |
| Claude Sonnet 4.5† | Anthropic API | API (paid) | $$ | Anthropic (enterprise data controls†) |
| GPT-4.1 | OpenAI API | API (paid) | $$$ | OpenAI servers |
| GPT-4o | OpenAI API | API (paid) | $$ | OpenAI servers |
| o3 | OpenAI API | API (paid) | $$$$ | N/A — API error |

**Note on o3:** The evaluation harness sent `max_tokens`, which is not the current request contract for o3; o3 returned an error within 1,056ms and produced no evaluable output. o3 is excluded from scored results.

**Note on model versions:** Claude Sonnet 4.6 (released February 2026) was not included in this benchmark set. The evaluation used model versions in active production use in the author's tooling as of April 2, 2026. Claude Sonnet 4.5 was the Sonnet-tier model in that configuration. Sonnet 4.6 will be included in subsequent evaluations.

**Note on data retention:** Anthropic's standard API retains data for up to 30 days. Zero-data-retention is available under qualifying enterprise arrangements. "Enterprise data controls" above refers to Anthropic's standard API data handling, not a confirmed zero-retention arrangement.

### 3.2 Evaluation Protocol

- All models received an identical, unmodified prompt
- No system prompts, persona instructions, or chain-of-thought priming were applied
- Temperature: not explicitly set in any request; provider API default applies per model. Known defaults: Anthropic models = 1.0; OpenAI models = 1.0; NVIDIA NIM-hosted models (Gemma 4 31B, Qwen3 480B) = 0.7; Ollama (Gemma4 e4b) = 0.8. o3 does not expose a temperature parameter.
- Maximum output tokens: 3,000 (NVIDIA/OpenAI requests via benchmark script); 4,096 (Anthropic)
- Responses were captured to disk and evaluated asynchronously to avoid recency bias
- Scoring was conducted against the rubric independently before comparing models

### 3.3 Timing Methodology

Response time was measured as wall-clock elapsed time from HTTP request initiation to full response completion, using Python `time.time()` (avoiding known zsh `$((END-START))` arithmetic failures with API response bodies containing non-integer characters). Initial timings for Claude Sonnet 4.5 and Claude Opus 4.6 were affected by a known zsh arithmetic failure. Sonnet 4.5 was subsequently confirmed via warm-probe rerun at 33,843ms. Opus 4.6 is estimated at ~35s from response length and provider throughput benchmarks. **This is an estimate, not a confirmed measured value** — unlike Sonnet 4.5 (33,843ms, warm-probe confirmed) and GPT-4.1 (23,208ms, warm-probe confirmed). The Opus timing should be treated as an approximation within the same order of magnitude, not a precise figure.

A secondary latency probe (100-token single-sentence response) was run for NVIDIA-hosted models to isolate cold-start and queue effects from generation time.

### 3.4 Scoring Rubric

Each response was scored 1–10 on six dimensions. The final score is the unweighted mean of all six dimensions.

**On the unweighted mean:** The report's own findings identify Redis implementation as the highest-signal dimension — the one most predictive of production failure. A Redis-weighted rubric (e.g., 2x weight on Redis) would change the ranking between Gemma 4 31B and GPT-4.1 (Gemma scored 9 on Redis vs GPT-4.1's 8, partially offset by Gemma's higher Strategy and Drop-in). The choice of unweighted mean is a deliberate methodological decision to avoid post-hoc weighting that could be tuned to favor any outcome. All dimension scores are published; readers can apply alternative weightings using the raw data in [MANIFEST.md](https://github.com/shaileshjgd/FrontierModelEvals/blob/main/evals/2026-04-02-sliding-window-rate-limiter/MANIFEST.md).

| Dimension | Descriptor | Key Discriminators |
|-----------|------------|-------------------|
| **Strategy & Architecture** | Clarity of layered design, explicit algorithm naming, architectural diagram or structured rationale | Presence of storage/algorithm/middleware separation; algorithm choice justified |
| **Code Correctness** | Sliding window semantics correct, no logic bugs, proper TypeScript types | `allowed = count < limit` vs `<=`; timestamp prune-before-count order; no scope errors |
| **Redis Implementation** | Atomicity level and correctness of distributed adapter | Lua (atomic) > ZSET pipeline (race-tolerant) > GET-SET JSON blob (race-prone) > not implemented |
| **Test Quality** | Tests that actually verify sliding window behavior, not just happy-path stubs | `jest.useFakeTimers()` for time simulation; header assertions; supertest integration |
| **Production Readiness** | Fail-open error handling, memory leak prevention, lifecycle hooks, header compliance | `.unref()` on sweep timers; `shutdown()`; structured catch; RFC header values |
| **Drop-in Readiness** | Completeness — can an engineer use the output with minimal editing? | No TODOs in critical paths; usage example present; Redis adapter runnable |

---

## 4. Results

**Score interpretation note:** Point estimates should be read as tier indicators rather than precise rankings. N-run averages (N=2–3 per model) are the primary result; run1 scores are shown for reference. Differences above 1.5 points reflect structural capability gaps (e.g., Lua atomicity vs. no Redis implementation) and are reliable. Differences below 1.0 point may reflect run-to-run variance and should be treated as approximately equivalent at this sample size.

| Tier | Score range | Models |
|------|-------------|--------|
| Top | 9.0–10.0 | Claude Opus 4.6, Gemma 4 31B |
| Strong | 8.0–8.9 | GPT-4.1 |
| Acceptable | 6.5–7.9 | Claude Sonnet 4.5 |
| Weak | < 6.5 | Gemma4 e4b, Qwen3 Coder 480B, GPT-4o |
| Fail | — | o3 |

### 4.1 Aggregate Scores

| Model | Strategy | Correctness | Redis | Tests | Production | Drop-in | **Run1** | **N-run avg** | Speed | Cost |
|-------|----------|-------------|-------|-------|------------|---------|----------|--------------|-------|------|
| **Claude Opus 4.6** | 10 | 10 | 10 | 9 | 10 | 9 | **9.7** | **9.6** (N=2) | ~35s | $$$$ |
| **Gemma 4 31B** | 10 | 10 | 9 | 9 | 8 | 10 | **9.3** | **7.1** (N=3) | 255s† | Free |
| **GPT-4.1** | 8 | 9 | 8 | 9 | 8 | 9 | **8.5** | **8.3** (N=2) | 23.2s ✓ | $$$ |
| **Claude Sonnet 4.5** | 8 | 8 | 5 | 7 | 8 | 8 | **7.3** | **7.4** (N=2) | 33.8s ✓ | $$ |
| **Gemma4 e4b (local)** | 8 | 8 | 2 | 6 | 8 | 7 | **6.5** | **6.2** (N=2) | ~75s | Free |
| **Qwen3 Coder 480B** | 6 | 6 | 4 | 5 | 5 | 5 | **5.6** | **5.6** (N=3) | 13.8s ✓† | Free |
| **GPT-4o** | 6 | 6 | 2 | 7 | 5 | 5 | **5.2** | **5.0** (N=3) | 16.3s ✓ | $$ |
| **o3** | — | — | — | — | — | — | **FAIL** | **FAIL** | 1,056ms (API error) | $$$$ |

✓ = warm-probe confirmed timing. †NVIDIA free tier — latency includes queue and throughput overhead, not comparable to paid API latency.

### 4.2 Dimension-Level Analysis

#### 4.2.1 Strategy and Architecture

Gemma 4 31B and Claude Opus 4.6 were the only models to present an explicit complexity analysis alongside their architectural rationale. Gemma 4 articulated O(N) memory-store vs O(log N) Redis complexity unprompted. Opus included an ASCII architecture diagram and documented its algorithm selection rationale (sliding window log vs. approximation counter), citing the accuracy tradeoff explicitly.

GPT-4.1 produced clean three-layer separation but without analytical depth. Claude Sonnet 4.5 matched GPT-4.1 in structure. Qwen3 Coder and GPT-4o produced functional outlines without architectural reasoning.

#### 4.2.2 Redis Implementation — The Critical Differentiator

This dimension produced the widest score variance and is the most operationally significant.

**Lua scripting (Opus only, score: 10):** Claude Opus 4.6 was the sole model to implement Redis atomicity via Lua scripts, executing ZRANGEBYSCORE + ZREMRANGEBYSCORE + ZADD as a single atomic transaction. This eliminates race conditions entirely, even under extreme concurrency, matching production-grade rate limiter libraries such as `rate-limiter-flexible`.

**ZSET pipeline (Gemma 4 31B, GPT-4.1, score: 8–9):** Both models used Redis sorted sets with pipelined commands (ZREMRANGEBYSCORE → ZADD → ZCARD → PEXPIRE). Pipelines batch network round-trips but are not atomic — a theoretical race window exists between ZCARD and the decision to allow/deny. At typical API gateway throughput (< 10,000 RPS per key), this is acceptable. At very high concurrency, a Lua upgrade is warranted.

**SETEX with JSON blob (Claude Sonnet 4.5, score: 5):** Sonnet stored the entire timestamp array serialized as JSON, using SETEX for TTL management. This approach is a GET → deserialize → modify → SET sequence — a classic read-modify-write race condition. Two concurrent requests can read the same count, both decide "allowed," and both write back, causing the rate limit to be exceeded. This is a production defect under concurrent load, not a theoretical concern.

**Not implemented (GPT-4o, score: 2):** GPT-4o described Redis integration as a design pattern but provided no code. For any distributed deployment, this output requires a complete Redis adapter before production use.

**Missing prune call (Qwen3 Coder 480B, score: 4):** Qwen3's Redis implementation used `ZRANGEBYSCORE` to count entries within the window but included no `ZREMRANGEBYSCORE` call to remove expired entries. The ZSET grows without bound under sustained traffic. Per-window counts remain correct (the range query filters properly), but unbounded memory growth makes this unsuitable for production at scale.

#### 4.2.3 Test Quality

GPT-4.1 produced the strongest test suite: integration tests using `supertest` with real header assertions (`x-ratelimit-limit`, `x-ratelimit-remaining`, `retry-after`), custom `keyGenerator` injection, and both passing and blocking scenarios. Gemma 4 31B was the only free model with `jest.useFakeTimers()` usage, correctly testing the sliding window expiry property. Claude Opus 4.6's test scaffolding was comprehensive in structure, though the response was truncated before full test output.

#### 4.2.4 Production Readiness

Three behaviors distinguished the top tier from the rest:

1. **`sweepInterval.unref()`** — Prevents the periodic cleanup timer from holding Node.js open after all other work completes. Only Claude Opus 4.6 and Claude Sonnet 4.5 included this. It is a correctness issue in long-running process management, not merely a style choice.
2. **Fail-open error handling** — All top-3 models wrapped storage calls in try-catch and called `next()` on failure, ensuring availability in the event of Redis downtime. Qwen3 and GPT-4o did not.
3. **Composite key design** — Top models used `{identifier}:{route}` composite keys, enabling per-user per-route limiting without namespace collision.

### 4.3 Speed Analysis

| Model | Latency (full response) | Notes |
|-------|------------------------|-------|
| GPT-4o | 16.3s ✓ | Warm-probe confirmed |
| GPT-4.1 | 23.2s ✓ | Warm-probe confirmed |
| Claude Sonnet 4.5 | 33.8s ✓ | Warm-probe confirmed |
| Claude Opus 4.6 | ~35s (est.) | Large dense model |
| Gemma4 e4b (local) | ~75s (est.) | Constrained by M4 16GB RAM |
| Qwen3 Coder 480B | 13.8s ✓ | NVIDIA free tier — MoE (35B active params) |
| Gemma 4 31B | 255s ✓ | NVIDIA free tier — throughput ceiling, not model speed |

**NVIDIA latency is queue-driven, not architecture-driven.** Three independent timing exercises were conducted for Gemma 4 31B:

| Probe | Elapsed | Condition |
|-------|---------|-----------|
| Initial benchmark (full task) | ~60–120s (est.) | Cold start, long output |
| Short-prompt probe 1 | 54,984ms | Cold start / heavy queue |
| Short-prompt probe 2 | 2,661ms | Warm model |
| Short-prompt probe 3 (consecutive) | 1,541ms | Warm |
| Short-prompt probe 4 (consecutive) | 962ms | Warm, low queue |
| Short-prompt probe 5 (consecutive) | 10,810ms | Queue spike |

**Conclusion:** Gemma 4 31B's intrinsic speed on NVIDIA infrastructure is 1–3 seconds for short prompts when warm. The 55-second outlier was a cold-start artifact. Free-tier latency is primarily a function of queue depth and model warm state — highly variable by time of day, not a fixed architectural property. For workloads requiring consistent sub-5s latency, dedicated GPU allocation is recommended. For asynchronous or batch use, the free tier is reliable at zero cost.

---

## 5. Discussion

### 5.1 The Free Tier Parity and Consistency Findings

Two findings from this evaluation bear on engineering team tooling strategy:

**Finding 1 — Top-tier performance:** Gemma 4 31B, released on the same day as this evaluation (April 2, 2026), scored 9.3/10 on a single run — placing it in the Top tier alongside Claude Opus 4.6 (9.7/10). The 0.4-point difference is within the range where small scoring variations could close or widen the gap; both models are structurally in the same tier. The free tier can reach the quality ceiling of the most expensive paid model on production engineering tasks of this type.

**Finding 2 — Consistency gap:** Across three independent runs, Gemma 4 31B averaged 7.1 (range: 5.7–9.3). Opus averaged 9.6 across two runs (range: 9.5–9.7). Top-tier performance on a single run does not imply reliability across runs. The specific driver of Gemma's variance was one implementation detail in the Redis adapter — cleanup of blocked-request entries — that appeared in run1 and not runs 2 or 3.

For workflows where AI output is reviewed before deployment, free-tier models can deliver exceptional results and single-run variance is manageable. For automated pipelines or lower-review workflows, Opus's consistency is the differentiator, not its ceiling.

### 5.2 GPT-4.1 — The Underreported Finding

The structural narrative of this evaluation centers on the Gemma 4 / Opus parity story, which means GPT-4.1's result receives less emphasis than its score justifies. GPT-4.1 produced the strongest test suite of any model evaluated — supertest integration tests with actual header assertions (`x-ratelimit-limit`, `x-ratelimit-remaining`, `retry-after`), injected `keyGenerator` for test isolation, and both passing and blocking scenarios end-to-end. This is production-grade test engineering. Its Redis implementation (ZSET pipeline via node-redis `multi()`) is correct at typical throughput levels. At $$$, it offers materially better value than Opus at $$$$ with only a marginal quality gap (8.3 vs 9.6 N-run average). For teams prioritizing testability and CI/CD integration, GPT-4.1 is the strongest recommendation in the paid tier.

### 5.3 N=1 Limitation and Low-Scoring Models

The N=1 limitation is most consequential at the bottom of the ranking. GPT-4o's run1 produced no Redis implementation — a specific generation choice that may not represent the model's typical output for this prompt. The multi-run data (N=3, avg 5.0) includes a run that implemented a fixed-window counter rather than a sliding window, confirming that GPT-4o struggles with this task class consistently. However, teams considering GPT-4o for adjacent tasks should not extrapolate from this single-task finding.

### 5.4 Model-Task Alignment

A secondary finding is that model capability is strongly task-dependent in ways that aggregate leaderboard scores do not capture. Qwen3 Coder 480B — which achieves top-5 scores on coding benchmarks including LiveCodeBench and Codeforces — scored 5.6/10 on this task. The benchmark task requires not just code generation but distributed systems reasoning (Redis atomicity), production operations thinking (fail-open, timer lifecycle), and architectural synthesis. Models optimized for competitive programming patterns may underperform on the systems design and operational dimensions of real engineering work.

### 5.5 The Redis Atomicity Gap

The Redis dimension revealed a clear stratification that has direct production risk implications:

```
Lua scripts         → no race condition at any concurrency level
ZSET pipeline       → race window exists; acceptable at < ~10K RPS per key
GET-SET JSON blob   → race condition at any meaningful concurrency; do not use in production
Not implemented     → blocks distributed deployment entirely
```

Of the eight models evaluated, only one (Claude Opus 4.6) implemented the fully correct solution. Two implemented the production-acceptable solution. Two implemented a pattern with known race conditions. One did not implement Redis at all. For any engineering team using AI-generated code in distributed rate limiting without human review of the Redis implementation, this gap represents a real reliability risk.

### 5.6 Limitations

1. **Single task evaluation** — Results are specific to this task domain (distributed systems / middleware). Performance on other task categories (data pipelines, frontend, ML workflows) may differ significantly.
2. **NVIDIA free tier latency** — The latency measurements reflect free-tier queue dynamics, which vary by time of day and model demand. Dedicated allocation would reduce Gemma 4 31B latency substantially.
3. **Single scorer (author)** — All six dimensions were scored by the author. To check rubric clarity and approximate score stability, two AI models were independently prompted to apply the same rubric post-hoc, without access to the original scores: S2 (same model family as the highest-scoring model — a potential conflict of interest, disclosed) and S3 (Nemotron Ultra 253B, different family — run specifically to check whether S2 showed same-family bias). These are rubric consistency checks, not inter-rater reliability in the psychometric sense. Independent human expert scoring remains the primary methodological gap. What the consistency checks do provide: rank-order agreement data showing the structural ordering is stable across three independent rubric applications (S1 vs S2 ρ=0.929; S1 vs S3 ρ=0.786; S2 vs S3 ρ=0.750 — all ρ ≥ 0.75). The second-pass review identified two confirmed scoring corrections, each verified by direct file inspection: Gemma 4 31B Production 10→8 (no sweep timer or `unref()` in the output file); Gemma4 e4b Redis 5→2 (adapter explicitly labeled a stub in the output). Both corrections went against the evaluator's disclosed interest in free-tier performance. The cross-family check (S3) found no evidence of pro-Anthropic bias in S2 — S2 was harder on Anthropic models relative to S3 (average S3−S2 delta: Anthropic +0.95 vs. non-Anthropic +1.90). Full score tables and bias analysis: [EVIDENCE.md](https://github.com/shaileshjgd/FrontierModelEvals/blob/main/evals/2026-04-02-sliding-window-rate-limiter/EVIDENCE.md#rubric-consistency-check-april-3-2026).
4. **N=2–3 quality-scoring runs per model** — Two to three independent quality-scoring runs were completed for seven of eight models (N=3 for Gemma 4 31B, Qwen3 Coder 480B, and GPT-4o; N=2 for Opus 4.6, GPT-4.1, Sonnet 4.5, and Gemma4 e4b). o3 produced no evaluable output. The N-run averages reported throughout this document reflect all scored runs; all raw outputs are published for independent re-scoring. The primary remaining limitation at the N=2–3 level is that N=2 provides directional signal, not tight confidence intervals — for models where only two runs were collected, a third run that diverges significantly would shift the average materially. Score differences above 1.5 points across the full table are structurally reliable (they reflect categorical differences in Redis implementation or algorithm choice). Differences below 1.0 point should be treated as approximately equivalent at this sample size.
5. **Temperature and sampling** — Temperature was not explicitly set; provider defaults apply (Anthropic 1.0, OpenAI 1.0, NVIDIA NIM 0.7, Ollama 0.8). Replication attempts should match these defaults explicitly.
6. **Reference implementation published** — A canonical TypeScript implementation is available in the `reference/` directory of the repo. It implements all rubric discriminators: Lua scripting for atomic Redis operations, binary search pruning, `sweepInterval.unref()`, fail-open error handling, and a Jest test suite with `jest.useFakeTimers()`. Reviewers can use it to verify scored defects against a known-correct baseline.
7. **o3 exclusion** — OpenAI's parameter migration (`max_tokens` → `max_completion_tokens`) prevented o3 evaluation. This is a documented API change, not an instability finding. The evaluation script will be updated to support o3 in future runs.

---

## 6. Conclusions

1. **Google Gemma 4 31B is a serious production engineering model.** On a single run it scored 9.3/10 — same tier as Claude Opus 4.6 (9.7) — and surpassed GPT-4.1, GPT-4o, and Claude Sonnet 4.5. Its primary limitation is response latency on the NVIDIA free tier, not capability.

2. **Claude Opus 4.6 remains the technically deepest model.** Its unique use of Lua scripting for Redis atomicity and binary search timestamp pruning represent implementation details that materially improve correctness at scale. For the most critical or complex engineering tasks, the quality ceiling is marginally higher.

3. **GPT-4.1 delivers the best paid-model value.** Strongest test suite, confirmed fast latency, complete Redis ZSET implementation, competitive score at a lower price point than Opus.

4. **In this benchmark, Redis implementation quality was the highest-signal discriminator of distributed-systems reasoning depth.** It requires understanding of concurrency, atomicity, and operational constraints simultaneously — dimensions that current coding benchmarks do not adequately measure.

5. **API parameter changes require active monitoring.** o3's `max_tokens` → `max_completion_tokens` migration broke evaluation before any output was produced. This was a documented change, not instability — but it illustrates that teams using o3 or any model API as a production dependency should include API changelog monitoring in their dependency management process.

6. **The free tier is now a viable professional engineering tool** for the majority of tasks, with latency as the primary tradeoff.

---

## 7. Recommended Routing Strategy

Based on these findings, the following routing framework is proposed for teams balancing quality, cost, latency, and data governance:

| Task Type | Recommended Model | Rationale |
|-----------|-------------------|-----------|
| Architecture design, complex systems | Gemma 4 31B (NVIDIA) | Top-tier single-run quality, free; verify output before shipping |
| Interactive build/debug loops | Qwen3 Coder 480B (NVIDIA) | Fast MoE, free |
| Confidential / sensitive code | Claude Sonnet 4.5 (Anthropic) | Standard API data controls; verify retention terms for your arrangement |
| Highest-stakes critical path | Claude Opus 4.6 (Anthropic) | Lua atomicity, deepest architecture |
| Fully air-gapped / offline | Gemma4 e4b (Ollama) | On-device, no data egress |

---

## Appendix A — Raw Output Inventory

All raw outputs are published at [github.com/shaileshjgd/FrontierModelEvals](https://github.com/shaileshjgd/FrontierModelEvals) under `evals/2026-04-02-sliding-window-rate-limiter/raw-outputs/`.

| File | Model | Notes |
|------|-------|-------|
| `gemma4-31b-run1.txt` | Gemma 4 31B | Scored — run1 |
| `claude-opus-4-6.txt` | Claude Opus 4.6 | Scored — run1 |
| `claude-sonnet-4-5.txt` | Claude Sonnet 4.5 | Scored — run1 |
| `gpt-4-1.txt` | GPT-4.1 | Scored — run1 |
| `gpt-4o.txt` | GPT-4o | Scored — run1 |
| `gemma4-e4b-local.txt` | Gemma4 e4b (Ollama) | Scored — run1 |
| `qwen3-coder-480b-run1.txt` | Qwen3 Coder 480B | Scored — run1 |
| `o3-api-error.txt` | o3 | API error — no evaluable output |
| `claude-opus-4-6-run2.txt` | Claude Opus 4.6 | Scored — run2 (9.5) |
| `gpt-4-1-run2.txt` | GPT-4.1 | Scored — run2 (8.0) |
| `gemma4-e4b-local-run2.txt` | Gemma4 e4b (Ollama) | Scored — run2 (5.8) |
| `gemma4-31b-run2.txt` | Gemma 4 31B | Scored — run2 (6.3) |
| `qwen3-coder-480b-run2.txt` | Qwen3 Coder 480B | Scored — run2 (3.5) |
| `gpt-4o-run3.txt` | GPT-4o | Scored — run3 (4.0) |
| `claude-sonnet-4-5-run2-warm.txt` | Claude Sonnet 4.5 | Scored — run2 (7.5); "warm" = timing collection method |
| `claude-sonnet-4-5-run3.txt` | Claude Sonnet 4.5 | Scored partial — truncated at max_tokens limit before tests section; Tests dimension unscored; excluded from N-run average |
| `gemma4-31b-run3-warm.txt` | Gemma 4 31B | Scored — run3 (5.7); "warm" = timing collection method |
| `qwen3-coder-480b-run3-warm.txt` | Qwen3 Coder 480B | Scored — run3 (7.8); "warm" = timing collection method |
| `gpt-4o-run2-warm.txt` | GPT-4o | Scored — run2 (5.7); "warm" = timing collection method |

## Appendix B — Scoring Notes

Dimension-level justifications for all Redis scores are in Section 4.2.2 of this report and in [`EVIDENCE.md`](https://github.com/shaileshjgd/FrontierModelEvals/blob/main/evals/2026-04-02-sliding-window-rate-limiter/EVIDENCE.md), which links each score to the specific code excerpt from the scored run. Evaluator conflict of interest: the author uses several of the evaluated models in their own tooling (NVIDIA free tier) and has an interest in the free-tier models performing well. Scores were assigned before models were compared against each other.

---

*This report may be reproduced with attribution. Raw outputs are publicly available at [github.com/shaileshjgd/FrontierModelEvals](https://github.com/shaileshjgd/FrontierModelEvals).*
