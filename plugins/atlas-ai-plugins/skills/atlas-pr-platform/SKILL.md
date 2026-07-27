---
name: atlas-pr-platform
description: "Use this skill whenever the user wants to create a PR, open a pull request, update an existing one, review branch differences, read or answer review comments, or prepare code for review in a repository hosted on any platform. Trigger this skill when someone mentions 'PR', 'pull request', 'hacer PR', 'crea una PR', 'subir cambios', 'review my changes', 'merge to main', 'los comentarios de la PR', or asks to link a PBI, work item, or issue to their branch. Also trigger when the user finishes implementing a feature or fix and their next logical step is getting it reviewed or merged — even if they don't say 'pull request' explicitly."
version: 2.0.2
---

# atlas-pr-platform

## Purpose

The pull-request layer for Atlas repositories, on **any** hosting platform. Everything in this file is platform-independent: git inspection, change-type inference, PR content generation, the Atlas version-bump check. Everything that actually talks to a hosting platform goes through the [operation contract](#operation-contract), implemented by one adapter per platform.

Use it to:
- summarize branch changes against the target branch
- infer the change type (feature / bug / fix) from the real diff
- generate a PR title and Markdown description from the real diff
- create or update the PR
- link a work item, PBI, or issue when the user provides one
- read the unresolved review comments on an open PR, and reply to them
- return the final PR URL

## Preconditions

1. The repository must have a remote pointing at a platform with an adapter (see [Resolve the platform](#1-resolve-the-platform)).
2. If on the resolved target branch (see Step 2), infer the change type from the actual changes (see *Change-type inference*) and create a branch with the matching prefix (`feature/`, `bug/`, `fix/`) and a short descriptive name — never include PBI numbers. Switch to it and continue. Only ask the user when the inference is ambiguous.
3. Act autonomously for everything else: staging, committing, pushing, creating or updating the PR.
4. Stop only if: no adapter or transport is available, authentication is broken, merge conflicts exist, or a `*Client(s).csproj` **or any of its source files** was modified without a version bump.

## 1. Resolve the platform

Read the remote and map its host to an adapter:

```bash
git remote get-url origin
git branch --show-current
git status --short
```

| Remote host | Platform | Adapter |
|-------------|----------|---------|
| `dev.azure.com`, `*.visualstudio.com` | Azure DevOps | `references/azure-devops.md` |

Adding a platform means adding a row here and a file in `references/` — see `references/_ADAPTER-TEMPLATE.md`. Nothing else in the plugin changes.

**Read the adapter file before any platform call:**

```
${CLAUDE_PLUGIN_ROOT}/skills/atlas-pr-platform/references/<adapter>.md
```

The adapter tells you how to parse repository identifiers from the remote, which transport to use, how to perform each contract operation, and that platform's cross-reference conventions. Never guess an API shape or a tool name that the adapter did not give you.

**Unknown host** → stop. Name the host, say no adapter exists for it, and list the platforms that are supported. Do not fall back to another platform's API, and do not attempt raw guesses at a REST endpoint — a request shaped for the wrong platform either fails confusingly or, worse, writes somewhere unintended.

### Transport resolution

Each adapter offers two transports. Pick one **before** starting the workflow, in this order:

1. **MCP tools** for that platform, when a matching server is configured in the session.
2. **The platform's official CLI**, when the binary is on `PATH` and authenticated. Your adapter names it.

Check availability rather than assuming — a missing transport discovered halfway through leaves a half-pushed branch and no PR:

```bash
command -v az 2>/dev/null   # plus whichever CLI your adapter names
```

For MCP, check whether the session actually exposes tools for the platform. When several MCP servers exist for the same platform, pick the one whose name matches the organization / owner parsed from the remote. If several match and none is unambiguous, **stop and report the candidates** — writing to the wrong organization's PR is not recoverable.

**Neither transport available** → stop and say exactly what to install or configure for that platform (the adapter names both). Do not carry on and report a PR that was never created.

## Operation contract

Every adapter implements these. Names are contract-level; the adapter maps each to real tools.

| Operation | Input | Returns |
|-----------|-------|---------|
| `RESOLVE_REPO` | remote URL | the identifiers that platform needs (org/project/repo, owner/repo, or project path) |
| `RESOLVE_IDENTITY` | — | who *we* are on this platform, for telling our own comments apart from a reviewer's |
| `FIND_OPEN_PR` | repo ids, source branch | PR id, url, title, created timestamp — or nothing |
| `CREATE_PR` | repo ids, source, target, title, description | PR id, url |
| `UPDATE_PR` | repo ids, PR id, title, description | PR url |
| `LINK_WORK_ITEM` | repo ids, PR id, work item / issue id | confirmation |
| `LIST_THREADS` | repo ids, PR id | review threads: thread id, file, line, status, whether it is a review thread or a platform-generated entry, and the **full ordered comment list** — author and timestamp on every comment |
| `REPLY_TO_THREAD` | repo ids, PR id, thread id, text | confirmation |
| `RESOLVE_THREAD` | repo ids, PR id, thread id | confirmation |

`LIST_THREADS` must return every comment in each thread, in order — not just the first. The comment sequence is what makes [round detection](#round-detection) possible, and a thread flattened to its opening comment loses the entire review conversation.

An adapter may mark an operation **unsupported** on its platform, in one of two ways:

- **Unsupported, no substitute** → skip the step and say so plainly in your report.
- **Unsupported, with a documented substitute** → use the substitute the adapter names, and report both that the real operation does not exist here *and* how the substitute differs. `LINK_WORK_ITEM` is the case that comes up: a platform without a PR-to-work-item artifact link links through a closing keyword in the description instead, which also closes the issue — not the same thing as a link, so the difference is stated rather than glossed over.

What is forbidden is **improvising**: reaching for a mechanism that merely looks similar when the adapter did not name it. The substitute has to come from the adapter, in writing.

## 2. Inspect repository state

### Target branch resolution

The target branch is **always `main`** — never ask.

The only exception: the user explicitly names a different target branch in their request → use that one.

Once `<target-branch>` is resolved, fetch it and gather diff stats:

```bash
git fetch origin <target-branch> --quiet
git rev-list --left-right --count origin/<target-branch>...HEAD
git log --oneline --no-merges origin/<target-branch>..HEAD
git diff --stat origin/<target-branch>...HEAD
git diff --name-status origin/<target-branch>...HEAD
```

### Change-type inference (feature / bug / fix)

Classify the branch from the evidence — commit messages, `--name-status` output, and the working-tree diff if changes are uncommitted. Do **not** ask the user unless the signals genuinely conflict.

- **feature** — adds new capability: new files with public types, new endpoints or routes, new components, new options or parameters, new behavior described in commits ("add", "añade", "nuevo", "implement").
- **bug** — corrects defective runtime behavior: linked Bug work item, or commits/diff describe broken behavior being repaired ("fix", "corrige", wrong result, exception, regression).
- **fix** — small corrections that are not behavioral defects: typos, naming, config, docs, build scripts, formatting, dependency pins.

State the inferred type in one line (e.g. *"Inferred change type: **feature** — new `GetUserById` endpoint"*) and continue. The inferred type drives the branch prefix (Precondition 2). If mixed (e.g. a feature plus an unrelated bugfix), pick the dominant type by diff weight.

## 3. Commit and push if needed

- Uncommitted changes with 0 commits ahead of `<target-branch>`: stage all, commit with a descriptive message, push.
- Branch local-only: push before creating the PR.
- Already committed and pushed: continue.

Never claim a PR was created when the branch changes are not in remote history.

## 4. Version-bump check

Run both checks against committed **and uncommitted (working-tree)** changes. If either fires, stop and warn the user before continuing.

Both checks run against the same set of changed files, so a client change is detected whether it is committed on the branch, staged/unstaged in the working tree, or a new untracked file. Define that set once and reuse it in both checks:
```bash
changed_files() { { git diff --name-only origin/<target-branch>...HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u; }
```
It unions three sources: `origin/<target-branch>...HEAD` (committed changes), `git diff --name-only HEAD` (staged + unstaged), and `git ls-files --others --exclude-standard` (new untracked files).

**Direct:** was the `.csproj` itself modified?
```bash
changed_files | grep -E "Clients?\.csproj$"
```

**Indirect:** were any files changed inside a client project directory? (covers new requests, responses, or endpoints — `.csproj` unchanged in SDK-style projects)
```bash
files=$(changed_files)
git ls-files | grep -E "Clients?\.csproj$" | while read f; do
  dir=$(dirname "$f")
  echo "$files" | grep -q "^${dir}/" && echo "$f"
done
```

If any result is returned by either check, stop and warn the user. Indicate bump type — **Major** (breaking API change), **Minor** (new endpoints), **Patch** (internal fix) — and wait for confirmation before proceeding to Step 5.

## 5. Build PR content

Generate the title and description **in English**, regardless of the language used in commit messages or by the user.

**Title format:** `<repo>: <concise description>` — where `<repo>` is the repository name parsed by `RESOLVE_REPO`. No `feat:`, `fix:`, `chore:` prefixes.

Example: `Atlas.MyService: Add user authentication endpoint`

**Description:** Markdown, in English, with:
- Summary
- What changed
- Why

**Cross-references are platform-specific.** Platforms do not agree on what `#` and `!` mean — the same character points at a PR on one and an issue on another — so the wrong one silently links nothing or links the wrong object. Take the syntax from your adapter's *Cross-reference conventions* section, and never carry a convention over from another platform.

Use `--stat` and `--name-status` output from Step 2. Only read full file diffs if the change is ambiguous and context is essential.

## 6. Create or update the PR

Call `FIND_OPEN_PR` for the current branch into `<target-branch>`.

- **No PR exists** → `CREATE_PR`.
- **PR already exists** → if there are commits newer than the PR's created timestamp, regenerate title and description and `UPDATE_PR`. Otherwise return the existing URL unchanged.
- **User provided a work item / issue id** → `LINK_WORK_ITEM`.

Branch reference format differs per platform (fully qualified `refs/heads/<branch>` vs. a plain branch name). The adapter states which its transport expects.

## 7. Review comments

When the task is reading or answering review feedback rather than creating a PR:

1. `FIND_OPEN_PR` for the current branch. No open PR → say so and stop. Do not fall back to another branch's PR, and do not create one.
2. `LIST_THREADS`. Keep the unresolved review threads; drop the platform's own entries — policy, build, vote, "joined as a reviewer". The adapter names the exact statuses and markers. **Filter on state, never on who wrote it:** platform entries are posted under real user identities, so author matching drops real comments and keeps noise.
3. Read the code each comment points at before classifying it. A reviewer's one-liner usually assumes context that is in the file, not in the comment.
4. Apply [round detection](#round-detection) to every surviving thread.
5. `REPLY_TO_THREAD` and `RESOLVE_THREAD` are **outward-facing and irreversible**: everything on the team sees them. Never call either one unless the user has approved the exact text. Only resolve a thread whose fix is committed and pushed — a thread resolved against uncommitted work is a lie to the reviewer.

### Round detection

A review is a conversation that can go around more than once: you answer a comment, resolve the thread, push a fix — and the reviewer comes back unconvinced. However the platform surfaces that (your adapter's *Reopen semantics* section says how), `LIST_THREADS` hands the thread back looking exactly like a brand-new comment.

Treating a returning thread as new is the single most expensive mistake here: the fix that already failed gets attempted again, and the reviewer's real objection — *"this is the third time I'm asking"* — goes unread.

**The PR itself is the record.** Derive the history from the comment sequence; keep no local ledger. A file on disk would have to survive `/raise-pr` deleting `.ship/`, would be one more thing for the developer to ignore and clean up, and would be invisible to a teammate running the pipeline on the same branch. The thread has the truth already.

From `RESOLVE_IDENTITY` and the ordered comment list:

- **Round number** = how many comments in the thread we authored, plus one. A thread we have never answered is round 1.
- **Reopened** = the thread contains a comment of ours, *and* at least one later comment from someone else. Report it as `REOPENED (round N)`.
- **What we said last time** = the text of our most recent comment in that thread. Carry it forward — it is the fix that did not satisfy the reviewer, and it must not be re-posted as if it were new.
- **What they say now** = every comment after ours, verbatim. This is the actual objection.

### Reopened by citation

A thread's status is not the only way a reviewer says "this still isn't done". They may leave your resolution alone and instead **re-raise the point somewhere else** — most often in a later review summary that links back to the thread. The thread stays resolved, so a status filter drops it, and the objection disappears from the fix list while remaining live in the review.

Treat a resolved thread as **reopened** when a comment published *after* it was resolved cites it — by link, by id, or by quoting it — and disputes it. Its round number is counted the same way, from our own comments in it.

This costs one extra step and it is not optional: filtering by status alone will silently hide the case. After collecting the unresolved threads, read the PR-level comments — the summary posts especially — and resolve every thread reference they contain. Any cited thread that is not already in your set gets fetched and added, marked as reopened by citation. Your adapter says what a citation looks like on this platform.

### Ordering

Report reopened threads **first**, ahead of first-time comments, whether they were reopened by status or by citation. A thread on round 3 or higher is no longer a coding problem: say so plainly and hand it to the human, rather than proposing a third fix for something two fixes have already missed.

## 8. Return the PR URL

Return the PR URL that the user can click and navigate to the PR. If the PR could not be created, explain the blocking reason plainly.

**Always return the PR URL as the final line of your response, even when the PR already existed.**
