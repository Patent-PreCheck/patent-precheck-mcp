---
name: patent-precheck
description: Score code for patentability with Patent PreCheck. Use when the user asks "can this be patented?", wants a patentability/novelty/§101/§102/§103 check, or wants to know if an invention or codebase is filing-ready.
---

# Patent PreCheck — AI agent usage guide

`precheck` scores source code or an invention description against the four USPTO
statutory patentability pillars and reports filing readiness. It calls the hosted
Patent PreCheck engine over HTTP — no local keys required.

## When to use

- The user asks whether code/an invention "can be patented", is "novel", "non-obvious",
  "eligible (§101)", or "ready to file (§112)".
- The user wants a quick patentability score before talking to an attorney.

## MCP tools

| Tool | Purpose |
|------|---------|
| `precheck_score` | Score `code` (or a local `path`) for patentability. Returns score, band, per-pillar scores, the limiting pillar, top opportunities, and prior-art count. |
| `precheck_pillars` | Reference: the five pillars (statutes + weights) and band rules. Use to explain a score. No network. |
| `precheck_start_review` | URL to start a paid Interactive Code Review (evidence + filing package). |

## How to call `precheck_score`

- Pass the relevant code as `code`, or a file path as `path`. Prefer the specific
  module/function the user is asking about over an entire repo — focused input scores better.
- Optional `filename` improves language/context detection.
- Default `tier` is `free`; one free score per invention. A `402`/upgrade error means
  the free analysis was used — offer `precheck_start_review`.

## Interpreting results

- `band` runs Not Ready → Building → Close to Ready → File Ready.
- Bands enforce **per-pillar floors**, not just the weighted average: a composite of 82
  with one pillar at 55 is **not** File Ready. `band_held_back_by` names the limiting pillar.
- `patentability_score` (the four pillars) is primary; `filing_readiness_score` (§112) is a
  separate documentation-quality signal.
- If `gate_passed` is false, the subject matter is not §101-eligible and no score is issued.

Always explain the limiting pillar and one or two concrete `top_opportunities`, and remind
the user this is an informational tool, not legal advice.
