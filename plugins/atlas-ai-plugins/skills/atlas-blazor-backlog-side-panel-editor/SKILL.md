---
name: atlas-blazor-backlog-side-panel-editor
description: "Generate an Azure DevOps backlog for adding create/edit/delete functionality in a lateral side panel to a Blazor module. Use this skill whenever the user wants a side panel editor, an edit drawer, create/edit forms in a panel — phrases like 'add a side panel editor for X', 'create an edit panel for Y', 'add create and edit to the Z grid', 'panel lateral de edición para W'."
version: 1.1.0
---

# atlas-blazor-side-panel-editor

## Purpose

Generate a structured Azure DevOps backlog for adding create/edit/delete functionality using the `SidePanel` pattern.

The application uses:
- `SidePanel` component cascaded from `MainLayout` via `CascadingValue Value="@_panel"`
- `<SectionContent SectionName="main-panel">` to inject editor content into the panel
- `EditForm` + `DataAnnotationsValidator` for form validation
- A `.editor-content / .editor-header / .editor-body / .editor-footer` CSS layout for the editor
- `Modal` (TelerikWindow wrapper) for delete confirmation

The backlog always covers the full development flow:

1. Editor component with mock submit
2. Wiring editor to the grid
3. BFF endpoints (backend team)
4. Service layer methods for create/update/get by ID/delete
5. Replace mock submit with real service calls
6. Delete confirmation modal (if requested)

Produces: **EPIC (optional) → Feature → 5–6 PBIs**.

After collecting inputs, renders a full preview tree and waits for explicit user approval before creating any item.

---

## Autonomy Rules

Act without asking:
- Write all work item titles and descriptions in **English**
- Always generate both Create and Edit scenarios in a single editor component
- Always include the delete modal PBI if delete is requested
- Always generate BFF PBIs before the wiring PBI
- Propose form fields from entity name and context; confirm before proceeding
- Mark BFF PBI clearly so the backend team knows it belongs to them
- Use MCP exclusively; attempt auto-install if not available

Stop and ask only if:
- Entity name or module are missing — ask all at once
- **Never assume** Azure DevOps organization or project
- Form fields not specified and cannot be derived — ask
- Delete action requirement not stated — ask
- BFF endpoint status unclear — ask: already exists or needs to be created?
- Grid page existence unclear — ask: does the grid page already exist (from `atlas-blazor-grid-page`) or not?
- User rejects or edits the preview — re-render before creating anything

---

## Step 1 — Collect inputs

Check the user's message for the following fields. Ask for everything missing in a **single message**.

**Required inputs:**

| Input | Behavior if absent |
|-------|--------------------|
| Entity name (e.g. `Project`) | Ask |
| Module name (e.g. `{AppNamespace}.Projects`) | Ask |
| Form fields list (name + type) | Ask — or propose from context and confirm |
| Delete action needed? (yes / no) | Ask |
| Grid page already exists? (yes / no) | Ask |
| BFF endpoint status | Ask — (a) needs to be created, (b) already exists |
| EPIC decision | Ask — (a) create new, (b) link existing (ID), (c) skip |
| Feature name | Ask — suggested default: `{EntityName} Editor` |
| Azure DevOps organization | Ask — **never assume** |
| Azure DevOps project | Ask — **never assume** |

If multiple inputs are missing:

```
To generate the backlog I need a few details:

1. What entity will the editor manage? (e.g. "Project", "Customer", "Resource")
2. Which module does it belong to? (e.g. "{AppNamespace}.Projects")
3. What form fields should the editor have? (e.g. "Name (text, required), Status (text), Active (boolean)")
   — I can propose fields from context if you prefer.
4. Does it need a Delete action with confirmation? (yes / no)
5. Does the grid listing page for this entity already exist? (yes / no)
6. Do the BFF endpoints (Create, Update, GetById, Delete) already exist, or do they need to be created?
7. EPIC: (a) create a new EPIC, (b) link to existing EPIC — tell me the ID, or (c) skip?
8. Feature name — suggested: "{EntityName} Editor". Keep it or change it?
9. Azure DevOps organization and project. (e.g. org: "myorg", project: "My Project")
```

Wait for the reply before continuing.

---

## Step 1b — Validate naming coherence

Check that entity name, module name, and feature name are consistent. If a mismatch is found, present it and wait for confirmation before proceeding.

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
- **Description**: `Implements the {EntityName} side panel editor in {ModuleName}, covering create, edit{delete_desc}, BFF integration, and service layer.`
  - `{delete_desc}` = `, and delete` if delete = yes, else empty

### PBI set

Always included:

1. `[{ModuleName}] Create {EntityName}Editor side panel component (mock submit)`
2. `[{ModuleName}] Wire {EntityName}Editor to grid via SidePanel`
3. `[{ModuleName}] Define BFF endpoints for {EntityName} CRUD` *(BFF — backend team)* ← omit if endpoints exist
4. `[{ModuleName}] Add Create/Update/GetById methods to I{EntityName}Service`
5. `[{ModuleName}] Wire {EntityName}Editor to service (replace mock submit)`

Optional (if delete = yes):

6. `[{ModuleName}] Add delete confirmation modal for {EntityName}`

---

## Step 3 — Render preview tree

```
Backlog preview — please review before creation
================================================

EPIC [NEW]  {EpicTitle}
└── Feature  {FeatureName}
    ├── PBI  [{ModuleName}] Create {EntityName}Editor side panel component (mock submit)
    ├── PBI  [{ModuleName}] Wire {EntityName}Editor to grid via SidePanel
    ├── PBI  [{ModuleName}] Define BFF endpoints for {EntityName} CRUD   ← BFF — backend team; omit if exist
    ├── PBI  [{ModuleName}] Add Create/Update/GetById methods to I{EntityName}Service
    ├── PBI  [{ModuleName}] Wire {EntityName}Editor to service (replace mock submit)
    └── PBI  [{ModuleName}] Add delete confirmation modal for {EntityName}  ← if delete = yes

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
  description: "<description content from template — Goal and Tasks sections only>",
  acceptance_criteria: "<acceptance criteria from template — only for Product Backlog Items; omit for Epic and Feature>",
)
```

> `acceptance_criteria` maps to the `Microsoft.VSTS.Common.AcceptanceCriteria` field in the Azure DevOps Scrum process template.

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
=== blazor-side-panel-editor-summary ===
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
    - id: {id}  title: [{ModuleName}] Create {EntityName}Editor side panel component (mock submit)
    - id: {id}  title: [{ModuleName}] Wire {EntityName}Editor to grid via SidePanel
    - id: {id}  title: [{ModuleName}] Define BFF endpoints for {EntityName} CRUD
    - id: {id}  title: [{ModuleName}] Add Create/Update/GetById methods to I{EntityName}Service
    - id: {id}  title: [{ModuleName}] Wire {EntityName}Editor to service (replace mock submit)
    - id: {id}  title: [{ModuleName}] Add delete confirmation modal for {EntityName}  ← if created

items_created: {n}
=== end ===
```

---

## Failure Handling

| Situation | Action |
|-----------|--------|
| Entity name or module missing | Ask all at once |
| Form fields unknown | Ask or propose and confirm |
| Delete requirement not stated | Ask |
| BFF endpoint status unclear | Ask |
| MCP server not installed | Auto-install; retry once; stop if still unavailable |
| MCP returns 401/403 | Report auth failure; stop |
| User answers "no" | Ask what to change; re-render |
| User answers "edit" | Apply change; re-render |
| Parent linking fails | Report orphaned item ID; provide manual linking instructions |

---

## PBI Description Templates

### Create editor side panel component (mock submit)

```markdown
## Goal
Create the `{EntityName}Editor` Blazor component that handles both Create and Edit in a side panel.

## Tasks

### Component structure
- `Components/{EntityName}Editor/` folder (or inside existing `Components/` if simple)
- `{EntityName}Editor.razor` with `EditForm`, `DataAnnotationsValidator`, layout sections
- `{EntityName}Editor.razor.cs` using primary constructor injection

### Layout
```razor
<EditForm EditContext="@_editContext" OnValidSubmit="OnSubmit" FormName="{entity-name}-editor">
    <DataAnnotationsValidator/>
    <div class="editor-content">
        <div class="editor-header">
            <h3>@_title</h3>
            <button type="button" @onclick="@OnCancelClick" class="btn">
                <i class="fa-solid fa-times-circle"></i>
            </button>
        </div>
        <div class="editor-body">
            <!-- form fields using CustomInputText, CustomTextArea, DatePicker, etc. -->
        </div>
        <div class="editor-footer">
            <button type="button" @onclick="@OnCancelClick" class="btn btn-small btn-secondary">
                @sharedStringLocalizer["Discard"]
            </button>
            <button type="submit" class="btn btn-small btn-primary"
                    disabled="@(!_editContext.Validate() || !_editContext.IsModified())">
                @_saveButtonText
            </button>
        </div>
    </div>
</EditForm>
```

### Parameters
```csharp
[Parameter] public {EntityName}Model? Model { get; set; }  // null = create mode
[Parameter] public EventCallback OnCancel { get; set; }
[Parameter] public EventCallback<{EntityName}Model> OnCreate { get; set; }
[Parameter] public EventCallback<{EntityName}Model> OnEdit { get; set; }
```

### Mode detection
- `Model == null` → create mode; title = `@localizer["Create{EntityName}"]`
- `Model != null` → edit mode; title = `@localizer["Edit{EntityName}"]`; pre-fill `_editContext` from `Model`

### OnSubmit (mock)
Log or display a console message. Do **not** call any service yet.

### Localization
Add create/edit titles and field labels to `Resources/{EntityName}Editor.resx`.

```

**`acceptance_criteria` field:**
```markdown
- [ ] Component renders in both create mode (Model = null) and edit mode (Model = some value)
- [ ] Save button is disabled until the form is valid and has unsaved changes
- [ ] OnCancel fires correctly
- [ ] OnCreate fires with the new model on valid submit (create mode)
- [ ] OnEdit fires with the updated model on valid submit (edit mode)
- [ ] Component compiles with zero errors and zero warnings
```

---

### Wire editor to grid via SidePanel

```markdown
## Goal
Open the `{EntityName}Editor` in the main `SidePanel` when the user clicks "New" or "Edit" in the grid.

## Tasks

### In `{EntityName}View.razor`
```razor
<SectionContent SectionName="main-panel">
    @if (_showEditorPanel)
    {
        <{EntityName}Editor Model="@_selectedModel"
                             OnCancel="@OnCloseEditorPanel"
                             OnCreate="@OnConfirmCreate"
                             OnEdit="@OnConfirmEdit" />
    }
</SectionContent>
```

### Toolbar — "New" button
```razor
<button class="btn btn-small btn-primary" @onclick="@OnOpenCreatePanel">
    <i class="fa-solid fa-plus"></i> @localizer["New{EntityName}"]
</button>
```

### Grid row — "Edit" command column
```razor
<GridCommandColumn>
    <GridCommandButton OnClick="@OnOpenEditPanel">@localizer["Edit"]</GridCommandButton>
</GridCommandColumn>
```

### Code-behind
```csharp
[CascadingParameter] private SidePanel Panel { get; set; } = null!;

private void OnOpenCreatePanel()
{
    _selectedModel = null;
    _showEditorPanel = true;
    Panel.Open("500px");
}

private void OnOpenEditPanel(GridCommandEventArgs args)
{
    _selectedModel = ({EntityName}Model)args.Item;
    _showEditorPanel = true;
    Panel.Open("500px");
}

private void OnCloseEditorPanel()
{
    _showEditorPanel = false;
    Panel.Close();
}

private async Task OnConfirmCreate({EntityName}Model model) { /* TODO: call service */ OnCloseEditorPanel(); }
private async Task OnConfirmEdit({EntityName}Model model) { /* TODO: call service */ OnCloseEditorPanel(); }
```

```

**`acceptance_criteria` field:**
```markdown
- [ ] Clicking "New" opens the side panel in create mode
- [ ] Clicking "Edit" on a row opens the side panel in edit mode with the row's data pre-filled
- [ ] Clicking "Discard" or the close button closes the panel
- [ ] Panel width is 500px (or appropriate for the form)
```

---

### Define BFF endpoints for CRUD

```markdown
## Goal
Define and implement BFF endpoints for `{EntityName}` create, update, get by ID, and delete.

## Note
This PBI belongs to the **backend / BFF team**. The editor uses mock submit until this is ready.

## Tasks
- `POST /api/{resource}` → Create; body: `Create{EntityName}Request`; returns `{EntityName}Response`
- `PUT /api/{resource}/{id}` → Update; body: `Update{EntityName}Request`; returns `{EntityName}Response`
- `GET /api/{resource}/{id}` → Get by ID; returns `{EntityName}Response`
- *(If delete requested)* `DELETE /api/{resource}/{id}` → Delete; returns `204 No Content`
- Update BFF client NuGet package with new methods

```

**`acceptance_criteria` field:**
```markdown
- [ ] All endpoints return correct status codes (`201`, `200`, `204`, `404` as applicable)
- [ ] BFF client NuGet package is updated and published
- [ ] Swagger/OpenAPI documents all new endpoints
```

---

### Add Create/Update/GetById methods to service

```markdown
## Goal
Extend `I{EntityName}Service` and `{EntityName}Service` with methods for create, update, get by ID, and delete.

## Tasks

### Interface additions (`Services/Contracts/I{EntityName}Service.cs`)
```csharp
Task<{EntityName}Model> Create{EntityName}(Create{EntityName}FormModel model);
Task<{EntityName}Model> Update{EntityName}(string id, Update{EntityName}FormModel model);
Task<{EntityName}Model> Get{EntityName}ById(string id);
// If delete: Task Delete{EntityName}(string id);
```

### Form models
- `Models/Create{EntityName}FormModel.cs` — fields bound to the create form
- `Models/Update{EntityName}FormModel.cs` — fields bound to the edit form

### Implementation (`Services/Impl/{EntityName}Service.cs`)
Map form models to BFF request DTOs, call BFF client, map response to `{EntityName}Model`.

```

**`acceptance_criteria` field:**
```markdown
- [ ] All new methods are defined on the interface and implemented in the service
- [ ] Form models have `[Required]` and other data annotation validators matching the BFF validation rules
- [ ] Mapping from form model → BFF request → `{EntityName}Model` is correct
- [ ] Service compiles with zero errors
```

---

### Wire editor to service (replace mock submit)

```markdown
## Goal
Replace the mock `OnSubmit` in `{EntityName}Editor` with real service calls via `I{EntityName}Service`.

## Tasks
- Inject `I{EntityName}Service` in `{EntityName}View.razor.cs` (not in the editor — the view orchestrates)
- In `OnConfirmCreate`: call `await {entityService}.Create{EntityName}(model)`, refresh grid, close panel
- In `OnConfirmEdit`: call `await {entityService}.Update{EntityName}(id, model)`, refresh grid, close panel
- On success: show a success notification via the cascaded `INotificationHubCallbacks` or a `TelerikNotification`
- On failure: catch exception, show error notification, keep panel open

```

**`acceptance_criteria` field:**
```markdown
- [ ] Creating a new entity persists it and refreshes the grid
- [ ] Editing an entity updates it and refreshes the grid
- [ ] Success notification is shown after create/edit
- [ ] Error notification is shown if the service call fails; panel remains open
- [ ] No mock submit code remains
```

---

### Add delete confirmation modal

```markdown
## Goal
Add a delete action to the `{EntityName}` grid with a confirmation modal before calling the delete service.

## Tasks

### Grid row action
```razor
<GridCommandColumn>
    <GridCommandButton OnClick="@OnOpenDeleteModal" ThemeColor="error">
        @localizer["Delete"]
    </GridCommandButton>
</GridCommandColumn>
```

### Modal
```razor
<Modal Show="@_showDeleteModal"
       Title="@localizer["Delete{EntityName}Title"]"
       SubTitle="@_deleteSubtitle"
       OnClose="@OnCloseDeleteModal"
       OnConfirm="@OnConfirmDelete"
       ConfirmButtonText="@sharedStringLocalizer["Confirm"]"
       CancelButtonText="@sharedStringLocalizer["Cancel"]">
    <p>@localizer["Delete{EntityName}Message"]</p>
</Modal>
```

### Service method
- `I{EntityName}Service.Delete{EntityName}(string id)` → calls `DELETE /api/{resource}/{id}` on BFF
- On success: remove item from grid list; show success notification
- On failure: show error notification; keep item in grid

### Localization
Add `Delete{EntityName}Title`, `Delete{EntityName}Message` keys to `Resources/{EntityName}View.resx`.

```

**`acceptance_criteria` field:**
```markdown
- [ ] Clicking "Delete" on a row opens the confirmation modal with the entity name in the subtitle
- [ ] Confirming deletes the entity, removes it from the grid, and shows a success notification
- [ ] Cancelling closes the modal without deleting
- [ ] Error state is handled: notification shown, item remains in grid
```
