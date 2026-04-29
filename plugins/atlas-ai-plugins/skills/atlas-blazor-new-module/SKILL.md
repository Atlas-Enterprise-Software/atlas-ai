---
name: atlas-blazor-new-module
description: "Generate an Azure DevOps backlog for creating a completely new feature module in a Blazor application. Use this skill whenever the user wants to create a new module, scaffold a new section, or start a new feature area from scratch — phrases like 'create a new module for X', 'scaffold the Y module', 'start the Z section from scratch', 'nuevo módulo para W'. After scaffolding, use atlas-blazor-grid-page or atlas-blazor-side-panel-editor to add feature PBIs."
version: 1.0.0
---

# atlas-blazor-new-module

## Purpose

Generate a structured Azure DevOps backlog for creating a completely new feature module in `{AppNamespace}`.

The application has independent feature modules following the convention `{AppNamespace}.{ModuleName}`. Each module is a .NET class library project that:
- Registers its own services in DI via `Extensions/ServiceCollectionExtensions.cs`
- Registers its assembly for Blazor routing in `AdditionalAssemblies.cs`
- Contains its own Razor components, services, models, and resources

This skill generates the scaffolding backlog only. For subsequent feature work (grids, editors, components), use `atlas-blazor-grid-page`, `atlas-blazor-side-panel-editor`, or `atlas-blazor-new-component`.

Produces: **EPIC (optional) → Feature → 4–5 PBIs**.

After collecting inputs, renders a full preview tree and waits for explicit user approval before creating any item.

---

## Autonomy Rules

Act without asking:
- Write all work item titles and descriptions in **English**
- Use `{AppNamespace}.{ModuleName}` as the project naming convention — always
- Always generate the full 4 scaffolding PBIs; add the sidebar PBI only if requested
- After the preview is approved and items are created, suggest the next step: "Use `atlas-blazor-grid-page` or `atlas-blazor-side-panel-editor` to add feature PBIs to this module."
- Use MCP exclusively; attempt auto-install if not available

Stop and ask only if:
- Module name, app namespace, or purpose are missing — ask all at once
- **Never assume** Azure DevOps organization or project
- Sidebar requirement not stated — ask
- User rejects or edits the preview — re-render before creating anything

---

## Step 1 — Collect inputs

Check the user's message for the following fields. Ask for everything missing in a **single message**.

**Required inputs:**

| Input | Behavior if absent |
|-------|--------------------|
| Application namespace (e.g. `MyApp`) | Ask — root prefix used as `{AppNamespace}.{ModuleName}` |
| Module name (e.g. `Projects`) | Ask |
| Short description of module purpose | Ask |
| Does it need a sidebar menu entry? (yes / no) | Ask |
| EPIC decision | Ask — (a) create new, (b) link existing (ID), (c) skip |
| Feature name | Ask — suggested default: `{ModuleName} Module Scaffolding` |
| Azure DevOps organization | Ask — **never assume** |
| Azure DevOps project | Ask — **never assume** |

If multiple inputs are missing:

```
To generate the backlog I need a few details:

1. What is the application namespace? (e.g. "MyApp")
   — Used as the root prefix: {AppNamespace}.{ModuleName}.
2. What is the module name? (e.g. "Projects", "Reports", "Billing")
   — The project will be named {AppNamespace}.{ModuleName}.
3. Briefly describe what this module will do. (Helps name the EPIC and feature correctly.)
4. Does it need a sidebar navigation entry? (yes / no)
5. EPIC: (a) create a new EPIC, (b) link to existing EPIC — tell me the ID, or (c) skip?
6. Feature name — suggested: "{ModuleName} Module Scaffolding". Keep it or change it?
7. Azure DevOps organization and project. (e.g. org: "myorg", project: "My Project")
```

Wait for the reply before continuing.

---

## Step 2 — Build item tree in memory

### EPIC (if creating)

- **Type**: `Epic`
- **Title**: user-supplied or default `{ModuleName} — New Module`
- **Description**: `Top-level initiative for the {ModuleName} feature module in {AppNamespace}. {ModuleDescription}`

### Feature

- **Type**: `Feature`
- **Title**: user-supplied Feature name
- **Parent**: EPIC (if exists)
- **Description**: `Scaffolds the {AppNamespace}.{ModuleName} project: folder structure, DI registration, assembly routing, main view, and sidebar entry.`

### PBI set

Always included:

1. `[{AppNamespace}.{ModuleName}] Create module project and folder structure`
2. `[{AppNamespace}.{ModuleName}] Register module assembly in AdditionalAssemblies`
3. `[{AppNamespace}.{ModuleName}] Create ServiceCollectionExtensions and register module in WebApp DI`
4. `[{AppNamespace}.{ModuleName}] Create {ModuleName}View main page`

Optional (if sidebar = yes):

5. `[{AppNamespace}.{ModuleName}] Add {ModuleName} entry to sidebar navigation`

---

## Step 3 — Render preview tree

```
Backlog preview — please review before creation
================================================

EPIC [NEW]  {EpicTitle}
└── Feature  {FeatureName}
    ├── PBI  [{AppNamespace}.{ModuleName}] Create module project and folder structure
    ├── PBI  [{AppNamespace}.{ModuleName}] Register module assembly in AdditionalAssemblies
    ├── PBI  [{AppNamespace}.{ModuleName}] Create ServiceCollectionExtensions and register module in WebApp DI
    ├── PBI  [{AppNamespace}.{ModuleName}] Create {ModuleName}View main page
    └── PBI  [{AppNamespace}.{ModuleName}] Add {ModuleName} entry to sidebar navigation  ← if sidebar = yes

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
=== blazor-new-module-summary ===
org: {Organization}
project: {Project}
module: {AppNamespace}.{ModuleName}
status: success

epic:
  id: {epicId}
  url: https://dev.azure.com/{Organization}/{Project-URL-encoded}/_workitems/edit/{epicId}

feature:
  id: {featureId}
  url: https://dev.azure.com/{Organization}/{Project-URL-encoded}/_workitems/edit/{featureId}
  pbis:
    - id: {id}  title: [{AppNamespace}.{ModuleName}] Create module project and folder structure
    - id: {id}  title: [{AppNamespace}.{ModuleName}] Register module assembly in AdditionalAssemblies
    - id: {id}  title: [{AppNamespace}.{ModuleName}] Create ServiceCollectionExtensions and register module in WebApp DI
    - id: {id}  title: [{AppNamespace}.{ModuleName}] Create {ModuleName}View main page
    - id: {id}  title: [{AppNamespace}.{ModuleName}] Add {ModuleName} entry to sidebar navigation  ← if created

items_created: {n}

next_steps: >
  Module scaffolding is complete. To add feature PBIs (grids, editors, components) to this module, use:
  - atlas-blazor-grid-page — for data listing pages with TelerikGrid
  - atlas-blazor-side-panel-editor — for create/edit side panel editors
  - atlas-blazor-new-component — for reusable components
=== end ===
```

---

## Failure Handling

| Situation | Action |
|-----------|--------|
| Module name, app namespace, or purpose missing | Ask all at once |
| Sidebar requirement not stated | Ask |
| MCP server not installed | Auto-install; retry once; stop if still unavailable |
| MCP returns 401/403 | Report auth failure; stop |
| User answers "no" | Ask what to change; re-render |
| User answers "edit" | Apply change; re-render |
| Parent linking fails | Report orphaned item ID; provide manual linking instructions |

---

## PBI Description Templates

### Create module project and folder structure

```markdown
## Goal
Create the `{AppNamespace}.{ModuleName}` .NET class library project with the standard folder structure.

## Tasks

### Project creation
- Create a new .NET class library: `src/{AppNamespace}.{ModuleName}/{AppNamespace}.{ModuleName}.csproj`
- Add it to the solution `{AppNamespace}.sln`
- Reference `{AppNamespace}.Shared` project

### Standard folder structure
```
src/{AppNamespace}.{ModuleName}/
├── _Imports.razor
├── Components/
├── Extensions/
│   └── ServiceCollectionExtensions.cs
├── Models/
├── Resources/
└── Services/
    ├── Contracts/
    └── Impl/
```

### `_Imports.razor`
Add standard `@using` directives matching the pattern of existing modules (e.g. `{AppNamespace}.Resources/_Imports.razor`).

## Acceptance Criteria
- [ ] Project exists in the solution and builds successfully
- [ ] Folder structure matches the standard module layout
- [ ] `_Imports.razor` has the required `@using` directives
- [ ] Solution compiles with zero errors and zero warnings
```

---

### Register module assembly in AdditionalAssemblies

```markdown
## Goal
Make the Blazor router discover pages from `{AppNamespace}.{ModuleName}` by registering its assembly.

## Tasks
In `src/{AppNamespace}.App/Helpers/AdditionalAssemblies.cs`, add:
```csharp
typeof({ModuleName}._Imports).Assembly,
```
to the `AdditionalAssemblies` array (keep the list sorted alphabetically by module name).

Add the required `using` directive at the top of the file:
```csharp
using {AppNamespace}.{ModuleName};
```

## Acceptance Criteria
- [ ] The `{AppNamespace}.{ModuleName}` assembly appears in `AdditionalAssemblies`
- [ ] Routes defined with `@page` in `{AppNamespace}.{ModuleName}` are resolved by the Blazor router
- [ ] Application builds and starts without errors
```

---

### Create ServiceCollectionExtensions and register module in WebApp DI

```markdown
## Goal
Create the module's DI registration extension and wire it into the WebApp.

## Tasks

### Module extension (`Extensions/ServiceCollectionExtensions.cs`)
```csharp
public static class ServiceCollectionExtensions
{
    public static IServiceCollection Add{ModuleName}Module(this IServiceCollection services)
    {
        // Services will be registered here as they are added
        return services;
    }
}
```

### WebApp registration
In `src/{AppNamespace}.App/Extensions/ServiceCollectionExtensions.cs`, add the call inside the main `Add{AppName}WebApp` method:
```csharp
.Add{ModuleName}Module()
```

## Acceptance Criteria
- [ ] `Add{ModuleName}Module()` extension method exists and compiles
- [ ] It is called from the WebApp's main DI registration method
- [ ] `IoCTest` passes after the registration is added
```

---

### Create module main page

```markdown
## Goal
Create the main entry view for the `{ModuleName}` module.

## Tasks
- `Components/{ModuleName}View.razor` with `@page "/{module-kebab}"` directive
- `Components/{ModuleName}View.razor.cs` as `partial class {ModuleName}View` with primary constructor injection
- Inject `IStringLocalizer<{ModuleName}View>`
- `Resources/{ModuleName}View.resx` (and `.es.resx`) with a `Title` key
- Render the localized title; body can be a placeholder for now

## Acceptance Criteria
- [ ] Navigating to `/{module-kebab}` renders `{ModuleName}View` inside `MainLayout`
- [ ] Page title is displayed using the localized `Title` key
- [ ] Component compiles with zero errors and zero warnings
- [ ] `IoCTest` resolves all injected services
```

---

### Add module to sidebar navigation

```markdown
## Goal
Add a navigation entry for `{ModuleName}` to the application sidebar.

## Tasks
- Add a `SidebarItemModel` (or equivalent) entry with:
  - Route: `/{module-kebab}`
  - Label: localized string (add to shared resources)
  - Icon: choose a relevant Font Awesome icon class
- Register the entry in `SidebarService` or the sidebar configuration

## Acceptance Criteria
- [ ] Entry appears in the sidebar
- [ ] Clicking the entry navigates to `/{module-kebab}`
- [ ] Active state is highlighted when on any route under `/{module-kebab}`
- [ ] Label is localized in all supported languages
```
