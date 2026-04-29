---
name: atlas-blazor-backlog-grid-page
description: "Generate an Azure DevOps backlog for adding a data grid listing page to a Blazor module. Use this skill whenever the user wants to add a grid, list, or table page — phrases like 'add a grid for X', 'create a list page for Y', 'show TelerikGrid with Z data', 'listing screen for W'. Always generates the full mock-data → BFF endpoint → real integration flow."
version: 1.0.0
---

# atlas-blazor-grid-page

## Purpose

Generate a structured Azure DevOps backlog for adding a data grid listing page to an existing module in `{AppNamespace}`.

The application uses **TelerikGrid** with `GridFilterMode.FilterMenu`, shared filter components from `{AppNamespace}.Shared/Components/Grid/`, and a **BFF pattern** where data flows through a service layer (`I{Entity}Service` → `{Entity}Service` → BFF client).

The backlog always covers the full development flow:

1. UI with mock data (start working immediately)
2. BFF endpoint definition and implementation (backend team)
3. Service layer in UI + DI registration
4. Replace mock data with real service

Produces: **EPIC (optional) → Feature → 6 PBIs**.

After collecting inputs, renders a full preview tree and waits for explicit user approval before creating any item.

---

## Autonomy Rules

Act without asking:
- Write all work item titles and descriptions in **English**
- Always generate all 6 PBIs — never skip the BFF PBIs even if the user only describes the UI
- Propose a column list derived from the entity name and context; confirm before proceeding
- Mark the BFF PBI clearly so the backend team knows it belongs to them
- Use MCP exclusively; attempt auto-install if not available

Stop and ask only if:
- Entity name, module, or column list are missing — ask all at once
- **Never assume** Azure DevOps organization or project
- BFF endpoint existence is unclear — ask: does the endpoint already exist or needs to be created?
- User rejects or edits the preview — re-render before creating anything

---

## Step 1 — Collect inputs

Check the user's message for the following fields. Ask for everything missing in a **single message**.

**Required inputs:**

| Input | Behavior if absent |
|-------|--------------------|
| Entity name (e.g. `Project`) | Ask |
| Module name (e.g. `{AppNamespace}.Projects`) | Ask |
| Column list (name + type) | Ask — or propose from context and confirm |
| Filters needed? (yes / no; types: text, checkbox list, date range, numeric) | Ask |
| Column visibility toggle needed? (yes / no) | Ask |
| BFF endpoint status | Ask — (a) needs to be created, (b) already exists |
| EPIC decision | Ask — (a) create new, (b) link existing (ID), (c) skip |
| Feature name | Ask — suggested default: `{EntityName} Listing` |
| Azure DevOps organization | Ask — **never assume** |
| Azure DevOps project | Ask — **never assume** |

If multiple inputs are missing:

```
To generate the backlog I need a few details:

1. What entity (or resource) will the grid display? (e.g. "Project", "Customer", "Resource")
2. Which module does it belong to? (e.g. "{AppNamespace}.Projects")
3. What columns should the grid show? (e.g. "Name (text), Status (text), Active (boolean)")
   — I can propose columns from context if you prefer.
4. Do you need column filters? If yes, which types: text search, checkbox list, date range, numeric range?
5. Do you need a column visibility toggle (show/hide columns)?
6. Does the BFF endpoint for this data already exist, or does it need to be created?
7. EPIC: (a) create a new EPIC, (b) link to existing EPIC — tell me the ID, or (c) skip?
8. Feature name — suggested: "{EntityName} Listing". Keep it or change it?
9. Azure DevOps organization and project. (e.g. org: "myorg", project: "My Project")
```

Wait for the reply before continuing.

---

## Step 1b — Validate naming coherence

Check that the entity name, module name, and feature name are consistent. If a mismatch is found, present it and wait for confirmation before proceeding.

---

## Step 2 — Build item tree in memory

### EPIC (if creating)

- **Type**: `Epic`
- **Title**: user-supplied or default `{ModuleName} — {EntityName} Management`
- **Description**: `Top-level initiative for {EntityName} management in the {ModuleName} Blazor module.`

### Feature

- **Type**: `Feature`
- **Title**: user-supplied Feature name
- **Parent**: EPIC (if exists)
- **Description**: `Implements the {EntityName} listing grid page in {ModuleName}, including TelerikGrid with filters, the service layer, and BFF integration.`

### PBI set (6 PBIs)

1. `[{ModuleName}] Create {EntityName} listing page with TelerikGrid (mock data)`
2. `[{ModuleName}] Add column filters and visibility to {EntityName} grid`  ← omit if no filters and no visibility toggle
3. `[{ModuleName}] Define BFF endpoint GET /api/{resource}` *(BFF — backend team)*  ← omit if endpoint already exists
4. `[{ModuleName}] Create I{EntityName}Service and {EntityName}Service in UI`
5. `[{ModuleName}] Register {EntityName}Service in DI`
6. `[{ModuleName}] Wire {EntityName} grid to I{EntityName}Service (replace mock data)`

Adjust total count based on omitted optional PBIs.

---

## Step 3 — Render preview tree

```
Backlog preview — please review before creation
================================================

EPIC [NEW]  {EpicTitle}
└── Feature  {FeatureName}
    ├── PBI  [{ModuleName}] Create {EntityName} listing page with TelerikGrid (mock data)
    ├── PBI  [{ModuleName}] Add column filters and visibility to {EntityName} grid    ← if filters/visibility
    ├── PBI  [{ModuleName}] Define BFF endpoint GET /api/{resource}   ← BFF — backend team; omit if exists
    ├── PBI  [{ModuleName}] Create I{EntityName}Service and {EntityName}Service in UI
    ├── PBI  [{ModuleName}] Register {EntityName}Service in DI
    └── PBI  [{ModuleName}] Wire {EntityName} grid to I{EntityName}Service (replace mock data)

Total: 1 EPIC  |  1 Feature  |  {n} PBIs
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
=== blazor-grid-page-summary ===
org: {Organization}
project: {Project}
entity: {EntityName}
module: {ModuleName}
status: success

epic:
  id: {epicId}
  url: https://dev.azure.com/{Organization}/{Project-URL-encoded}/_workitems/edit/{epicId}

feature:
  id: {featureId}
  url: https://dev.azure.com/{Organization}/{Project-URL-encoded}/_workitems/edit/{featureId}
  pbis:
    - id: {id}  title: [{ModuleName}] Create {EntityName} listing page with TelerikGrid (mock data)
    - id: {id}  title: [{ModuleName}] Add column filters and visibility to {EntityName} grid
    - id: {id}  title: [{ModuleName}] Define BFF endpoint GET /api/{resource}
    - id: {id}  title: [{ModuleName}] Create I{EntityName}Service and {EntityName}Service in UI
    - id: {id}  title: [{ModuleName}] Register {EntityName}Service in DI
    - id: {id}  title: [{ModuleName}] Wire {EntityName} grid to I{EntityName}Service (replace mock data)

items_created: {n}
=== end ===
```

---

## Failure Handling

| Situation | Action |
|-----------|--------|
| Entity name, module, or columns missing | Ask all at once |
| BFF endpoint status unclear | Ask whether it exists or needs to be created |
| MCP server not installed | Auto-install; retry once; stop if still unavailable |
| MCP returns 401/403 | Report auth failure; stop |
| User answers "no" | Ask what to change; re-render |
| User answers "edit" | Apply change; re-render |
| Parent linking fails | Report orphaned item ID; provide manual linking instructions |

---

## PBI Description Templates

### Create listing page with TelerikGrid (mock data)

```markdown
## Goal
Create the `{EntityName}View` Blazor page in `{ModuleName}` displaying a `TelerikGrid` with mock data.

## Tasks

### Component structure
- `Components/{EntityName}View.razor` with `@page "{route}"`
- `Components/{EntityName}View.razor.cs` as `partial class {EntityName}View` using primary constructor injection
- `Models/{EntityName}Model.cs` — POCO with properties: {column_list}
- `Resources/{EntityName}View.resx` (and `.es.resx`) with column header localization keys

### TelerikGrid setup
```razor
<TelerikGrid @ref="_grid"
             Data="@_data"
             Pageable="true" @bind-PageSize="@_pageSize"
             Sortable="true"
             FilterMode="GridFilterMode.FilterMenu"
             Class="app-grid">
    <GridColumns>
        <!-- one GridColumn per property, Title from IStringLocalizer -->
    </GridColumns>
</TelerikGrid>
```

### States
- Loading: show `<TableSkeleton>` while `_loading = true`
- No results: show `<GridNoResults>` when data is empty
- Error: show `<GridLoadError>` and set `_loadError = true`

### Mock data
Populate `_data` in `OnInitializedAsync` with a hardcoded `List<{EntityName}Model>` (3–5 items).

## Acceptance Criteria
- [ ] Page renders at `{route}` with mock data in the grid
- [ ] Loading, no-results, and error states are displayed correctly
- [ ] All column headers are localized
- [ ] Grid is sortable and pageable
- [ ] Component compiles with zero errors and zero warnings
```

---

### Add column filters and visibility

```markdown
## Goal
Add column filters and a visibility toggle to the `{EntityName}` grid.

## Tasks

### Filter components
Use shared filter components from `{AppNamespace}.Shared/Components/Grid/`:
- Text columns → `<GridFilterText>` inside `<FilterMenuTemplate>`
- Boolean/enum columns → `<GridFilterCheckboxList>` or `<GridFilterRadio>`
- Date columns → `<GridFilterDate>`
- Numeric columns → `<GridFilterNumber>`

Create a `{EntityName}FilterModel` in `Models/` to hold the current filter state.

### Column visibility (if requested)
- Add `<GridColumnsVisibility>` component to the grid toolbar
- Define a `{EntityName}ColumnsVisibilityModel` to persist visibility state per column

## Acceptance Criteria
- [ ] Each column with a filter shows the correct filter control in the header menu
- [ ] Filters narrow the grid results correctly with mock data
- [ ] Column visibility toggle shows/hides columns without breaking the grid
- [ ] Filter and visibility state survives a page re-render within the same session
```

---

### Define BFF endpoint GET /api/{resource}

```markdown
## Goal
Define and implement the BFF endpoint that provides `{EntityName}` list data to the UI.

## Note
This PBI belongs to the **backend / BFF team**. The UI grid uses mock data until this endpoint is ready.

## Tasks
- Define `Get{EntityName}sResponse` and `{EntityName}ItemResponse` models in the BFF contracts
- Implement `GET /api/{resource}` endpoint returning `IEnumerable<{EntityName}ItemResponse>`
- Expose the endpoint via the BFF client NuGet package (`I{EntityName}sBffClient`)
- Document query parameters if filtering is server-side

## Acceptance Criteria
- [ ] `GET /api/{resource}` returns `200 OK` with a JSON array
- [ ] Returns empty array (not `404`) when there are no items
- [ ] BFF client NuGet package is updated and published
- [ ] Swagger/OpenAPI documents the endpoint
```

---

### Create service interface and implementation

```markdown
## Goal
Create the service layer in `{ModuleName}` that abstracts the BFF call for `{EntityName}` data.

## Tasks

### Service contract
`Services/Contracts/I{EntityName}Service.cs`:
```csharp
public interface I{EntityName}Service
{
    Task<{EntityName}Model[]> GetAll{EntityName}s();
}
```

### Service implementation
`Services/Impl/{EntityName}Service.cs`:
```csharp
public class {EntityName}Service(I{EntityName}sBffClient bffClient) : I{EntityName}Service
{
    public async Task<{EntityName}Model[]> GetAll{EntityName}s()
    {
        var response = await bffClient.GetAll{EntityName}s();
        return response.Select(r => r.To{EntityName}Model()).ToArray();
    }
}
```

- Add `To{EntityName}Model()` mapping extension in `Models/{EntityName}ModelExtensions.cs`

## Acceptance Criteria
- [ ] `I{EntityName}Service` interface exists in `Services/Contracts/`
- [ ] `{EntityName}Service` implementation exists in `Services/Impl/`
- [ ] Mapping from BFF response to `{EntityName}Model` is correct
- [ ] Service compiles with zero errors
```

---

### Register service in DI

```markdown
## Goal
Register `I{EntityName}Service` / `{EntityName}Service` in the DI container.

## Tasks

### Module registration
In `{ModuleName}/Extensions/ServiceCollectionExtensions.cs`, add:
```csharp
services.AddSingleton<I{EntityName}Service, {EntityName}Service>();
```

### BFF client registration
In `{AppNamespace}.App/Extensions/ServiceCollectionExtensions.cs`, add the BFF client in the appropriate `AddClientFor*` chain:
```csharp
.AddI{EntityName}sBffClient()
```

## Acceptance Criteria
- [ ] `I{EntityName}Service` resolves from the DI container
- [ ] `IoCTest` passes with the new registration
- [ ] BFF client is registered with the correct HTTP message handlers (audit, JWT, culture)
```

---

### Wire grid to service (replace mock data)

```markdown
## Goal
Replace the mock data in `{EntityName}View` with a real call to `I{EntityName}Service`.

## Tasks
- Inject `I{EntityName}Service` in `{EntityName}View.razor.cs` via primary constructor
- In `OnInitializedAsync`, replace the hardcoded mock list with:
  ```csharp
  _data = await {entityService}.GetAll{EntityName}s();
  ```
- Handle exceptions: catch and set `_loadError = true` to show `<GridLoadError>`
- Remove mock data and any `TODO` comments

## Acceptance Criteria
- [ ] Grid displays real data from the BFF
- [ ] Error state is shown if the BFF call fails
- [ ] No hardcoded mock data remains in the component
- [ ] Existing loading and no-results states still work correctly
```
