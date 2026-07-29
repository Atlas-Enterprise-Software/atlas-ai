---
description: Run the full feature pipeline (planner → coder → tester → reviewer)
argument-hint: <feature request>
---

Run the full feature pipeline for: $ARGUMENTS

Execute these stages in order. Do not skip ahead. After each stage, confirm the handoff file exists before starting the next.

1. Delegate to the **atlas-ai-plugins:planner** subagent with the feature request above. Wait for `.ship/spec.md`.
2. If the spec has OPEN QUESTIONS, stop and show them to me. Otherwise delegate to the **atlas-ai-plugins:coder** subagent. Wait for `.ship/changes.md`.
3. Delegate to the **atlas-ai-plugins:tester** subagent. Wait for `.ship/test-results.md`. If tests failed, stop and show me the failures.
4. Delegate to the **atlas-ai-plugins:reviewer** subagent. Show me `.ship/review.md`.
5. Report the final verdict. Leave the branch for my morning review.

**Never commit, stage, push, or merge anything** — not at the end, not "to keep the branch tidy". The work is left on the branch for me. Turning it into a PR is `/raise-pr`, and I run that myself.
