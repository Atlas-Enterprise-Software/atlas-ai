---
description: Open/update an Azure DevOps PR via the atlas-azure-devops-pr skill — never commits
argument-hint: [target branch or work item id, optional]
---

Create or update a pull request for the current branch by running the **atlas-azure-devops-pr** skill: $ARGUMENTS

**Hard rule — never commit, stage, or push anything.** This command only turns *already-committed and pushed* work into a PR. It must never sweep leftover changes (especially uncommitted code edits) into a commit — do not `git add`, `git commit`, or `git push` these files, ever. The `.ship/` handoff files delivered by the `/ship` pipeline are always transient: Step 1 below deletes the whole `.ship/` folder before anything else, so those files never reach the `git status` precondition check. Deleting an untracked/uncommitted file is not "committing" anything and does not violate this rule. Creating a new branch and switching to it (`git switch -c` / `git checkout -b`) is likewise **not** committing, staging, or pushing — it only moves the working tree onto a new branch pointer. When the current branch is the repository's target/main branch, the command is allowed (and expected) to create the correctly-prefixed branch before stopping, so leftover work never lands on `main`.

Override the skill's default autonomous commit/push behavior (its Precondition 3 and Step 2) as follows:

1. **Always delete the `.ship/` folder first**, before doing anything else — filesystem delete only, never `git rm`/`git add`/`git commit`/`git push`. This runs unconditionally on every invocation, whatever happens afterward:
   ```bash
   rm -rf .ship
   ```
   Report in one short line whether `.ship/` was removed or was already absent.
2. Invoke the **atlas-azure-devops-pr** skill for the current branch. Let it inspect repo state and summarize the diff (its Workflow Step 1), then — per its Precondition 2 — infer the change type and, **if the current branch is the resolved target/main branch**, create the correctly-prefixed (`feature/` / `bug/` / `fix/`) branch and switch to it, carrying any uncommitted work along. No PBI numbers in the branch name.
   - **If the change-type inference is ambiguous** (including a clean tree with no diff to infer from): ask me which type — and if you can't ask me (or I don't answer), default to `feature/` — but **STILL create and switch to the branch**. Never report "nothing to PR" and skip branch creation.
3. **Now** run `git status --short`. If there are **uncommitted or unpushed changes**, STOP and show them to me. Do not `git add`, `git commit`, or `git push`. Ask me to commit and push manually (or tell you exactly what to include) before continuing. (This now runs on the newly created branch when I started on `main`.)
   - **Nothing to PR:** refresh the target ref first with a read-only `git fetch origin <target> --quiet` (the skill's Workflow Step 1 already does this; repeating it is harmless and breaks no commit/push rule) so the count is accurate. Then if the working tree is clean **and** there are **0 commits ahead** of the target branch (`git rev-list --count origin/<target>..HEAD` returns `0`), STOP and tell me there's nothing to raise a PR for. Do not proceed to build or create a PR from an empty diff. The branch created in Step 2 is left in place — no work is stranded.
4. Only once the working tree is clean and the branch is pushed, let the skill:
   - summarize the branch diff against the target branch,
   - generate the English PR title and description,
   - create or update the PR in Azure DevOps,
   - link a work item if I provided an id.
5. Still honor the skill's version-bump check: if a `*Client(s).csproj` or its source files changed, stop and warn me.
6. Return the PR URL as the final line — even if the PR already existed.
