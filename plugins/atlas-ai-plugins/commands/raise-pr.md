---
description: Open/update an Azure DevOps PR via the atlas-azure-devops-pr skill — never commits
argument-hint: [target branch or work item id, optional]
---

Create or update a pull request for the current branch by running the **atlas-azure-devops-pr** skill: $ARGUMENTS

**Hard rule — never commit, stage, or push anything.** This command only turns *already-committed and pushed* work into a PR. It must never sweep leftover changes (especially uncommitted code edits) into a commit — do not `git add`, `git commit`, or `git push` these files, ever. The `.ship/` handoff files delivered by the `/ship` pipeline are always transient: Step 1 below deletes the whole `.ship/` folder before anything else, so those files never reach the `git status` precondition check. Deleting an untracked/uncommitted file is not "committing" anything and does not violate this rule.

Override the skill's default autonomous commit/push behavior (its Precondition 3 and Step 2) as follows:

1. **Always delete the `.ship/` folder first**, before doing anything else — filesystem delete only, never `git rm`/`git add`/`git commit`/`git push`. This runs unconditionally on every invocation, whatever happens afterward:
   ```bash
   rm -rf .ship
   ```
   Report in one short line whether `.ship/` was removed or was already absent.
2. Invoke the **atlas-azure-devops-pr** skill for the current branch.
3. Run `git status --short`. If there are **uncommitted or unpushed changes**, STOP and show them to me. Do not `git add`, `git commit`, or `git push`. Ask me to commit and push manually (or tell you exactly what to include) before continuing.
4. Only once the working tree is clean and the branch is pushed, let the skill:
   - summarize the branch diff against the target branch,
   - infer the change type and (if on the target branch) create a correctly-prefixed branch,
   - generate the English PR title and description,
   - create or update the PR in Azure DevOps,
   - link a work item if I provided an id.
5. Still honor the skill's version-bump check: if a `*Client(s).csproj` or its source files changed, stop and warn me.
6. Return the PR URL as the final line — even if the PR already existed.
