---
description: Read the review comments on the current branch's open PR and turn them into a fix list
argument-hint: [thread ids or files to prioritize, optional]
---

Read the review comments on the open pull request for the current branch: $ARGUMENTS

Delegate to the **atlas-ai-plugins:pr-feedback** subagent. It reads the unresolved threads and writes an actionable fix list to `.ship/pr-feedback.md`. Then show me the list and **stop** — the fixes are mine to make in this conversation, not a pipeline's.

Pass anything I named in `$ARGUMENTS` as a priority hint, not as a filter — a thread I didn't mention is still a thread that needs answering.

## What to show me

Read `.ship/pr-feedback.md` rather than trusting the subagent's summary alone, then give me:

- The PR reference and how many threads are actionable.
- **Reopened threads first, with their round number.** A comment already answered once needs my eyes before another fix goes out.
- Anything the triager put under *Questions for the human* — those are mine to answer, and you never answer them for me.
- Say plainly if there was no open PR, no unresolved feedback, or no adapter for the platform. An empty result is a valid answer, not a reason to go looking elsewhere.

Then wait. I decide what gets fixed and in what order.

## Replying to the threads

Only when I ask for it, and only after I have approved the exact text.

1. Draft the replies and show them to me per thread, as they would be posted.
2. Ask me with `AskUserQuestion`. One approval covers the text I approved and nothing else.
3. Then delegate to **atlas-ai-plugins:pr-feedback** again, stating verbatim that I approved replying and quoting the approved text. It will not post on an unstated approval.

The fixes have to be on the remote before a reply describes them. This command never pushes, so if they aren't, the replies are held rather than sent — a reply pointing at a change the reviewer can't see is worse than no reply. To unblock it, commit and push by hand (`git commit`, `git push`), then approve.

## Hard rules

- **Never commit, stage, push, or merge anything.** Turning the branch into a PR is `/raise-pr`, and I run that myself.
- **Never post to the hosting platform without my approval of the exact text** — no replies, no thread resolutions, not even marking a thread fixed. Read-only triage is the default.
- **A thread on round 3 or higher is mine to decide, not something to guess at again.** Two fixes have already missed the point; show me the history and stop.
