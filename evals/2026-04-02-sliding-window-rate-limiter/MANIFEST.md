# Run Manifest

Maps each model to all scored runs. All runs listed in the "Additional scored runs" column were quality-scored. Files with "warm" in the name were collected using the warm-probe timing methodology (a short warm-up probe fired first, then the full task immediately) — "warm" is a naming convention for the collection method, not an indicator that a run is timing-only or unscored.

Quality scoring date: April 2, 2026 (run1) and April 3, 2026 (additional runs)  
Latency measurement date: April 3, 2026 (warm-probe methodology)  
Prompt: identical across all models and runs, no system instructions, default temperature, max_tokens 3000–4096

---

| Model | Model ID | Access | Scored run | Additional scored runs | Run1 score | N-run avg |
|-------|----------|--------|------------|----------------------|------------|-----------|
| Claude Opus 4.6 | `claude-opus-4-6` | Anthropic paid | `claude-opus-4-6.txt` | `claude-opus-4-6-run2.txt` (9.5) | 9.7 | **9.6** (N=2) |
| Gemma 4 31B | `google/gemma-4-31b-it` | NVIDIA free | `gemma4-31b-run1.txt` | `gemma4-31b-run2.txt` (6.3), `gemma4-31b-run3-warm.txt` (5.7) | 9.3† | **7.1** (N=3) |
| GPT-4.1 | `gpt-4.1` | OpenAI paid | `gpt-4-1.txt` | `gpt-4-1-run2.txt` (8.0) | 8.5 | **8.3** (N=2) |
| Claude Sonnet 4.5 | `claude-sonnet-4-5` | Anthropic paid | `claude-sonnet-4-5.txt` | `claude-sonnet-4-5-run2-warm.txt` (7.5), `claude-sonnet-4-5-run3.txt` (**partial** — truncated at max_tokens before tests; Tests dim unscored; excluded from avg) | 7.3 | **7.4** (N=2) |
| Gemma4 e4b | `gemma4:e4b` (Ollama) | Local / M4 Mac | `gemma4-e4b-local.txt` | `gemma4-e4b-local-run2.txt` (5.8) | 6.5† | **6.2** (N=2) |
| Qwen3 Coder 480B | `qwen/qwen3-coder-480b-a35b-instruct` | NVIDIA free | `qwen3-coder-480b-run1.txt` | `qwen3-coder-480b-run2.txt` (3.5), `qwen3-coder-480b-run3-warm.txt` (7.8) | 5.6 | **5.6** (N=3) |
| GPT-4o | `gpt-4o` | OpenAI paid | `gpt-4o.txt` | `gpt-4o-run2-warm.txt` (5.7), `gpt-4o-run3.txt` (4.0) | 5.2 | **5.0** (N=3) |
| o3 | `o3` | OpenAI paid | `o3-api-error.txt` | — | fail | fail |

† Score revised post-publication following inter-rater review (April 3, 2026). Gemma 4 31B run1: Production dimension corrected 10→8 (no in-memory sweep timer or `unref()` — confirmed by file inspection and internally inconsistent with REPORT.md Section 4.2.4). Gemma4 e4b run1: Redis dimension corrected 5→2 (explicitly labeled stub/mock in output). Full inter-rater methodology and statistics in [EVIDENCE.md](EVIDENCE.md#inter-rater-reliability-april-3-2026).

---

## Confirmed latencies (warm-probe runs)

Short probe ("Reply with one word: ready") fired first; full task fired immediately on return. One model at a time. Python `time.time()` timing.

| Model | Warm probe | Full task | Source file |
|-------|-----------|-----------|-------------|
| Qwen3 Coder 480B | 754ms | 13,762ms | `qwen3-coder-480b-run3-warm.txt` |
| GPT-4o | 2,948ms | 16,288ms | `gpt-4o-run2-warm.txt` |
| GPT-4.1 | — | 23,208ms | `gpt-4-1.txt` (prior run) |
| Claude Sonnet 4.5 | 1,179ms | 33,843ms | `claude-sonnet-4-5-run2-warm.txt` |
| Claude Opus 4.6 | — | ~35,000ms | `claude-opus-4-6.txt` (estimated) |
| Gemma4 e4b | — | ~75,000ms | `gemma4-e4b-local.txt` (estimated) |
| Gemma 4 31B | 7,544ms | 255,590ms | `gemma4-31b-run3-warm.txt` |
| o3 | — | 1,056ms | `o3-api-error.txt` — API error, no output |

NVIDIA free tier timings (Qwen3, Gemma 4 31B) include queue and throughput overhead and are not directly comparable to paid API response times.

---

## Scoring notes

All runs in the "Additional scored runs" column were quality-scored using the same six-dimension rubric as run1. Run1 scores (April 2) and additional run scores (April 3) are the basis for all N-run averages. The scoring rationale and key code differences for each additional run are documented in the Round 2 Evidence section of [EVIDENCE.md](EVIDENCE.md).

## Round 2 run scoring notes (April 3, 2026)

**Gemma4 e4b run2 (5.8):** Redis implementation used INCR+EXPIRE — a fixed-window counter, not a sliding window log. Comments in the code acknowledge sliding window but the implementation is fixed-window. In-memory store appears to use correct timestamp tracking. No fake timers in tests. Run1's 7.0 reflected correct in-memory sliding window with ZSET Redis; run2 regressed on Redis. N-run avg 6.4 (N=2).

**Claude Opus 4.6 run2 (9.5):** Lua scripting again — prune, conditional-add, PEXPIRE all atomic. Correctly adds only if `currentCount < maxRequests`, so blocked requests never enter the ZSET. Tests present but no fake timers found. One point below run1 on test dimension.

**GPT-4.1 run2 (8.0):** ZSET pipeline (node-redis multi): zRemRangeByScore → zAdd → zCard → zRange → expire. Add-before-check with no cleanup for blocked entries — blocked requests contaminate ZSET and penalize the user's next window. Strong supertest integration tests with header assertions. One point below run1 on Redis dimension.

**Claude Sonnet 4.5 run3 (truncated):** 12,589 chars but hit the max_tokens limit before the tests section was written. Architecture and Redis scoreable; test quality dimension excluded. Not included in N-run average — would require re-run at higher token limit to score fully. N-run avg remains 7.4 (N=2 from run1 + run2-warm).

**GPT-4o run3 (4.0):** Implemented a fixed-window counter (INCR+PEXPIRE / Map with reset-on-expiry), not a sliding window log. This is a different algorithm from run1 and run2 — it does not track per-request timestamps. Run3 significantly below prior runs. N-run avg drops to 5.0 (N=3).
