---
name: atlas-blazor-new-page
description: "Generate an Azure DevOps backlog for adding a new page or view to an existing Blazor module. Use this skill whenever the user wants to add a page, create a view, register a new route, or says 'add a page for X', 'create a view for Y', 'add route /z to the module', 'new screen for W'."
version: 1.0.0
---

# atlas-blazor-new-page

## Purpose

Generate a structured Azure DevOps backlog for adding a new page (view) to an existing module in the `{AppNamespace}` Blazor application.

Produces a three-level hierarchy:

- **EPIC** (optional)
- **Feature** — one per page/screen
- **Product Backlog Items** — up to 3 PBIs depending on options:
  - Page component (always)
  - Sidebar navigation entry (if requested)
  - Authorization policy (if requested)

All work items are created in the Azure DevOps organization and project provided by the user.

After collecting inputs, the skill renders a full preview tree and waits for explicit user approval before creating any item.

---

## Autonomy Rules

Act without asking:
- Write all work item titles and descriptions in **English** — regardless of the language the user writes in
- Propose default Epic title and Feature name from the page name if context is clear
- Omit sidebar and authorization PBIs if the user says they are not needed
- Use MCP exclusively; attempt auto-install if not available

Stop and ask only if:
- Page name, module name, or route are missing — ask all at once in a single message
- **Never assume** Azure DevOps organization or project
- Epic decision not stated — ask: create new / link existing / skip
- Sidebar and authorization requirements not stated — ask both in the same message
- User rejects or edits the preview — re-render before creating anything

---

## Step 1 — Collect inputs

Check the user's message for the following fields. Ask for everything missing in a **single message**.

**Required inputs:**

| Input | Behavior if absent |
|-------|--------------------|
| Page / view name (e.g. `ProjectsView`) | Ask |
| Module name (e.g. `{AppNamespace}.Projects`) | Ask |
| Route path (e.g. `/projects`) | Ask |
| Sidebar menu entry required? (yes / no) | Ask |
| Authorization policy required? (yes / no) | Ask |
| EPIC decision | Ask — choices: (a) create new EPIC, (b) link to existing EPIC (provide ID), (c) skip |
| Feature name | Ask — default suggestion: `{PageName} Page` |
| Azure DevOps organization | Ask — **never assume** |
| Azure DevOps project | Ask — **never assume** |

If multiple inputs are missing, use this template:

```
To generate the backlog I need a few details:

1. What is the page / view name? (e.g. "ProjectsView", "ResourceSummaryView")
2. Which module does it belong to? (e.g. "{AppNamespace}.Projects")
3. What route should it have? (e.g. "/projects")
4. Does it need a sidebar navigation entry? (yes / no)
5. Does it need an authorization policy? (yes / no)
6. EPIC: (a) create a new EPIC, (b) link to existing EPIC — tell me the ID, or (c) skip?
7. Feature name — suggested: "{PageName} Page". Keep it or change it?
8. Azure DevOps organization and project. (e.g. org: "myorg", project: "My Project")
```

Wait for the reply before continuing.

---

## Step 2 — Build item tree in memory

Construct the full hierarchy without touching Azure DevOps.

### EPIC (if creating)

- **Type**: `Epic`
- **Title**: user-supplied, or suggested default `{ModuleName} — {PageName}`
- **Description**: `Top-level initiative for the {PageName} screen in the {ModuleName} Blazor module.`

### Feature

- **Type**: `Feature`
- **Title**: user-supplied Feature name
- **Parent**: EPIC (if one exists)
- **Description**: `Implements the {PageName} page in {ModuleName}, including the Blazor component, routing{sidebar_desc}{auth_desc}.`

  Where:
  - `{sidebar_desc}` = `, sidebar navigation entry` if sidebar = yes, else empty
  - `{auth_desc}` = `, and authorization policy` if auth = yes, else empty

### PBI set

Always included:

1. **`[{ModuleName}] Create {PageName} page component`**
2. **`[{ModuleName}] Add {PageName} to sidebar navigation`** — only if sidebar = yes
3. **`[{ModuleName}] Configure authorization policy for {PageName}`** — only if auth = yes

---

## Step 3 — Render preview tree

```
Backlog preview — please review before creation
================================================

EPIC [NEW]  {EpicTitle}
└── Feature  {FeatureName}
    ├── PBI  [{ModuleName}] Create {PageName} page component
    ├── PBI  [{ModuleName}] Add {PageName} to sidebar navigation    ← if sidebar = yes
    └── PBI  [{ModuleName}] Configure authorization policy for {PageName}  ← if auth = yes

Total: 1 EPIC  |  1 Feature  |  {n} PBIs
Org: {Organization}  |  Project: {Project}

Shall I create these items in Azure DevOps? (yes / no / edit)
```

Variants:
- `EPIC [EXISTING #id]` when linking to existing.
- No EPIC line when skipped.

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
  description: "<description>",
)
```

Link child → parent after each creation:

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

Creation order:
1. EPIC (if new) — no parent
2. Feature → parent = EPIC (if exists)
3. PBI: Create page component → parent = Feature
4. PBI: Add to sidebar → parent = Feature (if sidebar = yes)
5. PBI: Authorization policy → parent = Feature (if auth = yes)

---

## Step 6 — Output summary

```
=== blazor-new-page-summary ===
org: {Organization}
project: {Project}
page: {PageName}
module: {ModuleName}
status: success

epic:
  id: {epicId}
  title: {EpicTitle}
  url: https://dev.azure.com/{Organization}/{Project-URL-encoded}/_workitems/edit/{epicId}

feature:
  id: {featureId}
  title: {FeatureName}
  url: https://dev.azure.com/{Organization}/{Project-URL-encoded}/_workitems/edit/{featureId}
  pbis:
    - id: {id}  title: [{ModuleName}] Create {PageName} page component
    - id: {id}  title: [{ModuleName}] Add {PageName} to sidebar navigation       ← if created
    - id: {id}  title: [{ModuleName}] Configure authorization policy for {PageName}  ← if created

items_created: {n}
=== end ===
```

---

## Failure Handling

| Situation | Action |
|-----------|--------|
| Page name, module, or route missing | Ask all at once |
| Epic/Feature name missing | Ask in same message |
| MCP server not installed | Auto-install; retry once; stop if still unavailable |
| MCP returns 401/403 | Report auth failure; stop |
| User answers "no" | Ask what to change; re-render |
| User answers "edit" | Apply change; re-render |
| Parent linking fails | Report orphaned item ID; provide manual linking instructions |

---

## PBI Description Templates

### Create page component

```markdown
## Goal
Create the `{PageName}` Blazor page component in the `{ModuleName}` module.

## Tasks
- Create `Components/{PageName}.razor` with `@page "{route}"` directive
- Create `Components/{PageName}.razor.cs` as a `partial class {PageName}` using primary constructor injection
- Inject `IStringLocalizer<{PageName}>` for localization
- Add `Resources/{PageName}.resx` (and `{PageName}.es.resx`) with at minimum a `Title` key
- Follow the module's existing component structure

## Acceptance Criteria
- [ ] Navigating to `{route}` renders `{PageName}` inside `MainLayout`
- [ ] Page title is displayed using the localized `Title` key
- [ ] Component compiles with zero errors and zero warnings
- [ ] `IoCTest` resolves all services injected in `{PageName}.razor.cs`
```

---

### Add to sidebar navigation

```markdown
## Goal
Add a sidebar navigation entry for `{PageName}` so users can reach it from the main menu.

## Tasks
- Add a `SidebarItemModel` (or equivalent) entry with:
  - Route: `{route}`
  - Label: localized key (add to shared resources)
  - Icon: choose a relevant Font Awesome icon class
- Register the entry in `SidebarService` or the sidebar configuration of `{ModuleName}`

## Acceptance Criteria
- [ ] Entry appears in the sidebar when the user has access to `{ModuleName}`
- [ ] Clicking the entry navigates to `{route}`
- [ ] Active state is highlighted when on `{route}`
- [ ] Label is localized in all supported languages
```

---

### Configure authorization policy

```markdown
## Goal
Define and apply an authorization policy that restricts access to `{PageName}`.

## Tasks
- Define a new policy constant in `{AppNamespace}.Authorization` (e.g. `"{ModuleName}.{PageName}"`)
- Register the policy in the authorization configuration (`AuthorizationOptions`)
- Apply `[Authorize(Policy = "{ModuleName}.{PageName}")]` to `{PageName}.razor` or its code-behind

## Acceptance Criteria
- [ ] Unauthenticated users are redirected to the login page
- [ ] Unauthorized users see the "not authorized" view (not a blank page or error)
- [ ] Policy is covered by `IoCTest`
- [ ] Policy name follows the existing convention in the Authorization project
```
