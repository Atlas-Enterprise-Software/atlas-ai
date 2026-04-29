---
name: atlas-webapi-backlog-generator
description: "Generate a full Azure DevOps backlog for a new .NET Web API following Atlas Clean Architecture. Use this skill whenever the user wants to create backlog items, generate PBIs, scaffold work items, or says 'crea el backlog para la API de X', 'genera los work items para Y', 'prepara las tareas de desarrollo para Z', 'create backlog for the X entity', or asks to plan the development of a new .NET service. Also trigger when the user describes a new API to build and their next logical step is creating work items."
version: 1.0.0
---

# atlas-webapi-backlog-generator

## Purpose

Generate a structured Azure DevOps backlog for a new Clínica Atlas .NET Web API, following the 5-layer Clean Architecture standard. Produces a three-level hierarchy:

- **EPIC** (optional) — top-level initiative
- **Feature** — one per entity
- **Product Backlog Items** (all under their Feature):
  - **API-level** PBIs (under the first Feature only):
    - **Scaffolding** and **Backoffice Developers page** — only when the Web API is new (does not yet exist)
    - **Event Ingestion** — always included, regardless of API existence
  - 5 **CRUD** PBIs per entity (List All, Get by ID, Create, Update, Delete)

All work items are created in the Azure DevOps organization and project provided by the user, using the Scrum process template.

After collecting inputs, the skill renders a full preview tree and waits for explicit user approval before creating any item.

---

## Autonomy Rules

Act without asking:
- Write all work item titles and descriptions in **English** — regardless of the language the user writes in
- Default to 1 Scaffolding PBI per API + 5 CRUD PBIs per entity
- Generate PBI descriptions and validation rules using the API context provided — do not ask the user to write them
- Use MCP exclusively; if not installed, attempt auto-install before reporting failure
- Apply naming suggestion silently only after user has confirmed it

Stop and ask only if:
- Entity name, API name, Feature name, API context, API existence, Azure DevOps organization, or Azure DevOps project are missing — ask all at once in a single message
- **Never assume** the Azure DevOps organization or project — always ask if not stated explicitly
- **Never assume** whether the API is new or already exists — always ask if not stated explicitly
- A naming coherence issue is detected — present the suggestion and wait for confirmation
- A non-obvious cross-field validation rule applies — mention it and ask whether to include
- User chose "link existing EPIC" but provided no ID — ask for the numeric ID
- User rejects or edits the preview — apply changes and re-render before creating anything
- Azure DevOps authentication fails (MCP returns 401/403) — report and stop

---

## Step 1 — Collect inputs

Check the user's message for the following fields. Ask for everything missing in a **single message** — never one question per turn.

**Required inputs:**

| Input | Behavior if absent |
|-------|--------------------|
| Entity name(s) | Ask |
| API name | Ask — **never infer from entity name** |
| Feature name (per entity) | Ask |
| API context / description | Ask — used to validate naming and propose validators |
| EPIC decision | Ask — choices: (a) create new EPIC, (b) link to existing EPIC (provide ID), (c) skip |
| API existence | Ask — **never assume**; choices: (a) new API (needs to be created from scratch), (b) API already exists |
| Azure DevOps organization | Ask — **never assume** |
| Azure DevOps project | Ask — **never assume** |

If multiple inputs are missing, use this template:

```
To generate the backlog I need a few details:

1. What entity (or entities) will this API manage? (e.g. "Project", "Customer", "Resource")
2. What is the API name? (e.g. "Projects", "Customers", "Resources")
3. What should the Feature be called? (e.g. "Project Management", "Customer Records CRUD")
   — If multiple entities, provide one Feature name per entity.
4. Briefly describe what this API does and its domain. (Helps validate naming and propose validators.)
5. EPIC: (a) create a new EPIC, (b) link to existing EPIC — tell me the ID, or (c) skip the EPIC level?
6. Is this a new Web API that needs to be created from scratch, or does the repository already exist?
7. Azure DevOps organization and project where the work items should be created. (e.g. org: "atlas", project: "Atlas Development")
```

Wait for the reply before continuing.

---

## Step 1b — Validate naming coherence and propose validators

After receiving all inputs, and **before** building the item tree, analyse coherence using the API context.

### Naming coherence

Check whether entity name(s), API name, and Feature name(s) are consistent with each other and with the domain described. If a mismatch is found, present it before proceeding:

```
⚠️  Naming suggestion:
  Entity "Event" seems misaligned with API "ProjectManagement" (domain: scheduling).
  Suggested entity name: "Project"
  Proceed with "Project", keep "Event", or use a different name?
```

Wait for confirmation if a naming change is proposed. Proceed silently if all names are coherent.

### Validation rules

Using the API context, derive domain-specific FluentValidation rules for the Create and Update PBI descriptions. Infer entity properties and their types from the context.

Common validator mapping:

| Property type | Suggested validators |
|--------------|---------------------|
| Name / title | `NotEmpty()`, `MaximumLength(200)` |
| Email | `NotEmpty()`, `EmailAddress()` |
| Future date/time | `NotEmpty()`, `GreaterThanOrEqualTo(DateTime.UtcNow)` |
| Phone | `Matches(@"^\+?[0-9\s\-]{7,15}$")` |
| Enum field | `IsInEnum()` |
| Foreign key / GUID reference | `NotEmpty()`, `Must(id => id != Guid.Empty)` |
| Numeric range | `InclusiveBetween(min, max)` |
| Optional text | `MaximumLength(500)` |

Embed the inferred validators directly into the Create and Update PBI description templates.

For non-obvious cross-field rules (e.g., `StartDateTime < EndDateTime`), ask explicitly before including:
> "For {EntityName}, should I add a cross-field validator to ensure `StartDateTime` is before `EndDateTime`?"

---

## Step 2 — Build item tree in memory

Construct the full hierarchy without touching Azure DevOps.

### EPIC (if creating)

- **Type**: `Epic`
- **Title**: user-supplied, or suggested default `{ApiName} — New Service`
- **Description**: `Top-level initiative for the development of the {ApiName} .NET Web API, following Clínica Atlas Clean Architecture standards (5-layer solution, Cosmos DB, Azure Container Apps, Event Grid).`

### Feature — one per entity

- **Type**: `Feature`
- **Title**: user-supplied Feature name
- **Parent**: EPIC (if one exists)
- **Description** (first Feature, new API): `Implements the full CRUD surface for the {EntityName} aggregate, including all architectural layers (Domain, Application, Infrastructure, WebApi) and the corresponding test projects. Also contains API-level PBIs: solution scaffolding, event ingestion registration, and Backoffice Developers page.`
- **Description** (first Feature, existing API): `Implements the full CRUD surface for the {EntityName} aggregate, including all architectural layers (Domain, Application, Infrastructure, WebApi) and the corresponding test projects. Also contains the event ingestion registration PBI.`
- **Description** (subsequent Features): `Implements the full CRUD surface for the {EntityName} aggregate, including all architectural layers (Domain, Application, Infrastructure, WebApi) and the corresponding test projects.`

### PBI order under the first Feature

The composition of the first Feature depends on whether the API is new or already exists.

#### New API

1. **Scaffolding** (API-level, first)
   - **Title**: `[{ApiName}] Scaffolding`
   - **Description**: see "Scaffolding" template below

2–6. **CRUD PBIs for the first entity** (see below)

7. **Event Ingestion** (API-level)
   - **Title**: `[{ApiName}] Event Ingestion`
   - **Description**: see "Event Ingestion" template below

8. **Backoffice Developers page** (API-level, last)
   - **Title**: `[{ApiName}] Backoffice Developers page`
   - **Description**: see "Backoffice Developers page" template below

#### Existing API

1–5. **CRUD PBIs for the first entity** (see below)

6. **Event Ingestion** (API-level, last)
   - **Title**: `[{ApiName}] Event Ingestion`
   - **Description**: see "Event Ingestion" template below

### CRUD PBIs — 5 per entity, parented to their Feature

- `[{ApiName}] List all {EntityName}s`
- `[{ApiName}] Get {EntityName} by ID`
- `[{ApiName}] Create {EntityName}`
- `[{ApiName}] Update {EntityName}`
- `[{ApiName}] Delete {EntityName}`

Use the per-operation description templates below.

---

## Step 3 — Render preview tree

Render the full hierarchy before touching Azure DevOps. Use this format:

**Single entity — new API, with EPIC:**
```
Backlog preview — please review before creation
================================================

EPIC [NEW]  {EpicTitle}
└── Feature  {FeatureName}
    ├── PBI  [{ApiName}] Scaffolding                ← API-level (new API only)
    ├── PBI  [{ApiName}] List all {EntityName}s
    ├── PBI  [{ApiName}] Get {EntityName} by ID
    ├── PBI  [{ApiName}] Create {EntityName}
    ├── PBI  [{ApiName}] Update {EntityName}
    ├── PBI  [{ApiName}] Delete {EntityName}
    ├── PBI  [{ApiName}] Event Ingestion      ← API-level
    └── PBI  [{ApiName}] Backoffice Developers page ← API-level (new API only)

Total: 1 EPIC  |  1 Feature  |  8 PBIs  (3 API-level + 5 CRUD)
Org: atlas  |  Project: Atlas Development

Shall I create these items in Azure DevOps? (yes / no / edit)
```

**Single entity — existing API, with EPIC:**
```
Backlog preview — please review before creation
================================================

EPIC [NEW]  {EpicTitle}
└── Feature  {FeatureName}
    ├── PBI  [{ApiName}] List all {EntityName}s
    ├── PBI  [{ApiName}] Get {EntityName} by ID
    ├── PBI  [{ApiName}] Create {EntityName}
    ├── PBI  [{ApiName}] Update {EntityName}
    ├── PBI  [{ApiName}] Delete {EntityName}
    └── PBI  [{ApiName}] Event Ingestion      ← API-level

Total: 1 EPIC  |  1 Feature  |  6 PBIs  (1 API-level + 5 CRUD)
Org: atlas  |  Project: Atlas Development

Shall I create these items in Azure DevOps? (yes / no / edit)
```

**Multiple entities — new API:**
```
EPIC [NEW]  {EpicTitle}
├── Feature  {FeatureName1}
│   ├── PBI  [{ApiName}] Scaffolding                ← API-level, first Feature only
│   ├── PBI  [{ApiName}] List all {Entity1}s
│   ├── PBI  [{ApiName}] Get {Entity1} by ID
│   ├── PBI  [{ApiName}] Create {Entity1}
│   ├── PBI  [{ApiName}] Update {Entity1}
│   ├── PBI  [{ApiName}] Delete {Entity1}
│   ├── PBI  [{ApiName}] Event Ingestion      ← API-level, first Feature only
│   └── PBI  [{ApiName}] Backoffice Developers page ← API-level, first Feature only
└── Feature  {FeatureName2}
    ├── PBI  [{ApiName}] List all {Entity2}s
    ├── ...

Total: 1 EPIC  |  2 Features  |  13 PBIs  (3 API-level + 10 CRUD)
```

**Multiple entities — existing API:**
```
EPIC [NEW]  {EpicTitle}
├── Feature  {FeatureName1}
│   ├── PBI  [{ApiName}] List all {Entity1}s
│   ├── PBI  [{ApiName}] Get {Entity1} by ID
│   ├── PBI  [{ApiName}] Create {Entity1}
│   ├── PBI  [{ApiName}] Update {Entity1}
│   ├── PBI  [{ApiName}] Delete {Entity1}
│   └── PBI  [{ApiName}] Event Ingestion      ← API-level, first Feature only
└── Feature  {FeatureName2}
    ├── PBI  [{ApiName}] List all {Entity2}s
    ├── ...

Total: 1 EPIC  |  2 Features  |  11 PBIs  (1 API-level + 10 CRUD)
```

**Variants:**
- `EPIC [EXISTING #id]` — when linking to an existing EPIC.
- No EPIC line — when user skipped EPIC; Features appear at the root level.

If the user answers `edit`, ask what to change, apply in memory, and re-render. Do **not** create any item until the user explicitly answers `yes`.

---

## Step 4 — Verify MCP availability

Before creating any item, verify the `azure-devops` MCP server is reachable.

1. Attempt a lightweight call: `mcp__azure-devops__core_list_projects(organization: "{Organization}")`.
2. If the server is **not installed or unreachable**, attempt auto-install:
   ```bash
   claude mcp add --scope user azure-devops -- npx -y @azure-devops/mcp {Organization}
   ```
   Then retry.
3. If still unavailable after retry, **stop** and report:
   > "The Azure DevOps MCP server could not be reached or installed. Please run `claude mcp add --scope user azure-devops -- npx -y @azure-devops/mcp {Organization}` manually, restart Claude Code, and try again."

Do **not** fall back to Azure CLI.

---

## Step 5 — Create items in Azure DevOps

Create in strict top-down order. Note each returned `id` immediately — it is needed for parent linking.

### Create a work item

```
mcp__azure-devops__wit_create_work_item(
  organization: "{Organization}",
  project: "{Project}",
  type: "Epic" | "Feature" | "Product Backlog Item",
  title: "<title>",
  description: "<rich description from template>",
)
```

### Link child → parent

After creating each item, establish the parent link:

```
mcp__azure-devops__wit_update_work_item(
  organization: "{Organization}",
  project: "{Project}",
  id: <child-id>,
  relations: [{
    rel: "System.LinkTypes.Hierarchy-Reverse",
    url: "https://dev.azure.com/{Organization}/_apis/wit/workItems/<parent-id>"
  }]
)
```

Creation order and parenting:
1. EPIC (if new) — no parent
2. For each entity: Feature → parent = EPIC (if exists)
3. **[New API only]** Scaffolding PBI → parent = first Feature
4. For each entity: 5 CRUD PBIs → parent = that entity's Feature
5. Event Ingestion PBI → parent = first Feature (always)
6. **[New API only]** Backoffice Developers page PBI → parent = first Feature

---

## Step 6 — Output Summary

```
=== webapi-backlog-generator-summary ===
org: {Organization}
project: {Project}
api: {ApiName}
status: success

epic:
  id: {epicId}
  title: {EpicTitle}
  url: https://dev.azure.com/{Organization}/{Project-URL-encoded}/_workitems/edit/{epicId}

features:
  - id: {featureId}
    title: {FeatureName}
    url: https://dev.azure.com/{Organization}/{Project-URL-encoded}/_workitems/edit/{featureId}
    pbis:
      - id: {id}  title: [{ApiName}] Scaffolding                    ← omit if existing API
      - id: {id}  title: [{ApiName}] List all {EntityName}s
      - id: {id}  title: [{ApiName}] Get {EntityName} by ID
      - id: {id}  title: [{ApiName}] Create {EntityName}
      - id: {id}  title: [{ApiName}] Update {EntityName}
      - id: {id}  title: [{ApiName}] Delete {EntityName}
      - id: {id}  title: [{ApiName}] Event Ingestion
      - id: {id}  title: [{ApiName}] Backoffice Developers page      ← omit if existing API

items_created: {n}
=== end ===
```

Omit `epic:` if no EPIC was created or linked.

---

## Failure Handling

| Situation | Action |
|-----------|--------|
| Missing entity name, API name, Feature name, or context | Ask all at once in a single message |
| Naming coherence issue detected | Present suggestion; wait for user decision |
| Non-obvious cross-field validator | Ask whether to include before adding to PBI description |
| User chose "link existing EPIC" but gave no ID | Ask for the numeric EPIC ID |
| MCP server not installed | Run `claude mcp add --scope user azure-devops -- npx -y @azure-devops/mcp {Organization}`; retry once; report and stop if still unavailable |
| MCP server unavailable after install attempt | Stop and instruct the user to install manually (`claude mcp add --scope user azure-devops -- npx -y @azure-devops/mcp {Organization}`) and restart Claude Code |
| MCP returns 401/403 | Tell the user to check their Azure DevOps PAT or run `az devops login`; stop |
| User answers "no" to preview | Ask "What would you like to change?" — apply, re-render |
| User answers "edit" | Ask for the change inline, apply, re-render |
| Work item created but parent linking fails | Report the orphaned item ID in the summary; provide manual linking instructions |
| Partial failure mid-run | List all successfully created IDs so the user can continue or clean up manually |

---

## PBI Description Templates

Use these templates verbatim, substituting `{ApiName}` and `{EntityName}`. Embed inferred validation rules from Step 1b into the Create and Update templates.

---

### Scaffolding PBI

```markdown
## Goal
Generate the full solution skeleton for the {ApiName} API using the Atlas .NET template and configure all infrastructure.

## Tasks

### Generate solution from template
Run the Atlas .NET template to scaffold the 5-layer Clean Architecture solution:

```
dotnet new api --name {ApiName} --entity {EntityName}
```

This generates:
- `{ApiName}.WebApi` — Minimal API endpoints, DI wiring, middleware
- `{ApiName}.Application.Contracts` — service interfaces, DTOs, request/response models
- `{ApiName}.Application.Impl` — service implementations, validators, mappers, events
- `{ApiName}.Domain` — `{EntityName}` entity (implements `IAuditable`), `I{EntityName}Repository`, enums, constants
- `{ApiName}.Infrastructure` — Cosmos DB repository `{EntityName}CosmosRepository`
- `{ApiName}.Client` — NuGet client library auto-generated from OpenAPI spec, published to `Feed`
- 5 test projects: `Domain.UnitTest`, `Application.UnitTest`, `WebApi.IoCTest`, `ComponentTest`, `E2ETest`

### Review and adjust generated output
- Verify DI wiring in `Program.cs`: `AddApi()` → `AddWebApi()`, `AddApplication()`, `AddInfrastructure()`, `AddClients()`
- Configure Cosmos DB container for `{EntityName}` (partition key `PK`) and Azure App Configuration keys under `CB:CosmosDb:{ApiName}`
- Configure Event Grid: event types `{EntityName}Created`, `{EntityName}Updated`, `{EntityName}Deleted` in `Application.Impl/{EntityName}/Events/`; Azure App Configuration keys under `CB:EventGrid:{ApiName}`

### CI/CD
- Add `pipeline-pr.yml`, `pipeline-ci.yml`, `pipeline-cd.yml` (test execution order: Unit → IoCTest → ComponentTest → E2E)

### Infrastructure as Code (Pulumi)
- Add Pulumi stacks in `/provisioning/` for DEV, PRE, PRO (`Pulumi.{api-name}-{env}.yaml`)
- Each stack provisions: Azure Container App + Event Grid topics per event type

### Docker
- Verify multi-stage `Dockerfile` in `WebApi/`: base image `mcr.microsoft.com/dotnet/aspnet:10.0`, `FEED_ACCESSTOKEN` build arg, non-root user (`$APP_UID`), ports `8080`/`8081`

## Acceptance Criteria
- [ ] `dotnet new cb-api` completes without errors and generates all expected projects
- [ ] `dotnet build --configuration Release` succeeds with zero errors and zero warnings
- [ ] `IoCTest` resolves all DI registrations without throwing
- [ ] `{EntityName}` implements `IAuditable` (`CreatedAt`, `ModifiedAt`, `CreatedBy`, `ModifiedBy`)
- [ ] Three event types are defined and registered with `IEventService`
- [ ] Cosmos DB container is accessible from `ComponentTest` in DEV
- [ ] All three pipeline files pass validation
- [ ] Pulumi stacks deploy successfully to DEV
- [ ] Docker image builds locally with `docker build --build-arg FEED_ACCESSTOKEN=<token> .`
```

---

### List All

```markdown
## Goal
Implement `GET /` — returns all {EntityName}s from Cosmos DB.

## Layers to implement

| Layer | Change |
|-------|--------|
| `{ApiName}.Domain` | Add `GetAllAsync(CancellationToken ct)` → `Task<IEnumerable<{EntityName}>>` to `I{EntityName}Repository` |
| `{ApiName}.Application.Contracts` | Add `{EntityName}Response` DTO; add `GetAllAsync(ct)` to `I{EntityName}Service` |
| `{ApiName}.Application.Impl` | Implement `{EntityName}Service.GetAllAsync` — calls repository, maps to DTO via `To{EntityName}Response()` static extension |
| `{ApiName}.Infrastructure` | Implement `{EntityName}CosmosRepository.GetAllAsync` using `GetItemLinqQueryable<{EntityName}>()` |
| `{ApiName}.WebApi` | Add `GET /` endpoint in `{EntityName}Endpoints.cs` (route group `/{entity-plural-kebab}`) → `200 OK` with `IEnumerable<{EntityName}Response>` |

## Acceptance Criteria
- [ ] `GET /{entity-plural-kebab}` returns `200 OK` with a JSON array
- [ ] Returns empty array (not `404`) when the Cosmos DB container has no items
- [ ] `Application.UnitTest` covers `GetAllAsync` with a mocked repository
- [ ] `ComponentTest` verifies the endpoint against a real Cosmos DB container (seed + query)
- [ ] Swagger/OpenAPI documents the endpoint via `MinimalApi`
```

---

### Get by ID

```markdown
## Goal
Implement `GET /{id}` — returns a single {EntityName} by its Cosmos DB document ID.

## Layers to implement

| Layer | Change |
|-------|--------|
| `{ApiName}.Domain` | Add `GetByIdAsync(string id, CancellationToken ct)` → `Task<{EntityName}>` to `I{EntityName}Repository` |
| `{ApiName}.Application.Contracts` | Add `GetByIdAsync(string id, ct)` to `I{EntityName}Service` |
| `{ApiName}.Application.Impl` | Implement `{EntityName}Service.GetByIdAsync` — calls repository; throws `EntityNotFoundException` if result is null; maps to `{EntityName}Response` |
| `{ApiName}.Infrastructure` | Implement using `ReadItemAsync<{EntityName}>(id, partitionKey)`; return null on `CosmosException` with status 404 |
| `{ApiName}.WebApi` | Add `GET /{id}` endpoint → `200 OK` or `404 Not Found` (via `StatusCodeMapper` mapping `EntityNotFoundException → 404`) |

## Acceptance Criteria
- [ ] `GET /{entity-plural-kebab}/{id}` returns `200 OK` with the correct JSON object when the item exists
- [ ] Returns `404 Not Found` when the ID does not exist in Cosmos DB
- [ ] `Application.UnitTest` covers both the found and not-found code paths
- [ ] `ComponentTest` verifies both cases against a real Cosmos DB container
```

---

### Create

```markdown
## Goal
Implement `POST /` — creates a new {EntityName} in Cosmos DB and publishes a `{EntityName}Created` event to Event Grid.

## Layers to implement

| Layer | Change |
|-------|--------|
| `{ApiName}.Domain` | Add `CreateAsync({EntityName} entity, CancellationToken ct)` → `Task<{EntityName}>` to `I{EntityName}Repository` |
| `{ApiName}.Application.Contracts` | Add `Create{EntityName}Request` DTO; add `CreateAsync(Create{EntityName}Request request, ct)` to `I{EntityName}Service` |
| `{ApiName}.Application.Impl` | Implement `Create{EntityName}RequestValidator : AbstractValidator<Create{EntityName}Request>` (FluentValidation + `Globalization.Validation`); implement `{EntityName}Service.CreateAsync`: validate via `Guard` → map request to entity (set `Id = Guid.NewGuid().ToString()`, populate `IAuditable` fields) → call repository → publish `{EntityName}Created` event via `IEventService` → return `{EntityName}Response` |
| `{ApiName}.Infrastructure` | Implement using `CreateItemAsync<{EntityName}>(entity, partitionKey)`; map `CosmosException` with status 409 to `EntityAlreadyExistsException` |
| `{ApiName}.WebApi` | Add `POST /` endpoint → `201 Created` with `{EntityName}Response` and `Location` header (`/{id}`); validation errors → `400 Bad Request`; duplicate → `409 Conflict` |

## Validation rules (from domain context)

[SKILL: Replace this block with the FluentValidation rules inferred in Step 1b, formatted as a bullet list per property. Remove this section entirely if no validators were derived from the API context.]

## Acceptance Criteria
- [ ] Valid payload → `201 Created` with the new item and a `Location` header pointing to `GET /{id}`
- [ ] Invalid payload → `400 Bad Request` with structured FluentValidation error messages
- [ ] Duplicate ID → `409 Conflict`
- [ ] `{EntityName}Created` event is published to Event Grid on success
- [ ] `Application.UnitTest` covers the validator (valid + invalid cases) and the service method
- [ ] `ComponentTest` verifies creation and event publication against real Cosmos DB + Event Grid
```

---

### Update

```markdown
## Goal
Implement `PUT /{id}` — upserts a {EntityName} in Cosmos DB and publishes a `{EntityName}Updated` event.

## Layers to implement

| Layer | Change |
|-------|--------|
| `{ApiName}.Domain` | Add `UpsertAsync({EntityName} entity, CancellationToken ct)` → `Task<{EntityName}>` to `I{EntityName}Repository` |
| `{ApiName}.Application.Contracts` | Add `Update{EntityName}Request` DTO (all updatable fields); add `UpdateAsync(string id, Update{EntityName}Request request, ct)` to `I{EntityName}Service` |
| `{ApiName}.Application.Impl` | Implement `Update{EntityName}RequestValidator`; implement `{EntityName}Service.UpdateAsync`: validate → fetch existing via `GetByIdAsync` (throws `EntityNotFoundException` if not found) → apply changes, update `ModifiedAt`/`ModifiedBy` (`IAuditable`) → call `UpsertAsync` → publish `{EntityName}Updated` event → return updated response |
| `{ApiName}.Infrastructure` | Implement using `UpsertItemAsync<{EntityName}>(entity, partitionKey)` |
| `{ApiName}.WebApi` | Add `PUT /{id}` endpoint → `200 OK` with updated `{EntityName}Response`; `404 Not Found` if not found; `400 Bad Request` on validation error |

## Validation rules (from domain context)

[SKILL: Replace this block with the FluentValidation rules inferred in Step 1b, formatted as a bullet list per property. Remove this section entirely if no validators were derived from the API context.]

## Acceptance Criteria
- [ ] Valid payload → `200 OK` with updated fields
- [ ] Returns `404 Not Found` when the ID does not exist
- [ ] Invalid payload → `400 Bad Request`
- [ ] `ModifiedAt` and `ModifiedBy` are updated on every successful call
- [ ] `{EntityName}Updated` event is published to Event Grid on success
- [ ] `Application.UnitTest` covers the service method and validator
- [ ] `ComponentTest` verifies the full update flow including `IAuditable` field updates
```

---

### Delete

```markdown
## Goal
Implement `DELETE /{id}` — removes a {EntityName} from Cosmos DB and publishes a `{EntityName}Deleted` event.

## Layers to implement

| Layer | Change |
|-------|--------|
| `{ApiName}.Domain` | Add `DeleteAsync(string id, CancellationToken ct)` → `Task` to `I{EntityName}Repository` |
| `{ApiName}.Application.Contracts` | Add `DeleteAsync(string id, ct)` to `I{EntityName}Service` |
| `{ApiName}.Application.Impl` | Implement `{EntityName}Service.DeleteAsync`: verify entity exists via `GetByIdAsync` (throws `EntityNotFoundException` if not found) → call `repository.DeleteAsync` → publish `{EntityName}Deleted` event via `IEventService` |
| `{ApiName}.Infrastructure` | Implement using `DeleteItemAsync<{EntityName}>(id, partitionKey)`; map `CosmosException` with status 404 to `EntityNotFoundException` |
| `{ApiName}.WebApi` | Add `DELETE /{id}` endpoint → `204 No Content` on success; `404 Not Found` if entity does not exist |

## Acceptance Criteria
- [ ] `DELETE /{entity-plural-kebab}/{id}` returns `204 No Content` on success
- [ ] Returns `404 Not Found` when the ID does not exist
- [ ] The item is no longer retrievable via `GET /{id}` after deletion
- [ ] `{EntityName}Deleted` event is published to Event Grid on success
- [ ] `Application.UnitTest` covers both paths (entity found and not found)
- [ ] `ComponentTest` verifies deletion and event publication against real Cosmos DB + Event Grid
```

---

### Event Ingestion

```markdown
## Goal
Register the events published by the {ApiName} API in `Events.Ingestion` so ingestion can ingest and store them.

## Changes in `Events.Ingestion`

### `src/Events.Ingestion.Domain/TableNames.cs`
Add one constant per entity (one topic covers all event types for that entity):
```csharp
public const string {EntityName}EventsTableName = "{EntityName}Events";
```

### `src/Events.Ingestion.FunctionApp/Functions/{EntityName}Functions.cs`
Create a new functions class (follow the pattern of existing `*Functions.cs` files):
```csharp
[Function(nameof({EntityName}Events))]
public async Task {EntityName}Events([EventGridTrigger] EventGridEvent eventGridEvent)
{
    await eventGridIngestEventService.Ingest(eventGridEvent, @event => @event.Map(), TableNames.{EntityName}EventsTableName);
}
```

### `res/Events.Ingestion.Resources/Program.cs`
Add table provisioning:
```csharp
await CreateTable<Event>(ingestClient, TableNames.{EntityName}EventsTableName);
```

### `provisioning/Pulumi.ingestor-dev.yaml`, `pre.yaml`, `pro.yaml`
Add one entry per entity in each stack file:
```yaml
- functionName: {EntityName}Events
  topicName: {EntityName}Events
```

## Acceptance Criteria
- [ ] `{EntityName}Events` function exists in `{EntityName}Functions.cs`
- [ ] `{EntityName}EventsTableName` constant added to `TableNames.cs`
- [ ] `CreateTable` call added to `Resources/Program.cs`
- [ ] Pulumi stacks updated for DEV, PRE, PRO (one entry per entity)
- [ ] Events published by `{ApiName}` are ingested and stored in the Azure Data Explorer table in DEV
```

---

### Backoffice Developers page

```markdown
## Goal
Add the {ApiName} API to the Developers page in `BackOffice`.

## Changes in `BackOffice`

### `Directory.Packages.props`
Add the client NuGet package version:
```xml
<PackageVersion Include="{ApiName}.Client" Version="x.x.x" />
```

### `src/BackOffice.WebApp/BackOffice.WebApp.csproj`
Add the package reference:
```xml
<PackageReference Include="{ApiName}.Client" />
```

### `src/BackOffice.WebApp/Components/Pages/Developers.razor`
Add the `@using` directive at the top of the file:
```razor
@using {ApiName}.Client
```

Add the tab entry inside `OnInitializedAsync` (tabs are sorted alphabetically at the end):
```csharp
_tabs.Add(new TabItem { Title = "{ApiName}", Url = _configuration.GetValue<string>($"{{{ApiName}Client.SectionName}}:Url") + "/swagger", ApiKey = _configuration.GetValue<string>($"{{{ApiName}Client.SectionName}}:ApiKey") });
```

### `src/BackOffice.WebApp/Extensions/ConfigurationManagerExtensions.cs`
Add the `using` directive:
```csharp
using {ApiName}.Client;
```

Add the configuration selector in the chain:
```csharp
.Select($"{{{ApiName}Client.SectionName}}:{KeyFilter.Any}")
```

## Acceptance Criteria
- [ ] `{ApiName}.Client` NuGet package referenced in `Directory.Packages.props` and `.csproj`
- [ ] `@using {ApiName}.Client` added to `Developers.razor`
- [ ] Tab entry added and appears on the Developers page sorted alphabetically
- [ ] Configuration section loaded via `ConfigurationManagerExtensions`
- [ ] Swagger link opens correctly in DEV, PRE, and PRO
```
