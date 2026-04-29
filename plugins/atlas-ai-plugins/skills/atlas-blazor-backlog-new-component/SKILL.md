---
name: atlas-blazor-backlog-new-component
description: "Generate an Azure DevOps backlog for adding a new reusable Blazor component (not a full page) to a Blazor application. Use this skill whenever the user wants a new component, shared widget, or UI building block — phrases like 'create a component for X', 'add a shared Y component', 'build a Z widget', 'nuevo componente para W'. Adjusts PBI count based on whether backend data is required."
version: 1.0.0
---

# atlas-blazor-new-component

## Purpose

Generate a structured Azure DevOps backlog for adding a new reusable Blazor component to an existing module or to the shared library (`{AppNamespace}.Shared`) in `{AppNamespace}`.

The PBI set adapts based on whether the component needs backend data:

- **No backend data** → 2 PBIs (component + integration)
- **With backend data** → 5 PBIs (mock component + BFF endpoint + service + DI + wire to service)

Produces: **EPIC (optional) → Feature → 2–5 PBIs**.

After collecting inputs, renders a full preview tree and waits for explicit user approval before creating any item.

---

## Autonomy Rules

Act without asking:
- Write all work item titles and descriptions in **English**
- Ask upfront whether the component needs backend data — do not assume
- If backend data is needed, always generate the full 5-PBI BFF flow
- Propose `[Parameter]` inputs and `EventCallback` outputs from context; confirm before proceeding
- Mark BFF PBI clearly so the backend team knows it belongs to them
- Use MCP exclusively; attempt auto-install if not available

Stop and ask only if:
- Component name or target module are missing — ask all at once
- **Never assume** Azure DevOps organization or project
- Backend data requirement not stated — ask
- Component parameters not specified — ask or propose and confirm
- User rejects or edits the preview — re-render before creating anything

---

## Step 1 — Collect inputs

Check the user's message for the following fields. Ask for everything missing in a **single message**.

**Required inputs:**

| Input | Behavior if absent |
|-------|--------------------|
| Component name (e.g. `ResourceCard`) | Ask |
| Target module (e.g. `{AppNamespace}.Resources`) or `Shared` | Ask |
| `[Parameter]` inputs and `EventCallback` outputs | Ask — or propose from context and confirm |
| Does it need backend data? (yes / no) | Ask |
| If yes: data description (what data, from which entity/BFF) | Ask |
| Consuming page or component (where it will be used) | Ask |
| EPIC decision | Ask — (a) create new, (b) link existing (ID), (c) skip |
| Feature name | Ask — suggested default: `{ComponentName} Component` |
| Azure DevOps organization | Ask — **never assume** |
| Azure DevOps project | Ask — **never assume** |

If multiple inputs are missing:

```
To generate the backlog I need a few details:

1. What is the component name? (e.g. "ResourceCard", "TaskBadge")
2. Which module will it live in? Or should it go in the Shared library?
3. What [Parameter] inputs does it receive? What EventCallback outputs does it emit?
   — I can propose these from context if you prefer.
4. Does the component need to fetch data from the backend? (yes / no)
   — If yes: what data does it need and from which entity or BFF?
5. Where will this component be used? (page or parent component name)
6. EPIC: (a) create a new EPIC, (b) link to existing EPIC — tell me the ID, or (c) skip?
7. Feature name — suggested: "{ComponentName} Component". Keep it or change it?
8. Azure DevOps organization and project. (e.g. org: "myorg", project: "My Project")
```

Wait for the reply before continuing.

---

## Step 2 — Build item tree in memory

### EPIC (if creating)

- **Type**: `Epic`
- **Title**: user-supplied or default `{ModuleName} — {ComponentName}`
- **Description**: `Top-level initiative for the {ComponentName} component in the {ModuleName} module.`

### Feature

- **Type**: `Feature`
- **Title**: user-supplied Feature name
- **Parent**: EPIC (if exists)
- **Description** (no backend): `Implements the reusable {ComponentName} Blazor component in {ModuleName} with configurable parameters and event callbacks.`
- **Description** (with backend): `Implements the reusable {ComponentName} Blazor component in {ModuleName}, including BFF data integration via a dedicated service layer.`

### PBI set — no backend data (2 PBIs)

1. `[{ModuleName}] Create {ComponentName} component`
2. `[{ModuleName}] Integrate {ComponentName} into {ConsumingPage}`

### PBI set — with backend data (5 PBIs)

1. `[{ModuleName}] Create {ComponentName} component with mock data`
2. `[{ModuleName}] Define BFF endpoint for {ComponentName} data` *(BFF — backend team)*
3. `[{ModuleName}] Create I{ComponentName}DataService and {ComponentName}DataService`
4. `[{ModuleName}] Register {ComponentName}DataService in DI`
5. `[{ModuleName}] Wire {ComponentName} to I{ComponentName}DataService (replace mock data)`

---

## Step 3 — Render preview tree

**No backend data:**
```
Backlog preview — please review before creation
================================================

EPIC [NEW]  {EpicTitle}
└── Feature  {FeatureName}
    ├── PBI  [{ModuleName}] Create {ComponentName} component
    └── PBI  [{ModuleName}] Integrate {ComponentName} into {ConsumingPage}

Total: 1 EPIC  |  1 Feature  |  2 PBIs
Org: {Organization}  |  Project: {Project}

Shall I create these items in Azure DevOps? (yes / no / edit)
```

**With backend data:**
```
Backlog preview — please review before creation
================================================

EPIC [NEW]  {EpicTitle}
└── Feature  {FeatureName}
    ├── PBI  [{ModuleName}] Create {ComponentName} component with mock data
    ├── PBI  [{ModuleName}] Define BFF endpoint for {ComponentName} data   ← BFF — backend team
    ├── PBI  [{ModuleName}] Create I{ComponentName}DataService and {ComponentName}DataService
    ├── PBI  [{ModuleName}] Register {ComponentName}DataService in DI
    └── PBI  [{ModuleName}] Wire {ComponentName} to I{ComponentName}DataService (replace mock data)

Total: 1 EPIC  |  1 Feature  |  5 PBIs
Org: {Organization}  |  Project: {Project}

Shall I create these items in Azure DevOps? (yes / no / edit)
```

If the user answers `edit`, apply changes in memory and re-render. Do **not** create any item until the user explicitly answers `yes`.

---

## Step 4 — Verify MCP availability

1. Call `mcp__azure-devops__core_list_projects(organization: "{Organization}")`.
2. If unavailable, attempt auto-install:
   ```bash
   claude mcp add --scope user azure-devops -- npx -y @azure-devops/mcp {Organization}
   ```
   Retry once. If still unavailable, stop and report.

---

## Step 5 — Create items in Azure DevOps

Create in strict top-down order. Store each returned `id` for parent linking.

```
mcp__azure-devops__wit_create_work_item(
  organization: "{Organization}",
  project: "{Project}",
  type: "Epic" | "Feature" | "Product Backlog Item",
  title: "<title>",
  description: "<description from template>",
)
```

Link child → parent:

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

---

## Step 6 — Output summary

```
=== blazor-new-component-summary ===
org: {Organization}
project: {Project}
component: {ComponentName}
module: {ModuleName}
backend_data: yes | no
status: success

feature:
  id: {featureId}
  url: https://dev.azure.com/{Organization}/{Project-URL-encoded}/_workitems/edit/{featureId}
  pbis:
    - id: {id}  title: [{ModuleName}] Create {ComponentName} component (with mock data)
    - id: {id}  title: [{ModuleName}] Define BFF endpoint for {ComponentName} data      ← if backend
    - id: {id}  title: [{ModuleName}] Create I{ComponentName}DataService and {ComponentName}DataService  ← if backend
    - id: {id}  title: [{ModuleName}] Register {ComponentName}DataService in DI         ← if backend
    - id: {id}  title: [{ModuleName}] Wire {ComponentName} to I{ComponentName}DataService  ← if backend
    - id: {id}  title: [{ModuleName}] Integrate {ComponentName} into {ConsumingPage}    ← if no backend

items_created: {n}
=== end ===
```

---

## Failure Handling

| Situation | Action |
|-----------|--------|
| Component name or module missing | Ask all at once |
| Backend data requirement not stated | Ask |
| Parameters/callbacks not specified | Propose from context and confirm |
| MCP server not installed | Auto-install; retry once; stop if still unavailable |
| MCP returns 401/403 | Report auth failure; stop |
| User answers "no" | Ask what to change; re-render |
| User answers "edit" | Apply change; re-render |
| Parent linking fails | Report orphaned item ID; provide manual linking instructions |

---

## PBI Description Templates

### Create component (no backend data)

```markdown
## Goal
Create the reusable `{ComponentName}` Blazor component in the `{ModuleName}` module.

## Tasks

### Component structure
- `Components/{ComponentName}/{ComponentName}.razor`
- `Components/{ComponentName}/{ComponentName}.razor.cs` using primary constructor injection

### Parameters and callbacks
```csharp
// Parameters received by this component:
{parameter_list}

// Event callbacks emitted by this component:
{callback_list}
```

### Localization
- Add any display strings to `Resources/{ComponentName}.resx` (and `.es.resx`)
- Inject `IStringLocalizer<{ComponentName}>` in the code-behind

## Acceptance Criteria
- [ ] Component renders correctly when used in `{ConsumingPage}`
- [ ] All `[Parameter]` inputs control the rendered output
- [ ] All `EventCallback` outputs fire at the right times
- [ ] Component compiles with zero errors and zero warnings
```

---

### Integrate component into consuming page

```markdown
## Goal
Add `{ComponentName}` to `{ConsumingPage}`.

## Tasks
- Add `@using {ModuleName}.Components.{ComponentName}` (or confirm it is in `_Imports.razor`)
- Add `<{ComponentName} {parameter_bindings} />` to the appropriate location in `{ConsumingPage}.razor`
- Pass correct values for all required parameters
- Wire `EventCallback` outputs to handler methods in `{ConsumingPage}.razor.cs`

## Acceptance Criteria
- [ ] `{ComponentName}` renders in `{ConsumingPage}` with real parameter values
- [ ] All event callbacks are handled correctly
- [ ] No compiler errors or warnings introduced
```

---

### Create component with mock data (with backend)

```markdown
## Goal
Create the `{ComponentName}` Blazor component displaying mock data while the BFF endpoint is not yet available.

## Tasks
- `Components/{ComponentName}/{ComponentName}.razor` + `.razor.cs`
- Declare all `[Parameter]` inputs and `EventCallback` outputs
- In `OnInitializedAsync`, populate `_data` with a hardcoded mock `List<{DataModel}>` (3–5 items)
- Render the mock data in the component template

## Acceptance Criteria
- [ ] Component renders with mock data
- [ ] Loading state is displayed while `_loading = true`
- [ ] Component compiles with zero errors and zero warnings
```

---

### Define BFF endpoint for component data

```markdown
## Goal
Define and implement the BFF endpoint that provides data to `{ComponentName}`.

## Note
This PBI belongs to the **backend / BFF team**. `{ComponentName}` uses mock data until this endpoint is ready.

## Tasks
- Define `{ComponentName}DataResponse` model in the BFF contracts
- Implement `GET /api/{resource}` (or appropriate endpoint) returning `{ComponentName}DataResponse`
- Update BFF client NuGet package with the new method

## Acceptance Criteria
- [ ] Endpoint returns `200 OK` with the expected JSON structure
- [ ] BFF client NuGet package is updated and published
- [ ] Swagger/OpenAPI documents the endpoint
```

---

### Create service interface and implementation (with backend)

```markdown
## Goal
Create the service layer in `{ModuleName}` that provides data to `{ComponentName}`.

## Tasks

### Service contract (`Services/Contracts/I{ComponentName}DataService.cs`)
```csharp
public interface I{ComponentName}DataService
{
    Task<{DataModel}[]> Get{ComponentName}Data(/* parameters */);
}
```

### Implementation (`Services/Impl/{ComponentName}DataService.cs`)
```csharp
public class {ComponentName}DataService(I{Resource}BffClient bffClient) : I{ComponentName}DataService
{
    public async Task<{DataModel}[]> Get{ComponentName}Data(/* parameters */)
    {
        var response = await bffClient.Get{ComponentName}Data(/* params */);
        return response.Select(r => r.To{DataModel}()).ToArray();
    }
}
```

## Acceptance Criteria
- [ ] Interface and implementation exist in the correct folders
- [ ] Mapping from BFF response to `{DataModel}` is correct
- [ ] Service compiles with zero errors
```

---

### Register service in DI (with backend)

```markdown
## Goal
Register `I{ComponentName}DataService` in the DI container.

## Tasks
- In `{ModuleName}/Extensions/ServiceCollectionExtensions.cs`:
  ```csharp
  services.AddSingleton<I{ComponentName}DataService, {ComponentName}DataService>();
  ```
- In `{AppNamespace}.App/Extensions/ServiceCollectionExtensions.cs`, register the BFF client

## Acceptance Criteria
- [ ] `I{ComponentName}DataService` resolves from the DI container
- [ ] `IoCTest` passes with the new registration
```

---

### Wire component to service (replace mock data)

```markdown
## Goal
Replace mock data in `{ComponentName}` with a real call to `I{ComponentName}DataService`.

## Tasks
- Inject `I{ComponentName}DataService` via primary constructor
- In `OnInitializedAsync`, replace the mock list with:
  ```csharp
  _data = await dataService.Get{ComponentName}Data(/* params */);
  ```
- Handle exceptions: show an error state if the call fails
- Remove mock data and any `TODO` comments

## Acceptance Criteria
- [ ] Component displays real data from the BFF
- [ ] Error state is displayed if the service call fails
- [ ] No hardcoded mock data remains
```
