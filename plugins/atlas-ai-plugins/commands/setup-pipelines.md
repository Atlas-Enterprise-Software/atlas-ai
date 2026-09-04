---
description: Create the PR/CI/CD pipeline definitions from the repo's YAML files and apply the standard main branch policies via the atlas-pipelines-setup skill — never commits
argument-hint: [reference repository, optional]
---

Register the pipelines of the current repository and protect its `main` branch by running the **atlas-pipelines-setup** skill. If I passed an argument, it is the reference repository whose naming convention and branch policies must be copied: $ARGUMENTS

The skill reads the organization, project and repository from the git remote and works against Azure DevOps through the adapter it ships with. Do not assume identifiers, tool names or CLI flags the adapter does not give you.

**Hard rule — never modify the repository.** This command registers pipeline definitions and branch policies in Azure DevOps; it does not `git add`, `git commit`, `git push`, and it does not create or edit any file in the working tree, YAML included. If the skill's Step 2 finds a `pipeline-*.yml` missing, STOP and show me the list — generating those files is a different task, and I will do it or ask for it separately.

Follow the skill's own flow, with these points made explicit:

1. Let it resolve the repository and the transport (its Step 1). **If `az` is missing, not logged in, or the `azure-devops` extension cannot be installed, STOP** and show me its message verbatim — branch policies have no other transport.
2. Let it check the YAML files (its Step 2). Missing files are a stop, as above.
3. Let it choose the reference repository (its Step 3). When I did not name one, tell me in one line which sibling it picked and why, then continue; if it finds none with policies on `main`, STOP and ask me for one.
4. Let it read the convention and decide what is missing (its Step 4), create the missing pipelines (its Step 5) and copy the missing policies (its Step 6). Anything that already exists is reported, not re-created or changed; an existing policy that differs from the reference is reported with the differing settings and left alone. **If a same-name pipeline points at another YAML or repository, STOP** and show me both definitions.
5. Print the skill's summary block (its Step 7) with the operational notes: open PRs are evaluated on their next push, the CD's first run needs its resources authorized, and the CI only triggers on `main`.
6. Return the web URLs of the pipelines that exist now as the final lines — even if all of them existed already.
