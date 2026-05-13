---
name: atlas-webapi-crud-operation
description: "Implement a single CRUD operation (List, Get, Create, Update, or Delete) in an Atlas .NET Minimal API following Clean Architecture. Use this skill whenever the user wants to implement an endpoint, add a new operation to an existing API, develop a PBI related to a CRUD operation, or says things like 'implement the create endpoint', 'add the delete operation', 'develop PBI #123', 'implement the get by id', 'code the update endpoint', 'hacer el endpoint de creación', 'implementar el PBI', 'desarrollar la operación de listado'. Also trigger when the user says they want to start working on a PBI that involves a backend CRUD operation, even if they don't mention 'endpoint' explicitly."
version: 1.0.0
---

# atlas-webapi-crud-operation

## Purpose

Implement a single CRUD operation in an Atlas .NET Minimal API. Reads the PBI from Azure DevOps to understand the operation requirements, confirms the entity and validations with the user, then generates all the code across every affected Clean Architecture layer.

## Autonomy Rules

Act without asking:
- Infer the operation type (List, Get, Create, Update, Delete) from the PBI title and description
- Infer the entity name from the PBI, the repository name, or the existing codebase
- Explore the target repository to understand what already exists before generating anything
- Write all code and identifiers in **English**, regardless of the language the user writes in
- Detect which Azure DevOps MCP servers are configured by scanning the tool list for prefixes of the form `mcp__<server>__wit_*`. Each MCP server is bound to **one** Azure DevOps organization at startup, and that organization cannot be changed per call. When more than one such MCP is configured, they target **different** organizations — they are **not** redundant and one is never a fallback of the other. If exactly one is configured, use it directly; if more than one, always ask the user to pick (Step 1). Then use the same prefix for every Azure DevOps call afterwards.

Stop and ask only if:
- No PBI ID has been provided — ask for it
- More than one Azure DevOps MCP server is configured — always list them with their organizations and ask the user which one to use (Step 1)
- The project within the chosen organization is not known and cannot be inferred from the PBI's area path — ask (Step 1)
- The entity name or operation type cannot be inferred unambiguously from the PBI — ask
- The target repository is not clear — ask
- Any breaking ambiguity about validations — ask as part of Step 3 confirmation
- Request fields that look like **external entity identifiers** (e.g., `OwnerId`, `PatientId`, `DoctorId`, `ClinicId`) — ask in Step 3 whether each should be validated against its external service
- The repository is new (not yet implemented) and the **partition key** is not specified in the PBI and cannot be inferred from the entity shape — ask the user (Step 5)
- Provisioning files exist but no **Event Grid topic** is configured for this API — ask the user if they want to add one (Step 5)

Never ask about things you can discover by reading the PBI or exploring the repository.

---

## Step 1 — Collect inputs and pick the right Azure DevOps MCP

You need three things: the **PBI ID**, the **Azure DevOps organization** (which determines which MCP server to call), and the **project** within that organization.

### 1a. PBI ID

If the user did not give a numeric PBI ID, ask for it.

### 1b. Identify available Azure DevOps MCP servers

Scan your tool list for any tool whose name matches `mcp__<server>__wit_get_work_item`. Each match represents one MCP server bound to one Azure DevOps organization. Server names are user-defined and arbitrary — do not assume any particular naming; work with whatever is configured.

### 1c. Resolve the MCP (and therefore the organization)

- **If only one Azure DevOps MCP server is configured**, use it without asking.

- **If more than one is configured**, list them and ask the user to pick. Do not try to guess from the message, do not probe with the PBI ID, do not match by substring — just show the list and wait for the answer. The list must look like:

  ```
  Several Azure DevOps MCP servers are configured. Which one should I use for this PBI?

    1. <server-name-1>   (org: <Organization 1>)
    2. <server-name-2>   (org: <Organization 2>)
    ...
  ```

  To resolve each server's organization, call `core_list_projects` on every configured MCP in parallel — each call returns the projects of its own org, and the org name appears in the response. Use that to label the list.

  Wait for the user's pick (by number, server name, or org name) before continuing.

Once chosen, **remember the MCP prefix** (e.g. `mcp__<ado>__`). Every Azure DevOps call later in this skill must use that same prefix. The placeholder `mcp__<ado>__` in the snippets below stands for the chosen prefix — do not leave the placeholder literal in tool calls.

### 1d. Resolve the project

If the project is not given by the user and cannot be inferred from the PBI's area path (`System.AreaPath` field), list the projects in the chosen organization and ask:

```
mcp__<ado>__core_list_projects
```

Present projects as a numbered list. Collect all missing inputs in **one message** — never one question per turn.

---

## Step 2 — Fetch and analyze the PBI, Feature and Epic

Fetch the PBI with its relations so you can walk up the hierarchy:

```
mcp__<ado>__wit_get_work_item(id: <PBI_ID>)
```

Also fetch the **Acceptance Criteria** field:

```
mcp__<ado>__wit_get_work_item(id: <PBI_ID>, fields: ["Microsoft.VSTS.Common.AcceptanceCriteria"])
```

Then find the parent **Feature** from the PBI's relations (link type `System.LinkTypes.Hierarchy-Reverse`) and fetch it:

```
mcp__<ado>__wit_get_work_item(id: <FEATURE_ID>)
```

Then find the parent **Epic** from the Feature's relations the same way and fetch it:

```
mcp__<ado>__wit_get_work_item(id: <EPIC_ID>)
```

If the PBI has no parent Feature, or the Feature has no parent Epic, skip that level silently — do not stop or ask.

From the three work items together extract:

- **Operation type** — one of: `List`, `GetById`, `Create`, `Update`, `Delete`
- **Entity name** — the domain object being operated on
- **Route** — the HTTP path (e.g., `/projects`, `/projects/{id}`)
- **HTTP method** — GET / POST / PUT / PATCH / DELETE
- **Request shape** — fields the caller sends (for Create/Update)
- **Response shape** — fields returned to the caller
- **Validations** — every business rule, constraint, or validation mentioned across all three items
- **Repository** — the target repository (from PBI tags, description, Feature context, or Epic context)

Prefer information from the PBI when it conflicts with the Feature or Epic — the PBI is the most specific source.

---

## Step 3 — Confirm entity and validations

Before writing any code, present a structured summary and wait for explicit user confirmation:

```
PBI #<ID>: <title>

Operation:   <HTTP method> <route>   →   <OperationType>
Entity:      <EntityName>
Repository:  <RepositoryName>

Request fields:
  - <field>: <type>   (<required|optional>)
  ...

Response fields:
  - <field>: <type>
  ...

Validations I will implement:
  1. <validation rule>
  2. <validation rule>
  ...

External field validations (requires calling another service):
  - <FieldName> (<ExternalEntity> ID) — should this be validated against the <ExternalEntity> service?
  - <FieldName> (<ExternalEntity> ID) — should this be validated against the <ExternalEntity> service?
  ...

Does this look right? Any changes before I generate the code?
```

For the "External field validations" section: identify every request field whose name ends in `Id` or `Ids` and whose value would naturally reference an entity owned by a different service (e.g., `OwnerId`, `PatientId`, `DoctorId`, `ClinicId`). List each one and ask whether to validate it. Fields referencing entities within the **same** API (e.g., a foreign key within the same Cosmos container) do not need this treatment.

**Do not proceed** until the user confirms. If they request changes, update the summary and ask again.

---

## Step 4 — Create git worktree

Before touching any files, create an isolated git worktree so this skill can run in parallel with other instances working on the same repository.

From the root of the target repository:

```bash
# Derive a branch name from the PBI and operation
BRANCH="feature/pbi-<PBI_ID>-<entity-kebab>-<operation-kebab>"
# e.g. feature/pbi-1234-project-create

# Create the worktree as a sibling directory of the repo
REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")
WORKTREE_PATH="../${REPO_NAME}-pbi-<PBI_ID>"

git fetch origin main --quiet
git worktree add "$WORKTREE_PATH" -b "$BRANCH" origin/main
```

All exploration (Step 5) and code generation (Step 6) must happen **inside the worktree path** — never modify files in the original checkout.

At the end of Step 7, tell the user:
> "All changes are in the worktree at `<WORKTREE_PATH>` on branch `<BRANCH>`. Run `/atlas-azure-devops-pr` from that directory when you are ready to open a PR."

If the worktree already exists (e.g. a previous run), reuse it — do not fail.

---

## Step 5 — Explore the repository

Once confirmed, explore the target repository to understand the current state:

1. Locate the solution structure — find the `.sln` file
2. Identify the five Clean Architecture projects:
   - `*.WebApi` — endpoints live here
   - `*.Application.Contracts` — DTOs and service interfaces
   - `*.Application.Impl` — service implementations and validators
   - `*.Domain` — entities and repository interfaces
   - `*.Infrastructure` — repository implementations and DB models
3. Check if the **entity already exists** in Domain and Infrastructure — never recreate what's there
4. Check if the **service interface** already has the method — only add what's missing
5. Find the existing endpoint class for this entity (e.g., `PatientsEndpoints.cs`) — you will add to it, not create a new file unless none exists
6. Determine which **repository persistence pattern** the solution uses:
   - **Domain model directly**: the Infrastructure repository uses the domain entity in Cosmos calls (`ReadItemAsync<MyEntity>`) with `[JsonProperty]` annotations on the entity class itself — no DB model class exists
   - **Separate DB model**: a `*DbModel.cs` exists in `Infrastructure/DbModels/` with dedicated mapper extension methods
   - Check existing repositories in the solution to identify which pattern is in use. For new solutions with no existing repositories, default to the **domain model directly** pattern (simpler). Always follow whatever is already established in the solution.

### Visual Studio scaffold cleanup

While exploring the repository, check for default scaffold artifacts left from the project template:

- Any file whose name contains `Weather` (e.g., `WeatherForecastController.cs`, `WeatherForecast.cs`, endpoint registrations referencing `weather`)
- Any file named `Class1.cs` that contains only an empty class body

If any are found, ask the user:

> "I found default Visual Studio scaffold files that are probably not needed: `<list of files>`. Do you want me to delete them?"

- If **yes** — delete them and remove any related registrations in `Program.cs` or endpoint wiring. Include the deletions in Step 7's change summary.
- If **no** — leave them untouched and continue.

### Partition key (new repositories only)

If the `*Repository.cs` for this entity does **not yet exist**, determine the Cosmos DB partition key:

- Look for it in the PBI description or acceptance criteria
- If not found there, check if the entity's `Id` is a natural partition key (single-document-per-partition pattern, most common)
- If it still cannot be determined with confidence, ask the user:

  > "What should the partition key be for the `<Entity>` Cosmos DB container? (e.g., `/id`, `/tenantId`, `/patientId`)"

Once known, use it in the `ReadItemAsync`, `CreateItemAsync`, `ReplaceItemAsync`, and `DeleteItemAsync` calls in the repository implementation. Document it as a constant at the top of the repository class:

```csharp
private const string ContainerName = "<Entities>";
private const string PartitionKeyPath = "/id";   // confirmed with user
```

Skip this check entirely if the repository already exists — never change an existing partition key.

### External client NuGet lookup

For each external field the user confirmed should be validated (Step 3), find the corresponding client NuGet package before generating code. Follow this order:

1. **Search the current solution** — look for `<PackageReference Include="Atlas.*.Client"` in the `.csproj` files. If a package for the target entity is already referenced, use that name and version.

2. **Search across repos** — if not found locally, use:
   ```
   mcp__<ado>__search_code(searchText: "<EntityName>Client", filters: { fileExtension: "csproj" })
   ```
   Inspect the results to identify the package name (e.g., `Atlas.Patients.Client`) and the version used by other services.

3. **Ask the user** — if the package still cannot be found after both searches, present what you found and ask:
   > "I couldn't find a NuGet package for the `<EntityName>` client in the artifact feed. Do you know the package name, or should I skip this validation?"

Once found, note the package name and version — you will add it to the `*.Application.Impl.csproj` in Step 6.

### Event Grid provisioning check

Look for provisioning files in the repository (common locations: `infra/`, `provisioning/`, `deploy/`, `bicep/`, `terraform/`, or any `*.bicep` / `*.json` ARM / `*.tf` file at the root).

If provisioning files **are found** but there is no Event Grid topic configured for this API, ask the user:

> "I noticed there are provisioning files but no Event Grid topic is configured for this API. Do you want me to add the Event Grid topic resource to the provisioning files?"

- If **yes** — add the Event Grid topic resource following the conventions already present in the file (Bicep, ARM, or Terraform — match whatever format is in use). Include it in Step 7's change summary under a **Provisioning** section.
- If **no** — skip it and continue.

If no provisioning files are found at all, skip this check silently.

Use `Read` and `Bash` (find/grep) to explore locally. Use `mcp__<ado>__repo_list_directory` or `mcp__<ado>__repo_get_file_content` if the repo is only available remotely.

---

## Step 6 — Generate the code

Generate only what's missing or needs to be added. For each layer, **edit existing files** rather than creating new ones whenever possible.

Refer to `references/architecture.md` for the exact patterns, code templates, and conventions to follow.

### Layer generation order

Generate in this order so each layer builds on the previous:

1. **Domain** (`*.Domain`)
   - Add the entity class if it doesn't exist
   - Add any new method signatures to the repository interface

2. **Infrastructure** (`*.Infrastructure`)
   - Follow the persistence pattern identified in Step 5:
     - **Domain model directly**: add `[JsonProperty]` annotations to the domain entity if not already present; implement the repository using the domain type in all Cosmos calls; no DB model or mapper needed
     - **Separate DB model**: add the `*DbModel.cs` class with `[JsonPropertyName]` attributes and the mapper extension methods if they don't exist; use the DB model in all Cosmos calls and map at the boundary
   - Implement the new repository method

3. **Application.Contracts** (`*.Application.Contracts`)
   - Add request DTO (for Create/Update operations)
   - Add response DTO if a new shape is needed
   - Add the method signature to the service interface

4. **Application.Impl** (`*.Application.Impl`)
   - Implement the new service method
   - Add or update the FluentValidation validator (for Create/Update)
   - Call `Guard.GuardRequest(validator, request)` before any business logic
   - For each confirmed external validation:
     - Add `<PackageReference Include="<NuGet>" Version="<version>" />` to the `.Application.Impl.csproj`
     - Create a dedicated `<EntityName>IdValidator : AbstractValidator<string>` class in `Validators/`. It injects the client, uses `CustomAsync`, calls `client.Exists(id, ct)`, and catches `ApiException` with `HttpStatusCode.NotFound` to add a `ValidationFailure`
     - Wire it from the main request validator:
       - **Optional field** → `RuleFor(x => x.FieldId).SetValidator(new EntityIdValidator(client)!).When(x => !string.IsNullOrWhiteSpace(x.FieldId))`
       - **Conditionally required field** → `RuleFor(x => x.FieldId).MustAsync(FieldIdValidation!)` with an inline `MustAsync` method that checks the business condition, then delegates to `new EntityIdValidator(client).ValidateAsync(id, ct)` and propagates errors via `context.AddFailure`
     - Register the client in `ServiceCollectionExtensions.cs` using `AddClientFor<Name>Client(configuration).AddI<Name>Client()...`
     - See `references/architecture.md` Section 5 for the full code pattern

5. **WebApi** (`*.WebApi`)
   - Add the new endpoint to the existing `[Entity]Endpoints.cs`
   - Register telemetry tags for all route parameters and key request fields
   - Apply OpenAPI decoration (`.WithOpenApiGet/Post/Put/Delete`)
   - Open `ErrorHandling/StatusCodeMapper.cs` and add a mapping entry for every exception that the new repository or service method can throw and that is not already present in the switch. Common cases:
     - `EntityNotFoundException` → `HttpStatusCode.NotFound`
     - `EntityAlreadyExistsException` → `HttpStatusCode.Conflict`
     - `CosmosDbTooManyRequestsException` → `HttpStatusCode.TooManyRequests`
     - `ValidationException` → `HttpStatusCode.BadRequest`
   - Match the class style already in use (static or instance, `int` or `HttpStatusCode` return type — see `references/architecture.md` Section 11)

6. **Unit tests** (`tests/*.Application.UnitTest`)
   - Add test cases for the new service method to the existing `<Entity>ServiceTests.cs` (or create it if it doesn't exist)
   - Cover: happy path, validation failure (for Create/Update), not-found (for GetById/Update/Delete)
   - Use NSubstitute for mocks, FluentAssertions for assertions
   - Follow naming: `MethodName_ExpectedResult_WhenScenario`

7. **Component tests** (`tests/*.ComponentTest/<Entities>/`)
   - Create one test file per operation: e.g. `CreateTest.cs`, `GetByIdTest.cs`, `GetAllTest.cs`, `UpdateTest.cs`, `DeleteTest.cs`
   - Decorate each class with `[Collection("BaseFixtureCollection")]` and inject `BaseFixture` via the constructor
   - Resolve the client from the fixture: `fixture.TestServices.GetRequiredService<I<Entity>Client>()`
   - Cover: happy path against the real API, validation failure (for Create/Update), not-found (for GetById/Update/Delete)
   - Assert validation errors by catching `ValidationApiException` and deserializing with `GetContentAsAsync<ValidationProblemDetails>()` — verify that the expected field names appear in `errors`
   - If `BaseFixture` does not yet exist, create it following the pattern in `references/architecture.md` Section 14
   - If the `*.ComponentTest` project does not yet exist, create it with the NuGet packages listed in Section 14

8. **IoC tests** (`tests/*.WebApi.IoCTest`)
   - Only test the types that are **injected directly into the endpoint handlers** — i.e. the service interface (e.g. `I<Entity>Service`). Repositories, validators, and external clients are implementation details resolved transitively; do not add `[InlineData]` entries for them
   - The `*.WebApi.IoCTest` project likely already exists — find `IoCTests.cs` and add one `[InlineData(typeof(I<Entity>Service))]` entry if the entity is new
   - If the project does not yet exist, create it following the pattern in `references/architecture.md` Section 14
   - Any new external client URL added to `ServiceCollectionExtensions.cs` must still be present in the in-memory config overrides (so the container builds), but does not need its own `[InlineData]` entry

9. **Client** (`client/*.<ApiName>.Client`)
   - Add the new method signature to the existing `I<Entity>Client.cs` Refit interface (or create the interface if it doesn't exist)
   - Add request/response DTOs to the client project if the operation is Create or Update (client DTOs are independent of `Application.Contracts`)
   - If the client project itself doesn't exist yet, create the marker class, the interface, and the `.csproj` with `Atlas.Clients` and `Atlas.Clients.Generator` references

### What to include per operation

| Operation | Endpoint  | Request DTO            | Response DTO        | Validator | Unit tests                           | Component tests                        | Client method |
|-----------|-----------|------------------------|---------------------|-----------|--------------------------------------|----------------------------------------|---------------|
| List      | MapGet    | —                      | `EntityResponse[]`  | —         | happy path                           | happy path (returns array)             | `GetAll`      |
| GetById   | MapGet    | —                      | `EntityResponse`    | —         | happy path + not found               | happy path + not found (404)           | `Get`         |
| Create    | MapPost   | `EntityCreateRequest`  | `CreatedResponse`   | Yes       | happy path + validation failure      | happy path + validation failure (400)  | `Create`      |
| Update    | MapPut    | `EntityRequest`        | —                   | Yes       | happy path + validation + not found  | happy path + validation (400) + not found (404) | `Update` |
| Delete    | MapDelete | —                      | —                   | —         | happy path + not found               | happy path + not found (404)           | `Delete`      |

### Naming conventions

- Endpoint operation IDs: `"<verb>-<entity-kebab>"` e.g. `"create-patient"`, `"get-appointment"`
- Display names: `"<Verb>-<Entity>"` e.g. `"Create-Patient"`, `"Get-Appointment"`
- Route parameters: lowercase kebab-case, e.g. `{id}`, `{patientId}`
- DTO properties: PascalCase
- Validator class: `<Entity><Operation>RequestValidator` e.g. `PatientCreateRequestValidator`

---

## Step 7 — Present the result

After generating all code:

1. Show a summary of every file created or modified, grouped by layer
2. If any file needs a NuGet package that isn't already referenced, list it
3. If the `Program.cs` needs a new DI registration call, show it
4. Ask: "Shall I apply these changes to the repository, or would you like to review them first?"

---

## Error handling to follow

The architecture uses **exception-based** error handling — never use Result<T> or return error objects from service methods. Throw domain exceptions; they are caught and mapped to HTTP status codes by `ErrorHandlerMiddleware`:

- `EntityNotFoundException` → 404
- `ValidationException` (FluentValidation) → 400 with `ValidationProblemDetails`
- Unhandled exceptions → 500

Do not add try/catch blocks in endpoints or service methods unless you have a specific, documented reason.

---

## Architecture reference

For detailed code patterns and templates for each layer, read:

→ `references/architecture.md`

Table of contents:
- Project structure diagram
- Endpoint registration pattern
- Service interface and implementation
- Repository interface and implementation
- FluentValidation patterns
- DTO patterns (Request/Response)
- DB model and mapper patterns
- Telemetry tagging
- OpenAPI decoration helpers
- Unit tests (xUnit · NSubstitute · FluentAssertions)
- Component tests (`BaseFixture`, `WebApplicationFactory`, real Cosmos DB)
- IoC tests (`*.WebApi.IoCTest`, DI container verification)
- Client project (Refit, `Atlas.Clients`, `Atlas.Clients.Generator`)
- FluentValidation patterns incl. external entity validation with `MustAsync`
