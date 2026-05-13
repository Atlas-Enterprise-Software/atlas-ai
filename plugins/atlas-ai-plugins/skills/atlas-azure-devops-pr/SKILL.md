---
name: atlas-azure-devops-pr
description: "Use this skill whenever the user wants to create a PR, open a pull request, review branch differences, or prepare code for review in an Atlas/Azure DevOps repository. Trigger this skill when someone mentions 'PR', 'pull request', 'hacer PR', 'crea una PR', 'subir cambios', 'review my changes', 'merge to main', or asks to link a PBI or work item to their branch. Also trigger when the user finishes implementing a feature or fix and their next logical step is getting it reviewed or merged — even if they don't say 'pull request' explicitly."
version: 1.2.0
---

# atlas-azure-devops-pr

## Purpose

Standardizes pull request creation for Atlas repositories in Azure DevOps. Uses the **Azure CLI** (`az repos` / `az devops`) for all Azure DevOps operations — never the Azure DevOps MCP. The CLI is preferred because it is bound at call time to a specific organization via the `--organization` flag (parsed from the git remote), which avoids any ambiguity when multiple Azure DevOps MCP servers are configured for different organizations.

Use it to:
- summarize branch changes against the target branch
- generate a PR title and Markdown description from the real diff
- create or update the PR in Azure DevOps
- link a PBI or work item when the user provides one
- return the final PR URL

## Preconditions

1. The repository remote must point to Azure DevOps.
2. The Azure CLI (`az`) must be installed and authenticated against the relevant Azure DevOps organization. If `az repos pr list --organization <org-url> --project <project> --repository <repo>` fails with an auth error, stop and ask the user to run `az login` and `az devops login` (or refresh their PAT) before continuing.
3. If on the resolved target branch (see Step 1), ask: **"Is this a feature, bug, or fix?"** Create a branch with the appropriate prefix (`feature/`, `bug/`, `fix/`) and a short descriptive name — never include PBI numbers. Switch to it and continue.
4. Act autonomously for everything else: staging, committing, pushing, creating or updating the PR.
5. Stop only if: authentication is broken, merge conflicts exist, or a `*Client(s).csproj` **or any of its source files** was modified without a version bump.

## Workflow

### 1. Inspect repository state

Start by reading the remote URL and current branch:

```bash
git remote get-url origin
git branch --show-current
git status --short
```

Parse the Azure DevOps **organization URL**, **project**, and **repository** directly from the remote URL — format: `https://dev.azure.com/<org>/<project>/_git/<repo>`. The org URL is `https://dev.azure.com/<org>` and must be passed to every `az` command via `--organization`. Never call `az devops project list` or `az repos list` — the values are already in the remote URL.

#### Target branch resolution

Resolve `<target-branch>` before running any diff commands. Follow this decision tree:

1. **User explicitly names a target branch** → use it directly, no further questions.
2. **User does not specify a target branch** → ask:

   > "Which branch should this PR target? You can type it directly, or I can look it up from Azure DevOps."
   > - **1. Type the branch name**
   > - **2. Look it up from Azure DevOps**

3. **User chooses option 1** → use the provided name, proceed.
4. **User chooses option 2** →
   - Run:
     ```bash
     az repos show \
       --repository <repo> \
       --organization <org-url> \
       --project <project> \
       --query 'defaultBranch' \
       -o tsv
     ```
   - The output is in the form `refs/heads/<branch>`; strip the `refs/heads/` prefix.
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

Use the `az repos pr` family of commands. Pass `--organization <org-url>`, `--project <project>`, and `--repository <repo>` to every call — values come from the remote URL parsed in Step 1.

#### 5a. Check for an existing active PR

```bash
az repos pr list \
  --organization <org-url> \
  --project <project> \
  --repository <repo> \
  --source-branch <source-branch> \
  --target-branch <target-branch> \
  --status active \
  --query '[].{id:pullRequestId, created:creationDate, url:url}' \
  -o json
```

Use plain branch names (e.g. `feature/foo`) — `az repos pr list` does not require the `refs/heads/` prefix.

#### 5b. No active PR

Create with `az repos pr create`. The `--description` flag accepts Markdown. Pipe a heredoc through stdin to preserve newlines:

```bash
az repos pr create \
  --organization <org-url> \
  --project <project> \
  --repository <repo> \
  --source-branch <source-branch> \
  --target-branch <target-branch> \
  --title "<title>" \
  --description "$(cat <<'EOF'
## Summary
...

## What changed
...

## Why
...
EOF
)" \
  --output json
```

The response includes `pullRequestId` and `url` — keep them for Step 6 and for any work-item linking.

#### 5c. PR already exists

If `az repos pr list` returned a PR, compare its `creationDate` to the most recent commit on the source branch (`git log -1 --format=%cI <source-branch>`).

- **New commits exist after the PR was created** → regenerate the title and description, then update:

  ```bash
  az repos pr update \
    --organization <org-url> \
    --id <pr-id> \
    --title "<new-title>" \
    --description "$(cat <<'EOF'
  ...
  EOF
  )"
  ```

- **No new commits** → return the existing PR URL unchanged.

#### 5d. Linking a work item

If the user gave a work item / PBI ID:

```bash
az repos pr work-item add \
  --organization <org-url> \
  --id <pr-id> \
  --work-items <wi-id>
```

### 6. Return the PR URL

Return the PR URL. If the PR could not be created, explain the blocking reason plainly.
