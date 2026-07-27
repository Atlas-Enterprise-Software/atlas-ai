# Adapter: Azure DevOps

Hosts: `dev.azure.com`, `*.visualstudio.com`

## RESOLVE_REPO

Parse **org**, **project**, and **repo** directly from the remote URL:

```
https://dev.azure.com/<org>/<project>/_git/<repo>
https://<org>.visualstudio.com/<project>/_git/<repo>
```

Never call `core_list_projects` or `repo_list_repos_by_project` — the remote already has everything.

## Transport

**Preferred — MCP.** Tools are written below as `mcp__azure-devops__*`. The configured server is usually suffixed per organization (for example `mcp__azure-devops-atlas__*`). Pick the server whose suffix matches `<org>`. Several servers matching no org unambiguously → stop and report the candidates.

**Fallback — Azure CLI** (`az`), with the `azure-devops` extension.

**Neither** → stop. Tell the user to configure an Azure DevOps MCP server for `<org>`, or install the Azure CLI and run `az extension add --name azure-devops && az devops login`.

Branch refs: **fully qualified** — `refs/heads/<branch>`.

## Operations

| Operation | MCP | `az` CLI |
|-----------|-----|----------|
| `RESOLVE_IDENTITY` | `core_get_identity_ids` for the authenticated user | `az ad signed-in-user show --query mail` |
| `FIND_OPEN_PR` | `repo_list_pull_requests_by_repo_or_project` (status `active`, filter `sourceRefName == refs/heads/<branch>`) | `az repos pr list --source-branch <branch> --status active` |
| `CREATE_PR` | `repo_create_pull_request` | `az repos pr create --source-branch <b> --target-branch <t> --title "<title>" --description "<markdown>"` |
| `UPDATE_PR` | `repo_update_pull_request` | `az repos pr update --id <prId> --title "<title>" --description "<markdown>"` |
| `LINK_WORK_ITEM` | `wit_link_work_item_to_pull_request` | `az repos pr work-item add --id <prId> --work-items <id>` |
| `LIST_THREADS` | `repo_list_pull_request_threads` with `status: "Active"` — it already embeds every comment with `author.uniqueName` and `publishedDate`, so one call is usually enough. Only fall back to `repo_list_pull_request_thread_comments` for a thread whose comment list looks truncated | not supported — use MCP |
| `REPLY_TO_THREAD` | `repo_reply_to_comment` | not supported — use MCP |
| `RESOLVE_THREAD` | `repo_update_pull_request_thread` (status `fixed`) | not supported — use MCP |

Thread operations require MCP. On the CLI fallback, report them as unavailable rather than approximating them with a PR-level comment.

## Thread filtering

Filter by **status first**, and only then look at authors. Getting that order wrong is how automated noise ends up on the fix list.

### Status is a number

`status` comes back as an integer, not a name:

| 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Unknown | **Active** | Fixed | WontFix | Closed | ByDesign | **Pending** |

- **Unresolved** = `1` or `6`.
- **Settled, skip** = `2`, `3`, `4`, `5`.

Comparing `status` against the string `"active"` matches nothing and silently lets every thread through. The `repo_list_pull_request_threads` tool does take the **name** in its optional `status` parameter, though — pass `status: "Active"` and let the server filter, rather than filtering the full list yourself.

### A missing status means auto-generated

**Threads with no `status` field at all are the automated ones** — votes, `"The reference … was updated"`, `"Vote of … was reset"`, `"… joined as a reviewer"`, `"Policy status has been updated"`. Dropping every thread that has no `status` is the single most reliable filter here; on a typical PR it removes most of the list in one step.

Do **not** filter on `commentType`. That field is absent from the trimmed response and only appears with `fullResponse: true`, so a rule written against it never fires.

### Author identity does not identify system threads

Automated threads are posted under real people's identities, so author matching cannot be the filter:

- `"Atlas AI Architect voted 5"` carries `author.uniqueName: ai@atlassoftware.es` — the **same identity** as that reviewer's genuine review comments.
- `"Policy status has been updated"` carries the **PR author's own** `uniqueName`. Treat it as one of "our" comments and the round count inflates for a thread we never touched.
- The true system author is `displayName: Microsoft.VisualStudio.Services.TFS` with an **empty** `uniqueName` — useful, but it covers only some of them.

Identity is for counting rounds inside a thread that already passed the status filter. It is never for deciding whether the thread belongs on the list.

### File, line, and PR-level threads

File and line come from the thread's `threadContext` (`filePath`, `rightFileStart.line`). A thread with no `threadContext` is a PR-level comment — keep it, and record its file as `(PR-level)`.

One PR-level shape to recognize: a reviewer's **summary** post (a "code review summary" with an overall vote and no file). It passes the status filter and is worth reading, but it is **informational** — it is a verdict on the PR, not a change request. Never turn it into a fix for the `coder`.

**Reactivation:** replying to a thread whose status is `2` (Fixed) sets it back to `1` (Active). That is the reopen signal — the status alone does not distinguish it from a new thread, so match our own `author.uniqueName` against `RESOLVE_IDENTITY` and count our comments (see *Round detection* in `SKILL.md`).

`RESOLVE_IDENTITY` fallback: `git config user.email` matches `author.uniqueName` in most Atlas organizations. Use it when neither the MCP identity call nor `az ad` is available, and say which source you used — a wrong identity match silently turns a reopened thread back into a "new" one.

## Cross-reference conventions

- Pull requests → `!<id>` (e.g. `!223`). **Never `#<id>`.**
- Work items (PBI, Bug, Task) → `#<id>` (e.g. `#21960`).

## Work item linking

Azure DevOps links work items as first-class PR artifacts, so `LINK_WORK_ITEM` is a real API call — do not settle for mentioning the id in the description.
