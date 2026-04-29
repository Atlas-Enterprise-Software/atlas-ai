---
name: atlas-nuget-updater
description: "Update NuGet packages for one or more .NET solutions in Atlas repositories. Use this skill whenever the user wants to update NuGets, upgrade packages, refresh dependencies, or says 'actualiza los nugets', 'actualiza los paquetes', 'update nugets', 'quiero actualizar las dependencias', 'hay nugets desactualizados'. Also trigger when the user mentions a solution and wants to check for outdated packages — even if they don't say 'NuGet' explicitly."
version: 1.0.0
---

# atlas-nuget-updater

## Purpose

Automate the full NuGet update cycle for one or more .NET solutions:

1. Detect the package management mode (Central Package Management or per-project)
2. Discover which packages are outdated
3. Apply pinned-version rules before touching anything
4. Check publication age for supply chain safety
5. Update packages using the correct strategy for each project
6. Verify the solution compiles and all tests pass

After verification, this skill automatically invokes atlas-azure-devops-pr to create the PR.

> All shell commands in this skill use **bash** (available via Git Bash on Windows).
> JSON parsing and date calculations use **PowerShell** (`pwsh`) — always present on Windows.

---

## Autonomy Rules

Act without asking for confirmation for:
- Detecting CPM vs per-project mode
- Discovering outdated packages and applying the update plan
- Querying NuGet API to find the latest allowed version for pinned packages
- Running `dotnet build` and `dotnet test` automatically after updates
- Reverting a package update if it causes a build failure

Stop and ask the user if:
- No solution file (`.sln` or `.slnx`) was specified and multiple exist in the working directory — list them and ask which one(s)
- A build failure persists after reverting the problematic package — show the error and wait
- Tests fail with what looks like a real regression — show which tests failed before stopping

---

## Pinned Packages

These packages have version constraints that must be respected regardless of what `dotnet list package --outdated` reports:

| Package | Rule |
|---------|------|
| `FluentAssertions` | Maximum **7.x.x**. Never update to 8.x or above. If the latest available is ≥ 8.0.0, find and apply the latest 7.x instead. |
| `MediatR` | **Skip entirely.** Never update, regardless of how outdated it appears. |
| `Microsoft.Azure.Functions.Worker.ApplicationInsights` | Maximum **2.50.0**. Never update above this version. |

Any package not listed above can be updated to its latest stable version.

---

## Step 1 — Identify the solution(s) to update

If the user specified one or more paths, use those. Accept both `.sln` and `.slnx` formats — the `dotnet` CLI handles both.

If no path was given:
```bash
find . -maxdepth 3 \( -name "*.sln" -o -name "*.slnx" \) | sort
```

- **Exactly one found**: use it and notify the user.
- **Multiple found**: list them and ask the user which one(s) to update.
- **None found**: report and ask the user for the path.

---

## Step 2 — Detect package management mode

For each solution, determine whether it uses **Central Package Management (CPM)** or **per-project** versioning. These are different enough that the update strategy changes completely.

**CPM** means versions live in one or more `Directory.Packages.props` files and `.csproj` files have `<PackageReference>` entries with no `Version` attribute.

**Per-project** means each `.csproj` carries its own `<PackageReference Include="..." Version="..."/>`.

A solution can have a mix: src projects using CPM and test projects using per-project (or vice versa). Detect per project, not per solution.

### Detection algorithm

```bash
# 1. Check for Directory.Packages.props anywhere in or above the solution folder
find <solution-dir> -name "Directory.Packages.props" | sort

# 2. Check if ManagePackageVersionsCentrally is enabled
grep -r "ManagePackageVersionsCentrally" <solution-dir> --include="*.props" --include="*.csproj"

# 3. For a specific .csproj, check whether its PackageReference entries carry Version attributes
grep "PackageReference" <project.csproj> | grep -v 'Version='
```

**Rule**: if `ManagePackageVersionsCentrally=true` is active for a project (either in the project itself or inherited from a `Directory.Build.props`/`Directory.Packages.props` up the tree), that project is **CPM**. Otherwise it is **per-project**.

Note: a `Directory.Packages.props` file can `<Import>` a parent `Directory.Packages.props` to inherit packages — treat the entire chain as CPM.

---

## Step 3 — Discover outdated packages

For each solution, run:

```bash
dotnet list <solution> package --outdated
```

This works for both `.sln` and `.slnx`. The output looks like this (both formats can appear):

```
Project 'MyService.Functions' has the following updates to its packages
   [net8.0]:
   Top-level Package                              Requested   Resolved   Latest
   > Atlas.Audit                                     1.3.0       1.3.0      1.4.0
   > Newtonsoft.Json                              13.0.1      13.0.1     13.0.3
```

Parse each line that starts with `>` to extract: package name (column 1), current version (column 2 — use Resolved, not Requested), and latest version (column 4). Associate each entry with the project name from the preceding `Project '...'` header.

Build the update plan: a list of `{ project, package, currentVersion, latestVersion, cpm: bool }` entries, using the detection from Step 2 to set the `cpm` flag per project.

---

## Step 4 — Apply pinned-version rules

For each entry in the update plan:

**MediatR** → remove from the plan. Do not update.

**FluentAssertions** where `latestVersion >= 8.0.0`:
- Find the latest 7.x release from the NuGet flatcontainer API using PowerShell:
  ```powershell
  pwsh -Command "(Invoke-RestMethod 'https://api.nuget.org/v3-flatcontainer/fluentassertions/index.json').versions | Where-Object { $_ -like '7.*' } | Select-Object -Last 1"
  ```
- Replace `latestVersion` with this 7.x value. If the current version is already the latest 7.x, remove from plan.

**Microsoft.Azure.Functions.Worker.ApplicationInsights** where `latestVersion > 2.50.0`:
- Replace `latestVersion` with `2.50.0`. If the current version is already `2.50.0` or above, remove from plan.

If the plan is empty after applying all rules, tell the user everything is already up to date and stop.

---

## Step 5 — Check publication age for public packages

The goal is supply chain safety: a package published moments ago may be a typosquat, a compromised release, or simply not yet stable. Packages resolved from a **private feed** are trusted and skip this check entirely.

### 5a — Identify private feeds

Search for `nuget.config` / `NuGet.Config` from the solution directory up to the repo root:

```bash
find <solution-dir> -maxdepth 5 \( -name "nuget.config" -o -name "NuGet.Config" \) | sort
```

Parse the `<packageSources>` section and collect every source URL that is **not** `https://api.nuget.org/v3/index.json`. These are the private feeds.

If no `nuget.config` is found or no private feeds are configured, treat all packages as public and apply the age check to all of them.

### 5b — Classify each package

For each package in the update plan, check whether its latest version exists in any of the private feeds. Use the NuGet v3 flat-container endpoint (widely supported by Azure Artifacts and other private registries):

```powershell
pwsh -Command "
\$feed = '<private-feed-base-url>'   # e.g. https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3
\$id   = '<package-id>'.ToLower()
\$ver  = '<latest-version>'.ToLower()
try {
  Invoke-WebRequest \"\$feed/flatcontainer/\$id/\$ver/\$id.\$ver.nupkg\" -Method Head -UseBasicParsing | Out-Null
  'PRIVATE'
} catch { 'PUBLIC' }
"
```

- **`PRIVATE`** → package lives in a private feed; mark as **internal** and skip the age check.
- **`PUBLIC`** (or any error) → not found in any private feed; apply the age check in 5c.

### 5c — Age check for public packages

Public packages must have been published at least **24 hours** before the current date/time.

Query the NuGet v2 OData API (this endpoint reliably returns publication dates):

```powershell
pwsh -Command "
try {
  \$url = 'https://www.nuget.org/api/v2/Packages(Id=''{id}'',Version=''{version}'')'
  \$xml = [xml](Invoke-WebRequest \$url -UseBasicParsing).Content
  \$pub = \$xml.entry.properties.Published.'#text'
  \$age = ([DateTime]::UtcNow - [DateTimeOffset]::Parse(\$pub).UtcDateTime).TotalHours
  if (\$age -ge 24) { 'OK:' + \$pub.Substring(0,10) } else { 'TOO_NEW:' + [int]\$age + 'h' }
} catch { 'API_ERROR' }
"
```

Interpret the output:
- `OK:2024-11-14` → keep in plan, display the date with ✓
- `TOO_NEW:3h` → remove from plan, add to held-back list
- `API_ERROR` → keep in plan, warn that age could not be verified

### 5d — Show the update summary

After classification and age checks, show the full update summary — do NOT wait for confirmation, just show it and continue:

```
Packages to update:

Solution: src/MyService.sln
  [CPM] Directory.Packages.props
    Atlas.Audit               1.3.0  →  1.4.0   (private feed)
    Newtonsoft.Json       13.0.1  →  13.0.3   published 2024-11-14 ✓

  [per-project] MyService.Functions/MyService.Functions.csproj
    Serilog                2.11.0  →  4.2.0   published 2024-11-10 ✓

Skipped (pinned):
  MediatR — not updated (pinned)
  FluentAssertions — already at latest 7.x (7.2.2); latest available is 8.9.0

Held back (published < 24h ago):
  SomePackage 3.0.0 — published 3h ago; retry tomorrow

Proceeding with updates...
```

---

## Step 6 — Update packages

Apply the correct strategy depending on the `cpm` flag for each entry.

### CPM projects

Do NOT use `dotnet add package` — it does not reliably update `Directory.Packages.props`.

Instead, edit the `Directory.Packages.props` file(s) directly. Find the file that contains the `<PackageVersion Include="<package>" .../>` entry for the package being updated and change its `Version` attribute.

There may be multiple `Directory.Packages.props` files in a repo (e.g. one at the root for src projects and one in `tests/` that imports the root). Update the one that actually defines the version for that package — not a file that only imports it.

```xml
<!-- Before -->
<PackageVersion Include="Atlas.Audit" Version="1.3.0" />

<!-- After -->
<PackageVersion Include="Atlas.Audit" Version="1.4.0" />
```

Group all CPM updates by `Directory.Packages.props` file and apply them in a single edit per file — not one edit per package. This avoids unnecessary back-and-forth with the file.

### Per-project projects

Use `dotnet add package` on the specific `.csproj`:

```bash
dotnet add "<project.csproj>" package <package> --version <targetVersion>
```

Process projects in the same solution sequentially to avoid lock conflicts.

---

## Step 7 — Build the solution

After all updates are applied:

```bash
dotnet build "<solution>" --configuration Release
```

**If the build succeeds**: continue to Step 8.

**If the build fails**:
1. Identify which package(s) introduced the error from the error message (look for changed namespaces, types, method signatures, or `NU1202` TFM incompatibilities).
2. Revert the offending package(s) to their previous version using the appropriate strategy:
   - CPM: edit `Directory.Packages.props` back to the old version
   - Per-project: `dotnet add "<project.csproj>" package <package> --version <previousVersion>`
3. Run `dotnet build` again to confirm the revert fixed it.
4. Remove the reverted package(s) from the update summary.
5. If the build still fails after reverting, stop and show the full build error. Do not proceed.

**NU1202 (TFM incompatibility)**: means the new package version targets a newer .NET than the solution. Revert that package — do not try to upgrade the TFM.

**Multiple solutions**: process each solution's build independently. If one fails and cannot be recovered, stop across all solutions — do not proceed to tests or mark any as done.

---

## Step 8 — Run the tests

```bash
dotnet test "<solution>" --configuration Release --no-build
```

**If all tests pass**: the skill is done. Produce the Output Summary.

**If tests fail**: check whether the failure is infrastructure-related (CosmosDB, SQL, external services, missing configuration) and not caused by the package updates. If the failure is clearly pre-existing infrastructure (e.g. connection refused, quota exceeded, missing URL config), note it explicitly and proceed to the Output Summary anyway. If the failure looks like a real regression (assertion mismatches in unit tests, missing members, compilation-style errors), stop and show the failing tests.

**Multiple solutions**: run tests for each solution sequentially. Collect all results before producing the Output Summary.

---

## Output Summary

When the skill completes (successfully or with noted infrastructure failures), print a structured summary that the post-skill hook will use to create the PR:

```
=== nuget-update-summary ===
solutions: src/MyService.sln
status: success

updated:
  Atlas.Audit: 1.3.0 → 1.4.0
  Newtonsoft.Json: 13.0.1 → 13.0.3
  Serilog: 2.11.0 → 4.2.0

skipped:
  MediatR: pinned — not updated
  FluentAssertions: capped at 7.x (7.2.2); latest 8.9.0 ignored

held_back:
  SomePackage 3.0.0: published 3h ago — retry tomorrow

reverted:
  (none)

build: passed
tests: passed
=== end ===
```

If there are infrastructure test failures, set `tests: passed (infrastructure failures noted — pre-existing)`.

---

## Failure Handling

| Situation | Action |
|-----------|--------|
| `dotnet list package --outdated` returns nothing | Tell the user all packages are up to date |
| NuGet API error on age check | Keep the package in plan, warn that age could not be verified |
| NuGet API error on FluentAssertions cap | Skip its update and warn the user; proceed with the rest |
| All remaining packages are held back (< 24h) | Tell the user there is nothing safe to update today and stop without producing an Output Summary |
| Build fails with NU1202 (TFM mismatch) | Revert that package; note it in `reverted` section |
| Build fails after reverting the offending package | Stop and show the full build error. Do not produce an Output Summary |
| Test failures that are clearly infrastructure (CosmosDB quota, connection refused, missing URL config) | Note them as pre-existing, include in Output Summary and proceed |
| Test failures that look like regressions (unit test assertion failures, missing members) | Show the failing tests and stop. Do not produce an Output Summary |
| Multiple solutions specified | Process each sequentially (Steps 2–8 per solution); produce a single combined Output Summary at the end |

---

## Step 9 — Create the Pull Request

After printing the Output Summary, immediately invoke the `atlas-ai-plugins:atlas-azure-devops-pr` skill using the Skill tool. Do not ask for confirmation — proceed directly.

The PR skill will read the current git state, generate title and description from the diff (the updated `.props` and `.csproj` files), and create the PR in Azure DevOps.

Skip this step only if:
- The Output Summary was not produced (build or test failure that stopped execution early)
- `status: failure` appears in the Output Summary
