---
name: atlas-azure-devops-pr
description: "Use this skill whenever the user wants to create a PR, open a pull request, review branch differences, or prepare code for review in an Atlas/Azure DevOps repository. Trigger this skill when someone mentions 'PR', 'pull request', 'hacer PR', 'crea una PR', 'subir cambios', 'review my changes', 'merge to main', or asks to link a PBI or work item to their branch. Also trigger when the user finishes implementing a feature or fix and their next logical step is getting it reviewed or merged — even if they don't say 'pull request' explicitly."
version: 1.1.1
---

# atlas-azure-devops-pr

## Purpose

Standardizes pull request creation for Atlas repositories in Azure DevOps. Prefers Azure DevOps MCP tools; falls back to Azure CLI.

Use it to:
- summarize branch changes against the target branch
- generate a PR title and Markdown description from the real diff
- create or update the PR in Azure DevOps
- link a PBI or work item when the user provides one
- return the final PR URL

## Preconditions

1. The repository remote must point to Azure DevOps.
2. If on the resolved target branch (see Step 1), ask: **"Is this a feature, bug, or fix?"** Create a branch with the appropriate prefix (`feature/`, `bug/`, `fix/`) and a short descriptive name — never include PBI numbers. Switch to it and continue.
3. Act autonomously for everything else: staging, committing, pushing, creating or updating the PR.
4. Stop only if: authentication is broken, merge conflicts exist, or a `*Client(s).csproj` **or any of its source files** was modified without a version bump.

## Workflow

### 1. Inspect repository state

Start by reading the remote URL and current branch:

```bash
git remote get-url origin
git branch --show-current
git status --short
```

Parse the Azure DevOps **project** and **repository** directly from the remote URL — format: `https://dev.azure.com/<org>/<project>/_git/<repo>`. Never call `list_projects` or `list_repos`.

#### Target branch resolution

Resolve `<target-branch>` before running any diff commands. Follow this decision tree:

1. **User explicitly names a target branch** → use it directly, no further questions.
2. **User does not specify a target branch** → ask:

   > "Which branch should this PR target? You can type it directly, or I can look it up from Azure DevOps."
   > - **1. Type the branch name**
   > - **2. Look it up from Azure DevOps**

3. **User chooses option 1** → use the provided name, proceed.
4. **User chooses option 2** →
   - Call `mcp__azure-devops__repo_get_repo_by_name_or_id` with the repo name parsed from the remote URL.
   - Extract the `defaultBranch` field (format: `refs/heads/<branch>`); strip the `refs/heads/` prefix.
   - Show the result and ask for confirmation before continuing:

     > "The default branch in Azure DevOps is `<branch>`. Use this as the PR target?"

   - If confirmed → use that branch, proceed.
   - If rejected → ask the user to type the desired target branch.

Once `<target-branch>` is resolved, fetch it and gather diff stats:

```bash
git fetch origin <target-branch> --quiet
git rev-list --left-right --count origin/<target-branch>...HEAD
git log --oneline --no-merges origin/<target-branch>..HEAD
git diff --stat origin/<target-branch>...HEAD
git diff --name-status origin/<target-branch>...HEAD
```

### 2. Commit and push if needed

- Uncommitted changes with 0 commits ahead of `<target-branch>`: stage all, commit with a descriptive message, push.
- Branch local-only: push before creating the PR.
- Already committed and pushed: continue.

Never claim a PR was created when the branch changes are not in remote history.

### 3. Version-bump check

Run both checks. If either fires, stop and warn the user before continuing.

**Direct:** was the `.csproj` itself modified?
```bash
git diff --name-only origin/<target-branch>...HEAD | grep -E "Clients?\.csproj$"
```

**Indirect:** were any files changed inside a client project directory? (covers new requests, responses, or endpoints — `.csproj` unchanged in SDK-style projects)
```bash
git ls-files | grep -E "Clients?\.csproj$" | while read f; do
  dir=$(dirname "$f")
  git diff --name-only origin/<target-branch>...HEAD | grep -q "^${dir}/" && echo "$f"
done
```

If any result is returned by either check, stop and warn the user. Indicate bump type — **Major** (breaking API change), **Minor** (new endpoints), **Patch** (internal fix) — and wait for confirmation before proceeding to Step 4.

### 4. Build PR content

Generate the title and description **in English**, regardless of the language used in commit messages or by the user.

**Title format:** `<repo>: <concise description>` — where `<repo>` is the repository name parsed from the remote URL in Step 1. No `feat:`, `fix:`, `chore:` prefixes.

Example: `Atlas.MyService: Add user authentication endpoint`

**Description:** Markdown, in English, with:
- Summary
- What changed
- Why

Use `--stat` and `--name-status` output from Step 1. Only read full file diffs if the change is ambiguous and context is essential.

### 5. Create or update the PR

Use the project and repo parsed from the remote URL in Step 1.

Check for an existing active PR from the current branch into `<target-branch>`:
- `mcp__azure-devops__repo_list_pull_requests_by_repo_or_project`

**No PR exists:** create with `mcp__azure-devops__repo_create_pull_request`.

**PR already exists:** if there are commits newer than the PR's `creationDate`, regenerate title and description and update with `mcp__azure-devops__repo_update_pull_request`. Otherwise return the existing URL unchanged.

**User provides a work item ID:** link it with `mcp__azure-devops__wit_link_work_item_to_pull_request`.

Use fully qualified refs: `refs/heads/<source-branch>` → `refs/heads/<target-branch>`.

**Azure CLI fallback** (if MCP unavailable):
```bash
az repos pr create --source-branch <source-branch> --target-branch <target-branch> \
  --title "<title>" --description "<markdown>"
az repos pr work-item add --id <prId> --work-items <id>
```

### 6. Return the PR URL

Return the PR URL. If the PR could not be created, explain the blocking reason plainly.
