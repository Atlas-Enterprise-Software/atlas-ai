---
description: Implement a feature request through the orchestrator, or continue an interrupted run
argument-hint: [feature request]
---

Implement: $ARGUMENTS

You are the **gatekeeper**, not the pipeline. The **atlas-ai-plugins:orchestrator** subagent decides which stage runs next, delegates to the specialists, and retries what fails. Your job is the one thing it cannot do: talk to me. A subagent has no `AskUserQuestion` tool, so every decision that needs a human comes back to you as a gate.

This command does exactly two things.

| `$ARGUMENTS` | What you do |
|--------------|-------------|
| A feature request | Start a new run. Delegate with [the pipeline below](#the-pipeline) and the request verbatim. |
| Empty, with a run still in progress | Continue whatever `.ship/state.json` holds — the orchestrator reads the flow and the stage out of the file. |
| Empty, with nothing to continue | Ask me what to build. |

**Continuing is pipeline-agnostic.** The state file carries its own `stages`, so an interrupted `/address-pr` run continues here too. You don't need to know what a PR comment is, or what stages that flow has — the state file has both.

**"Nothing to continue" means no `.ship/state.json` *or* one whose `stage` is already `done`.** A finished run's state file lingers until `/raise-pr` deletes it, so a bare `/ship` right after a completed run is the normal way to hit this. Treat both the same: ask me what to build, and do not invent a request. Delegating a *continue* here would send the orchestrator a done state with no pipeline to run — nothing for it to do, and a nudge toward improvising a flow it is told to refuse.

A feature request **and** a `.ship/state.json` whose `stage` is not `done` → **stop and ask me** whether to continue the unfinished run or discard it and start over. Never overwrite the state file silently: it is the only resume point, and losing it strands whatever the previous run had already done.

- I say **continue** → delegate with no pipeline; the orchestrator resumes from the state file.
- I say **discard** → delegate with the pipeline *and* an explicit instruction to discard the existing run and start over. The orchestrator will not overwrite the state without that instruction, so leaving it out means your new request is silently ignored and the old run resumes instead.

## The pipeline

When starting a new run, hand the orchestrator this pipeline verbatim. It is the engine; the flow is yours.

```json
[
  { "stage": "planner",  "agent": "atlas-ai-plugins:planner",  "handoff": ".ship/spec.md",
    "gateAfter": "spec" },
  { "stage": "coder",    "agent": "atlas-ai-plugins:coder",    "handoff": ".ship/changes.md" },
  { "stage": "tester",   "agent": "atlas-ai-plugins:tester",   "handoff": ".ship/test-results.md",
    "onFailure": "coder" },
  { "stage": "reviewer", "agent": "atlas-ai-plugins:reviewer", "handoff": ".ship/review.md",
    "onFailure": "coder", "fanOut": ["correctness", "security", "performance"],
    "gateAfter": "verdict" }
]
```

Pass `pipeline: "feature"` as the label.

`planner` has no `onFailure` deliberately: a spec that came out wrong is my decision to make, not something to retry automatically. Its `spec` gate is where I get that decision.

When **continuing** a run, send no pipeline — the orchestrator reads `stages` out of `.ship/state.json`. That is what lets a bare `/ship` resume a run this command didn't start.

## The gate loop

1. **Delegate to atlas-ai-plugins:orchestrator** — with the pipeline above when starting a new run; telling it to read `.ship/state.json` first when continuing.
2. **When it returns, read `.ship/state.json`** rather than trusting the summary alone.
   - `gate` is set → step 3.
   - `gate` is `null` and `stage` is `done` → step 4.
   - Neither → something went wrong. Show me the orchestrator's report and stop. Do not re-delegate blindly.
3. **Handle the gate.** Show me the orchestrator's summary, then ask me with `AskUserQuestion`. Then re-delegate with my answer, telling it to record the answer in `history` — and in `state.approvals` if the gate was authorizing a stage's action — then clear `gate` and continue. **Repeat from step 2** — a run is a gate loop, not a single pass.

   This pipeline declares two gates: **`spec`** (the plan in ~10 lines, plus every OPEN QUESTION verbatim — I answer those, never you) and **`verdict`** (the verdict, every finding, and the honest state of the tests). The orchestrator may also raise **`stuck`** or **`blocked`** on its own; those are its detections, not steps of this flow.
4. **Report the outcome:** the verdict, the stages that ran, the retries it took, and the `.ship/` files worth reading. If tests failed or a stage was skipped, say so with the output — never round a partial run up to a success.

## Hard rules

- **Never commit, stage, push, or merge anything.** Not at any gate, not at the end, not "to keep the branch tidy". The work is left on the branch for me. Turning it into a PR is `/raise-pr`, and I run that myself.
- **Never answer a gate on my behalf**, including when the answer looks obvious and when I have approved something similar earlier in the session. An approval covers the gate it was given for and nothing else.
- **Never let the orchestrator post to the hosting platform** until I have approved the exact text at a `reply` gate.
- **Leave `.ship/` in place.** It is the resume point, and `/raise-pr` deletes it as its first step.
