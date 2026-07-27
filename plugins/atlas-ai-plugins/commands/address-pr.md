---
description: Work through the review comments on the current branch's open PR, through the orchestrator
argument-hint: [thread ids or files to prioritize, optional]
---

Work through the review comments on the open pull request for the current branch: $ARGUMENTS

You are the **gatekeeper**, not the pipeline. The **atlas-ai-plugins:orchestrator** subagent triages the comments, delegates the fixes, and retries what fails. Your job is the one thing it cannot do: talk to me. A subagent has no `AskUserQuestion` tool, so every decision that needs a human comes back to you as a gate.

Pass anything I named in `$ARGUMENTS` as a priority hint, not as a filter — a thread I didn't mention is still a thread that needs answering.

## The pipeline

Hand the orchestrator this pipeline verbatim. It is the engine; the flow is yours.

```json
[
  { "stage": "pr-feedback", "agent": "atlas-ai-plugins:pr-feedback", "handoff": ".ship/pr-feedback.md",
    "gateAfter": "feedback" },
  { "stage": "coder",       "agent": "atlas-ai-plugins:coder",       "handoff": ".ship/changes.md" },
  { "stage": "tester",      "agent": "atlas-ai-plugins:tester",      "handoff": ".ship/test-results.md",
    "onFailure": "coder" },
  { "stage": "reviewer",    "agent": "atlas-ai-plugins:reviewer",    "handoff": ".ship/review.md",
    "onFailure": "coder", "fanOut": ["correctness", "security", "performance"],
    "gateAfter": "verdict" },
  { "stage": "pr-reply",    "agent": "atlas-ai-plugins:pr-feedback", "handoff": ".ship/pr-replies.md",
    "gateBefore": "reply" }
]
```

Pass `pipeline: "pr-feedback"` as the label.

Two entries deserve a note:

- `pr-feedback` has no `onFailure`. If the triage comes back empty or confused, that is mine to look at, not something to retry — its `feedback` gate is where I see it.
- `pr-reply` gates **before** it runs, not after. Everything else in this pipeline is reversible local work; this one posts to the hosting platform. Nothing goes out until I have approved the exact text and it is recorded in `state.approvals`.

`pr-reply` reuses the `pr-feedback` agent: the same specialist that read the threads writes the replies, because it already holds what was said and what we changed.

If `.ship/state.json` exists with a `stage` that is not `done`, **stop and ask me** whether to continue that unfinished run or discard it and start over. Never overwrite the state file silently: it is the only resume point.

- I say **continue** → delegate with no pipeline; the orchestrator resumes from the state file.
- I say **discard** → delegate with the pipeline *and* an explicit instruction to discard the existing run and start over. Without that instruction the orchestrator resumes the old run instead, and this command's work never starts.

(An interrupted run of *this* command can also be continued with a bare `/ship` — the flow lives in `stages`, so resuming needs no knowledge of it.)

## The gate loop

1. **Delegate to atlas-ai-plugins:orchestrator** with the pipeline above.
2. **When it returns, read `.ship/state.json`** rather than trusting the summary alone.
   - `gate` is set → step 3.
   - `gate` is `null` and `stage` is `done` → step 4.
   - Neither → something went wrong. Show me the orchestrator's report and stop. Do not re-delegate blindly.
3. **Handle the gate.** Show me the orchestrator's summary, then ask me with `AskUserQuestion`. Then re-delegate with my answer, telling it to record the answer in `history` — and in `state.approvals` if the gate was authorizing a stage's action, which the `reply` gate is — then clear `gate` and continue. **Repeat from step 2** — a review is a conversation, and so is this loop.
4. **Report the outcome:** the PR reference, which threads were addressed, which are still open, how many were reopened and at which round, and the `.ship/` files worth reading.

The gates this pipeline declares, and what I need to see at each:

- **`feedback`** — the triage is done, nothing has been changed yet. Reopened threads first, with their round number: a comment already rejected once needs my eyes before another fix goes out.
- **`verdict`** — the fixes are written, tested and reviewed. The verdict plus every finding.
- **`reply`** — **the stage has not run.** Show me the exact text per thread, as it would be posted. A reply and a thread resolution are visible to the whole team and cannot be quietly undone. My answer must land in `state.approvals` naming this action before anything goes out. And since this command never pushes, tell me whether the fixes are actually on the remote yet: if they aren't, the replies are held rather than sent, because a reply pointing at a change the reviewer can't see is worse than no reply.

  To unblock that, tell me to **commit and push by hand** — `git commit` and `git push`, nothing more — and then approve. **Do not send me to `/raise-pr` here.** Its first step is an unconditional `rm -rf .ship`, which would delete the state file this very gate is paused on: the run would be destroyed before it could be approved, and a fresh `/address-pr` would re-triage from nothing. `/raise-pr` belongs *after* the run reaches `done`.

The orchestrator may also raise `stuck` or `blocked` on its own. Those are its detections, not this pipeline's steps — show me what it reports and ask how to proceed.

## Hard rules

- **Never commit, stage, push, or merge anything.** The fixes are left on the branch for me. Pushing them and updating the PR is `/raise-pr`, and I run that myself.
- **Never post to the hosting platform without my approval of the exact text** — no replies, no thread resolutions, not even marking a thread fixed. Read-only triage is the default.
- **Never answer a gate on my behalf.** Approving one reply is not approving the next.
- **A thread on round 3 or higher is mine to decide, not something to guess at again.** Two fixes have already missed the point; show me the history and stop.
- **Leave `.ship/` in place.** It is the resume point, and `/raise-pr` deletes it as its first step.
