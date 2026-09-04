---
name: atlas-pipelines-setup
description: "Create the Azure DevOps pipeline definitions (PR, CI and CD) for a repository from its pipeline-pr.yml, pipeline-ci.yml and pipeline-cd.yml, and apply the team's standard main branch policies copied from a reference repository of the same project. Use this skill whenever the user wants to register or create the pipelines of a repo, or protect its main branch — phrases like 'create the pipelines', 'create the PR, CI and CD pipelines', 'set up the pipelines in DevOps', 'register the pipeline YAMLs', 'configure the main branch policies', 'set up branch policies like the other repos', 'add build validation to main', 'protect the main branch'. Also trigger right after a new repository has been scaffolded and its pipeline YAML files exist but nothing runs them yet, even if the user doesn't say 'pipeline' explicitly."
version: 1.0.0
---

# atlas-pipelines-setup

## Purpose

Turn a repository that already has its pipeline YAML files into a repository that Azure DevOps actually builds, validates and deploys, protected the way every other repository of the project is:

1. Resolve the repository and the transport (MCP or `az` CLI)
2. Check that the three pipeline YAML files exist on the branch
3. Choose the reference repository the conventions are copied from
4. Read the naming convention from it and decide what is missing on the target
5. Create the missing pipeline definitions
6. Copy the missing `main` branch policies, pointing the build validation at the new PR pipeline
7. Report what exists now

The skill never writes to the repository itself: no commits, no pushes, no YAML edits. Generating the YAML files is the scaffolding's job; this skill only registers them. It never modifies or deletes an existing pipeline or policy either — it only adds what is missing and reports the rest — so rerunning it on a configured repository is safe and costs a handful of read calls.

> Azure DevOps is the only platform covered today. All platform calls are described in `references/azure-devops.md`; read it before the first call and never guess a tool name or a CLI flag it does not give you.

---

## Autonomy Rules

Act without asking for confirmation for:
- Reading the remote, the current branch and the YAML files
- Installing the `azure-devops` extension of `az` when it is missing (a local CLI add-on, nothing on the server)
- Listing repositories of the project, pipelines and branch policies, on the target and on candidate references
- Choosing the reference repository when the user does not name one (Step 3). Say which one you picked and why in one line and carry on.
- Creating the pipeline definitions and the policies that are missing — the user asked for exactly that by invoking the skill
- Skipping anything that already exists, and reporting how an existing policy differs from the reference without touching it

Stop and ask the user if:
- Any of `pipeline-pr.yml`, `pipeline-ci.yml`, `pipeline-cd.yml` is missing on the branch — list the missing ones. Registering a pipeline whose file does not exist gives a definition that fails on first run with an opaque error, and generating the files is a different task.
- No transport is available, `az` is not logged in, or the `azure-devops` extension cannot be installed — say exactly what to run.
- No configured MCP server can be tied to the organization and `az` is not available for the pipeline half — writing definitions into the wrong organization is not recoverable.
- No reference repository with policies on `main` can be found and the user did not name one — there is nothing to copy, and inventing a standard is not the skill's call.
- A pipeline with the expected name already exists but points at a different YAML path or repository — report it and wait. Creating a second one with a suffixed name would leave two half-configured pipelines.

Use the *Stopped* block from the Output Summary section for every stop, so the user sees what was checked before the stop and what is missing.

---

## Step 1 — Resolve the repository and the transport

Read the remote and the branch:

```bash
git remote get-url origin
git branch --show-current
```

Parse organization, project and repository from the remote URL as the adapter describes (`https://[<user>@]dev.azure.com/<org>/<project>/_git/<repo>`; the project may be URL-encoded). Do not list projects or repositories to find the **target** — the remote already says. Listing repositories is only for choosing a reference (Step 3).

The branch that carries the YAML files is the current one unless the user names another. Pipeline definitions themselves always default to `main`: that is where the CI trigger lives and where the build policy evaluates PRs into.

Resolve the target's repository GUID (`RESOLVE_REPO` in the adapter). Pipeline creation and every policy call need the GUID; list calls accept the name. You will resolve it twice on purpose: once through the MCP server to confirm the server, once through `az` to confirm the login (below).

**Transport.** Pipelines can go through either MCP or `az`; pick one before starting. Several Azure DevOps MCP servers may be configured, typically one per organization with a suffix (`mcp__azure-devops-atlas__*`) plus an unsuffixed default (`mcp__azure-devops__*`). The suffix is only a hint — it is often an abbreviation or a company name, not the organization slug — so the name never decides: call `RESOLVE_REPO` for the target repository through the most likely server (suffix resembling the organization first, unsuffixed next). The server that answers with the repository, its project and a `remoteUrl` equal to the git remote is the right one; one bound to another organization answers "not found", and then you try the next server or fall back to `az`.

Branch policies have **no MCP tool**: they always go through `az repos policy`, so `az` with the `azure-devops` extension is required regardless of which transport handles the pipelines. Check it up front rather than discovering the gap after the pipelines are created:

```bash
command -v az
az extension show --name azure-devops --query version -o tsv || az extension add --name azure-devops
az repos show --org https://dev.azure.com/<org> -p "<project>" -r <repo> --query id -o tsv
```

Pass `--org` and `-p` on every `az` call rather than running `az devops configure --defaults`: the defaults are a global setting of the user's machine, and silently repointing them would change what their other shells do afterwards. There is a second reason: `az devops` also infers organization and project from the git remote of the **current directory**, and that inference wins over the defaults — a command run from another repository's folder silently talks to the wrong organization. Explicit flags remove both surprises.

The GUID from `az` must equal the one the MCP server returned; when they match, both halves of the transport are confirmed. If the call fails with an authentication error, stop: `az login` (and `az devops login` when a PAT is used) is the user's to run. If it fails with `TF401019` ("does not exist or you do not have permissions") while MCP found the repository, `az` is looking at the wrong organization or the account lacks read access: run `az repos list --org … -p …` to see which project it is really listing, fix the flags, and only then stop if it still fails.

---

## Step 2 — Check the YAML files

The check is against the committed tree of the branch, not the working tree: a definition runs what is committed.

```bash
git ls-remote --heads origin <branch>
git fetch origin <branch> --quiet          # only when the branch exists on origin
git ls-tree --name-only origin/<branch> pipeline-pr.yml pipeline-ci.yml pipeline-cd.yml
```

When the branch is not on `origin` yet — common right after scaffolding — check the local ref instead (`git ls-tree --name-only <branch> …`) and add a warning to the report: the PR pipeline cannot validate anything until the branch is pushed.

All three must be listed. Anything missing → stop with the list of missing files, and register nothing, not even the two that exist: a repository with a CI and no PR validation, or the other way round, is the confusing half-state this skill exists to avoid.

Only when all three are present, read the CD:

```bash
git show origin/<branch>:pipeline-cd.yml      # or <branch>:pipeline-cd.yml for a local-only branch
```

In `pipeline-cd.yml`, find the pipeline resource the CD consumes: the entry of `resources.pipelines` whose alias is `Main`, or the first entry when none is called that. Its `source` must be exactly the name the CI pipeline will get in Step 4. A CD whose `source` names a pipeline that does not exist never triggers and never explains why. Report a mismatch as a warning with both names, and keep going — the user decides whether to fix the YAML or rename the pipeline.

---

## Step 3 — Choose the reference repository

When the user named one, use it. Otherwise pick the sibling that is most likely to carry the same conventions: list the repositories of the project (`LIST_REPOS`) and keep those whose name starts with the longest dotted prefix of the target's name — for `Atlas.Foo.Bar.Web` first the names starting with `Atlas.Foo.Bar` (the parent `Atlas.Foo.Bar` itself included), then `Atlas.Foo`, then `Atlas` — excluding the target itself. Within one prefix level sort the candidates alphabetically, and take the first that has policies on `main` (`LIST_POLICIES`); a sibling with pipelines but no policies is not a reference for anything. Alphabetical order is arbitrary but stable, which is what makes two runs pick the same reference.

Say the choice in one line: *"Reference: `Atlas.Foo.Bar.Api` — closest sibling with policies on main."* No candidate at any prefix → stop and ask for one.

Keep the reference's GUID and its policy list; Step 6 uses them, so do not fetch them twice.

---

## Step 4 — Read the naming convention and decide what is missing

The project's convention is read from the reference, not assumed. List its pipeline definitions with `LIST_PIPELINES` (all properties) and extract:

- the **name pattern** — in Atlas projects `<Repo> - Pipeline PR`, `<Repo> - Pipeline CI`, `<Repo> - Pipeline CD`
- the **folder** — `\Projects\<Repo>`
- the **YAML path** — the three files at the repository root
- the **default branch** — `refs/heads/main`
- the **agent pool** — the hosted `Azure Pipelines` queue

When the reference has no pipelines, fall back to exactly that pattern and say so in the report.

Now list the target's own definitions the same way. That listing already carries YAML path, default branch, folder and queue, so it is also the verification of what exists: for each of the three expected names decide **missing** (create in Step 5), **present and matching** (report as already existing), or **present but different** (stop, Autonomy Rules).

---

## Step 5 — Create the missing pipeline definitions

Create only what Step 4 marked missing, one call per pipeline (`CREATE_PIPELINE` in the adapter). Through MCP:

```
pipelines_write(action: create_pipeline, project: "<project>",
  name: "<Repo> - Pipeline PR", folder: "\Projects\<Repo>",
  repositoryType: AzureReposGit, repositoryId: "<repo-guid>", repositoryName: "<repo>",
  yamlPath: "pipeline-pr.yml")
```

Through the CLI:

```bash
az pipelines create --org https://dev.azure.com/<org> -p "<project>" \
  --name "<Repo> - Pipeline PR" --folder-path "\Projects\<Repo>" \
  --repository <repo> --repository-type tfsgit --branch main --yml-path pipeline-pr.yml --skip-first-run
```

Two things worth knowing so you do not fight them:
- Creation does **not** validate that the YAML exists on `main`. A definition created while the files are still on a feature branch is fine: the PR pipeline runs from the PR's merge commit, and the CI runs once the files reach `main`.
- `--skip-first-run` (CLI) matters: the first run of a CI definition on `main` would fail while the YAML is not there yet, and a red first run confuses everyone who looks at the pipeline later.

Verify each definition you created (`SHOW_PIPELINE`): YAML path, `defaultBranch: refs/heads/main`, folder and queue must match Step 4. Keep the PR pipeline's numeric id, existing or new: Step 6 needs it.

---

## Step 6 — Replicate the main branch policies

Policies are copied from the reference, never typed from memory: the reviewer count, the required reviewer identity, the merge strategy and the reset-on-push flags are team decisions that live in the reference, and copying them exactly is what "like the other repos" means.

List the target's policies on `main` (`LIST_POLICIES`). For every policy of the reference, derive the configuration the target **should** have:

- copy `isEnabled`, `isBlocking`, `type.id` and the whole `settings` object as they are
- replace `settings.scope` with `[{ "repositoryId": "<target-guid>", "refName": "refs/heads/main", "matchKind": "Exact" }]`
- when `settings.buildDefinitionId` exists (the build validation policy), set it to the target's PR pipeline id

Then decide per `type.id`:

- **Absent on the target** → create it with `az repos policy create --org … -p "<project>" --config <policy>.json`. With `--config` the CLI takes the scope from the file and **rejects** `--repository-id` and `--branch` ("unrecognized arguments"); do not add them.
- **Present and equal** to the derived configuration (compare `isEnabled`, `isBlocking` and `settings` after the two replacements above; `scope` and `buildDefinitionId` are therefore never a difference by themselves) → report as already existing.
- **Present but different** → report as already existing **with the differing settings named** (`resetRejectionsOnSourcePush: target true, reference false`), and leave it alone. An existing policy is somebody's decision; the skill adds protection, it never changes or removes it. Sibling repositories legitimately differ in small flags, and a rerun on a correctly configured repository must not turn into a stop.

The reference's own oddities are copied, not fixed — if it has `resetRejectionsOnSourcePush: true` where another repository has `false`, the user chose (or the prefix rule found) that reference, and levelling the team's repositories is a different conversation. Mention it when you notice it.

If anything was created, list the target's policies once more and use that listing for the report; otherwise the first listing is the report.

---

## Step 7 — Report

Print the summary below, then the operational notes that apply. They are the three things that surprise people after a fresh setup:

- **An already-open PR gets no policy evaluations** until its next push. Adding a build validation policy does not queue a build on existing PRs; a push (or `az repos pr policy queue`) does.
- **The CD pipeline's first run asks for resource authorization** — the CI pipeline it consumes and any shared pipelines it references (typically the provisioning and deploy-tooling pipelines of the project). Someone approves once from the run itself. A first deployment usually also runs with `Provisioning = true`.
- **The CI pipeline only triggers on `main`**: nothing builds until the PR that carries the YAML files is merged. The PR pipeline is the one that runs before that.

---

## Output Summary

Project names are written decoded in the block (`Atlas Software`); the URLs at the end keep the encoded form (`Atlas%20Software`), or they do not open.

```
=== pipelines-setup-summary ===
repository: <org> / <project> / <repo>   (id <repo-guid>)
branch with YAML: <branch>
reference repository: <reference-repo>   (named by user | closest sibling with policies on main)

pipelines (folder \Projects\<repo>, default branch main):
  <Repo> - Pipeline PR   id 919   pipeline-pr.yml   created
  <Repo> - Pipeline CI   id 920   pipeline-ci.yml   created
  <Repo> - Pipeline CD   id 921   pipeline-cd.yml   already existed

main branch policies:
  Minimum number of reviewers   created            (2 reviewers, creator vote counts, reset on push)
  Work item linking             created
  Comment requirements          already existed
  Require a merge strategy      already existed    (squash)
  Build                         created            (build validation → pipeline 919)
  Required reviewers            already existed    (1 required reviewer, creator vote counts) — differs from reference: minimumApproverCount target 1, reference 2 (left as is)

warnings:
  (none) | pipeline-cd.yml references "<name>" but the CI pipeline is "<other>"

next:
  - open PRs will be evaluated on their next push
  - authorize the CD pipeline's resources on its first run (Provisioning = true for a first deployment)
=== end ===
```

End with the web URLs of the pipelines that exist now, one per line (`https://dev.azure.com/<org>/<project>/_build?definitionId=<id>`).

When the skill stops, print this instead, then the question that fits the reason:

```
=== pipelines-setup-stopped ===
repository: <org> / <project> / <repo>   (id <repo-guid>, when Step 1 resolved it)
stopped at: Step <n> — <reason in one sentence>
checked so far: <what was verified: remote, transport, YAML files, reference, pipelines found>
missing / conflicting: <the exact list: files, pipeline names and YAML paths, server names>
=== end ===
```

- Missing YAML files → "Do you want to generate the missing file(s) first — a separate task — or name a branch that already carries all three?"
- No transport / not logged in → the exact command(s) to run, then "tell me when it is done".
- No reference repository → "Which repository should I copy the branch policies from?"
- Same-name pipeline pointing elsewhere → "Keep the existing definition, or should it be re-pointed at `<yaml>` by hand? I do not change existing pipelines."

---

## Failure Handling

| Situation | Action |
|-----------|--------|
| A `pipeline-*.yml` is missing on the branch | Stop; list the missing files. Do not create any definition |
| `az` not installed / not logged in | Stop; tell the user to install the Azure CLI, run `az login` (and `az devops login` if they use a PAT) |
| `azure-devops` extension missing and `az extension add` fails | Stop; show the error — policies cannot be created without it |
| The MCP server answers "not found" for the target repository | It serves another organization; try the other configured servers, then fall back to `az` for the pipelines |
| `az repos show` answers `TF401019` (does not exist or no permission) | Check the remote URL parsing (user prefix, URL-encoded project name) and that `--org`/`-p` are on the command — `az devops` otherwise infers them from the current directory's git remote. `az repos list --org … -p …` shows which project it is really talking to. Still failing → stop |
| The branch is not on `origin` yet | Check the local ref and warn that the PR pipeline cannot validate anything until the branch is pushed |
| A same-name pipeline points at another YAML or repository | Stop; report both definitions |
| No sibling with policies on `main` at any prefix | Stop; ask the user to name a reference repository |
| An existing policy differs from the reference | Report the differing settings; never change or remove it |
| `az repos policy create` answers `unrecognized arguments: --repository-id ... --branch ...` | Remove those flags — the scope is already inside `--config` |
| `az repos policy create` answers 403 | The user lacks *Edit policies* on the repository; stop and say so |
| `pipelines_write` / `az pipelines create` answers 403 | The user is not a Build Administrator on the project; stop and say so |
| `pipeline-cd.yml` names a CI pipeline that does not match the created one | Warn with both names; continue — fixing the YAML is the user's call |

---

## Tips

- The required-reviewer identity ids (`requiredReviewerIds`) are organization identities and copy across repositories unchanged; do not try to resolve or re-create them — not every user may list identities.
- Listing everything before creating anything is what makes the skill safe to rerun: a second invocation on a configured repository reports every row as already existing (with any small differences named) and creates nothing.
- Keep the PR pipeline id in the report; it is what the build validation policy points at, and the first thing to check when a PR shows "no policies evaluated".
