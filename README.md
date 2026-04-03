# FrontierModelEvals

Benchmarks I run on frontier AI models against real engineering tasks. Not toy problems, not aggregate scores — actual production deliverables scored on dimensions that matter for shipping code.

By [Shailesh Bhujbal](https://medium.com/@shaileshjgd)

---

## Why this exists

I got tired of making model decisions based on leaderboard positions and marketing copy. MMLU scores don't tell you whether a model understands Redis atomicity. SWEBench doesn't tell you whether the generated code will race-condition under production traffic. So I started running my own evals.

One real task, identical prompt to every model, scored on a rubric that's disclosed upfront. Raw outputs are published so anyone can check my scoring.

---

## Evals

| Date | Task | Models tested | Score range |
|------|------|---------------|-------------|
| [2026-04-02](evals/2026-04-02-sliding-window-rate-limiter/) | Sliding window rate limiter (Express.js + Redis) | 8 models | run1: 5.2–9.7 / N-run avg: 5.0–9.6 (+1 fail) |

---

## How scoring works

Each task gets a rubric with 4–6 dimensions scored 1–10, averaged for a final number. The dimensions change per task but always include code correctness, production readiness, and drop-in completeness. Task-specific dimensions (e.g., Redis atomicity for distributed systems work) are defined in the eval itself.

Two to three independent runs per model (N=2–3). LLMs are non-deterministic — a second run can produce a different architecture choice or a different Redis implementation. N-run averages are the headline result; run1 scores are also published. Structural gaps above 1.5 points are reliable. Differences below 1.0 point should be treated as approximately equivalent at N=2–3.

Raw outputs are in the `raw-outputs/` folder of each eval. If you think my scoring is wrong, the evidence is there to check.

---

## Conflict of interest

I use NVIDIA's free inference gateway in my own stack. I have a stake in free-tier models performing well. Scores get assigned before I compare models against each other, but you should know this going in.
