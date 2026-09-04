# Adapter: Azure DevOps

Hosts: `dev.azure.com`, `*.visualstudio.com`

Verified on 2026-09-04 against real repositories in two organizations: every command and every gotcha below was hit for real, not read from documentation.

## RESOLVE_REPO

```
https://[<user>@]dev.azure.com/<org>/<project>/_git/<repo>
https://<org>.visualstudio.com/<project>/_git/<repo>
```

The `<user>@` prefix is common on remotes cloned from the Azure DevOps UI and carries no information — drop it. Project names may be URL-encoded (`Atlas%20Software`); decode them before passing them to `az`. The repository GUID:

```bash
az repos show --org https://dev.azure.com/<org> -p "<project>" -r <repo> --query id -o tsv
```

Pass `--org`/`-p` on every `az` call instead of `az devops configure --defaults`, which rewrites the user's global CLI defaults.

or through MCP: `repo_repository(action: get, project: "<project>", repositoryNameOrId: "<repo>")` → `id`.

## Transport

**Pipelines — MCP preferred.** Tools are written below as `mcp__azure-devops__*`. Sessions often configure one server per organization, suffixed (`mcp__azure-devops-atlas__*`), sometimes next to an unsuffixed default (`mcp__azure-devops__*`). The suffix is a hint, not an identifier: in the sessions this was verified on, `mcp__azure-devops-atlas__*` served one organization and the unsuffixed `mcp__azure-devops__*` served a different one, and neither suffix was an organization slug. Order the candidates by how much the suffix resembles the organization (abbreviations count), unsuffixed last, and confirm each by calling `repo_repository` (action `get`) for the target repository through it: the right server returns the repository with its `project.name` and a `remoteUrl` equal to the git remote; a server bound to another organization answers "not found", and you move to the next. Only when no server can be confirmed **and** `az` is unavailable is it a stop.

**Pipelines — CLI fallback.** `az pipelines` from the `azure-devops` extension.

**Branch policies — CLI only.** The Azure DevOps MCP server exposes no policy tool. `az repos policy` is the transport, always. So the extension is a hard requirement of this skill, whichever transport handles the pipelines.

```bash
az extension show --name azure-devops --query version -o tsv || az extension add --name azure-devops
```

**Neither** → stop and say: install the Azure CLI, `az extension add --name azure-devops`, `az login`; or configure an Azure DevOps MCP server for `<org>` for the pipeline half.

## Operations

| Operation | MCP | `az` CLI |
|-----------|-----|----------|
| `RESOLVE_REPO` | `repo_repository` (action `get`, `project`, `repositoryNameOrId`) | `az repos show -r <repo> --query id -o tsv` |
| `LIST_REPOS` (to choose a reference) | `repo_repository` (action `list`, `project`, `repoNameFilter: "<prefix>"` — a **substring** filter, so keep only the names that really start with the prefix) | `az repos list --org <org-url> -p "<project>" --query "[?starts_with(name,'<prefix>')].{name:name, id:id}" -o json` |
| `LIST_PIPELINES` | `pipelines_definition` (action `list`, `project`, `repositoryId`, `repositoryType: TfsGit`, `includeAllProperties: true`) | `az pipelines list --org <org-url> -p "<project>" --repository <repo> --repository-type tfsgit -o json` |
| `CREATE_PIPELINE` | `pipelines_write` (action `create_pipeline`, `repositoryType: AzureReposGit`, `repositoryId` GUID, `repositoryName`, `yamlPath`, `folder`, `name`) | `az pipelines create --name "<name>" --folder-path "<folder>" --repository <repo> --repository-type tfsgit --branch main --yml-path <file> --skip-first-run` |
| `SHOW_PIPELINE` | `pipelines_definition` (action `list`, `project`, `definitionIds: [id]`, `includeAllProperties: true`) | `az pipelines show --id <id> --query "{name:name, path:path, yaml:process.yamlFilename, defaultBranch:repository.defaultBranch, queue:queue.name}"` |
| `LIST_POLICIES` | not supported — use CLI | `az repos policy list --org <org-url> -p "<project>" --repository-id <guid> --branch main -o json` |
| `CREATE_POLICY` | not supported — use CLI | `az repos policy create --org <org-url> -p "<project>" --config <file.json>` |
| `LIST_PR_POLICY_EVALUATIONS` | not supported — use CLI | `az repos pr policy list --id <prId> -o json` |
| `QUEUE_PR_BUILD_POLICY` | not supported — use CLI | `az repos pr policy queue --id <prId> --evaluation-id <evaluationId>` |

`includeAllProperties: true` on `pipelines_definition` is what returns `process.yamlFilename`, `repository.defaultBranch`, `path` and `queue`; without it the list is names and ids only. With it, one listing per repository is enough to both find the definitions and verify them — no separate `SHOW_PIPELINE` call is needed for definitions that already exist.

Which calls need the repository **GUID**: `pipelines_write` (`repositoryId`) and every `az repos policy` command. The list calls (`pipelines_definition`, `az pipelines list`) accept the repository name.

## What a reference repository looks like

Three definitions, all in the project's `\Projects\<Repo>` folder, YAML at the repository root, default branch `main`, hosted queue `Azure Pipelines`:

| Name | YAML |
|------|------|
| `<Repo> - Pipeline PR` | `pipeline-pr.yml` |
| `<Repo> - Pipeline CI` | `pipeline-ci.yml` |
| `<Repo> - Pipeline CD` | `pipeline-cd.yml` |

The CD YAML consumes the CI by **name** (`resources.pipelines[].source: "<Repo> - Pipeline CI"`), which is why Step 2 of the skill checks it.

## Policies on `main` — the shape to copy

`az repos policy list` returns objects like this (settings vary by type; `scope` is what must change):

```json
{
  "id": 1001,
  "isBlocking": true,
  "isEnabled": true,
  "type": { "id": "0609b952-1397-4640-95ec-e00a01b2c241", "displayName": "Build" },
  "settings": {
    "buildDefinitionId": 555,
    "displayName": null,
    "manualQueueOnly": false,
    "queueOnSourceUpdateOnly": false,
    "validDuration": 0.0,
    "scope": [ { "repositoryId": "<reference-guid>", "refName": "refs/heads/main", "matchKind": "Exact" } ]
  }
}
```

The configuration file for `az repos policy create --config` is the same object minus `id`, with `scope` re-pointed and, for the build policy, `buildDefinitionId` replaced by the target's PR pipeline id. The same derived object is what an existing target policy is compared against on a rerun — never the raw reference, whose `scope` and `buildDefinitionId` differ by construction:

```json
{
  "isEnabled": true,
  "isBlocking": true,
  "type": { "id": "0609b952-1397-4640-95ec-e00a01b2c241" },
  "settings": {
    "buildDefinitionId": 999,
    "displayName": null,
    "manualQueueOnly": false,
    "queueOnSourceUpdateOnly": false,
    "validDuration": 0.0,
    "scope": [ { "repositoryId": "<target-guid>", "refName": "refs/heads/main", "matchKind": "Exact" } ]
  }
}
```

The six policies observed on Atlas repositories, for orientation only — always read the real ones from the reference:

| Type (displayName) | Settings seen |
|--------------------|---------------|
| Minimum number of reviewers | `minimumApproverCount: 2`, `creatorVoteCounts: true`, `allowDownvotes: false`, `resetOnSourcePush: true`, `resetRejectionsOnSourcePush` varies per repo |
| Work item linking | `{}` |
| Comment requirements | `{}` |
| Require a merge strategy | `allowSquash: true` |
| Build | `buildDefinitionId: <PR pipeline>`, `manualQueueOnly: false`, `queueOnSourceUpdateOnly: false`, `validDuration: 0` |
| Required reviewers | `requiredReviewerIds: ["<identity-guid>"]`, `minimumApproverCount: 1`, `creatorVoteCounts: true` |

Type ids are stable across an organization but the settings are the team's choice; copy them from the reference instead of from this table.

## Gotchas, all hit for real

- `az devops` infers organization and project from the git remote of the **current working directory**, and that inference wins over `az devops configure --defaults`. Run from another repository's folder, `az repos show -r <repo>` answers `TF401019` ("does not exist or you do not have permissions") for a repository that exists, and `az repos list` lists the other organization's repositories. Always pass `--org <org-url> -p "<project>"`.
- A freshly scaffolded branch is often not on `origin` yet: `git fetch origin <branch>` fails with `couldn't find remote ref`. Check with `git ls-remote --heads origin <branch>` first and fall back to the local ref (`git ls-tree <branch> …`).

- `az repos policy create --config <file>` **rejects** `--repository-id` and `--branch` with `unrecognized arguments`. The scope lives in the JSON.
- `az repos policy list` needs both `--repository-id` (GUID) and `--branch`; the branch is a plain name (`main`), not `refs/heads/main`.
- Sibling repositories of the same family legitimately differ in small flags (`resetRejectionsOnSourcePush` was `false` on one reference and `true` on its three siblings). A rerun that compared strictly and stopped would block on a correctly configured repository; report the difference and move on.
- Choosing a reference needs `LIST_REPOS`; there is no way to find "the closest sibling" without listing the project's repositories by name prefix.
- Creating a pipeline definition does not check that the YAML file exists on `main`; it only fails at run time. That is fine while the files are on the PR branch.
- Adding a build validation policy does **not** create policy evaluations on PRs that were already open: `az repos pr policy list --id <prId>` returns `[]` until the PR's next push. To validate the YAML anyway, run the PR pipeline against the branch: `az pipelines run --id <prId> --branch <branch>` and poll `az pipelines runs show --id <runId> --query status`.
- The CD pipeline's first run stops at "resources not authorized" for every pipeline resource it declares (its CI, and any shared provisioning or deploy-tooling pipelines it declares). A project administrator authorizes them from the run page, once.
- Definitions created through the Pipelines API (MCP `pipelines_write` or `az pipelines create`) carry no `repository.properties` object, while older definitions show `properties.reportBuildStatus: "true"`, `fetchDepth`, and so on (through `az pipelines show` the same shows as `reportBuildStatus: null`). It is not one of the compared attributes (YAML path, default branch, folder, queue) and the PR build status still reaches the PR through the build policy, so this is cosmetic.
- Identity ids in `requiredReviewerIds` are organization-wide; they are copied as-is. Resolving them to a display name is not possible for every user (listing app registrations or identities needs directory permissions), so do not make the flow depend on it.
