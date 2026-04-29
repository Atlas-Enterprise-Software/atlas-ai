---
name: atlas-appinsights-failures
description: "Analyze Azure Application Insights failures for any resource in any Azure subscription. Use this skill whenever the user asks about errors, failures, exceptions, or incidents — phrases like 'qué falla en X', 'mira los errores de Y', 'hay fallos en Z', 'check Application Insights', 'qué ha fallado hoy', 'analiza los fallos de', or when the user mentions a resource name and wants to investigate issues. If no subscription is provided, lists available subscriptions for the user to choose."
version: 1.0.0
---

# atlas-appinsights-failures

## Purpose

Guide a full failure investigation cycle for any Application Insights resource: resolve the Azure subscription via CLI (listing available ones if the user does not specify it), query Application Insights for failures, let the user choose which failure to drill into, and — when there is a clear stack trace — automatically locate the root cause in Azure DevOps source code.

---

## Autonomy Rules

Act without asking for confirmation for:
- Defaulting to 24h as the time window — notify the user but proceed immediately.
- Listing available subscriptions when none is specified — present the list and wait for selection.
- Installing the `application-insights` CLI extension if absent.
- Searching Azure DevOps source code when the stack trace contains a file or class name — do not ask first.
- Presenting the failure list and waiting for the user to pick one.

Stop only if:
- The resource name is completely unknown (ask exactly once).
- `az account list` returns an empty array — tell the user to run `az login`.
- The resource cannot be found in the selected subscription — report it and stop.
- Merge conflicts or authentication errors block CLI execution.

---

## Step 1 — Collect resource name and subscription

Check the user's message for both pieces of information:

- **Resource name**: if not mentioned, ask for it.
- **Subscription**: if not mentioned, do **not** ask — proceed to Step 2 to list them.

If only the resource name is missing, ask for it and wait before continuing.

---

## Step 2 — Resolve the subscription

**If the user already specified a subscription** (by name, ID, or alias), resolve it:

```bash
az account list --query "[?name=='<subscription-name>' || id=='<subscription-name>'].{name:name, id:id, tenantId:tenantId}" -o json
```

If the result is empty, tell the user to run `az login` and stop.

**If no subscription was specified**, list all available ones and let the user choose:

```bash
az account list --query "[].{name:name, id:id}" -o json
```

Present the result as a numbered list:

```
Available subscriptions:

[1] Production  (id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
[2] Staging     (id: yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy)
[3] Dev         (id: zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz)

Which subscription contains the resource?
```

Wait for the user's selection before continuing. If `az account list` returns an empty array, tell the user to run `az login` and stop.

Once resolved, note the `id` and `tenantId` — use them in all subsequent calls.

---

## Step 3 — Set the time window

Default to the last **24 hours**. Notify the user inline (e.g. *"Analyzing the last 24h — tell me a different window if you need one"*) and proceed immediately without waiting for confirmation.

If the user specified a period in their message (e.g. "last 6 hours", "desde ayer"), convert it to `--offset <N>h` and use that instead.

---

## Step 4 — Ensure the extension is available and locate the resource

Ensure the Application Insights CLI extension is installed:

```bash
az extension add --name application-insights --only-show-errors
```

Then locate the resource using `az resource list` (the `app-insights component` subcommands are unreliable across CLI versions):

```bash
az resource list \
  --subscription <subscription-id> \
  --resource-type "Microsoft.Insights/components" \
  --query "[?name=='<resource-name>'].{name:name, resourceGroup:resourceGroup}" \
  -o json
```

If no exact match, try a contains filter:

```bash
az resource list \
  --subscription <subscription-id> \
  --resource-type "Microsoft.Insights/components" \
  --query "[?contains(name, '<resource-name>')].{name:name, resourceGroup:resourceGroup}" \
  -o json
```

Note the `resourceGroup` and `name` from the result. If still no match, report it to the user and stop.

---

## Step 5 — Query failures (run both in parallel)

**Failed HTTP requests grouped by operation and status code:**
```bash
az monitor app-insights query \
  --subscription <subscription-id> \
  --resource-group <rg-name> \
  --app <app-name> \
  --analytics-query "requests | where success == false | summarize count=count(), lastOccurrence=max(timestamp) by name, resultCode | order by count desc | limit 50" \
  --offset <N>h \
  -o json
```

**Exceptions grouped by type:**
```bash
az monitor app-insights query \
  --subscription <subscription-id> \
  --resource-group <rg-name> \
  --app <app-name> \
  --analytics-query "exceptions | summarize count=count(), lastOccurrence=max(timestamp) by type, outerMessage | order by count desc | limit 50" \
  --offset <N>h \
  -o json
```

---

## Step 6 — Present failures as a navigable numbered menu

Combine all failure types found (failed requests + exception types) into a single numbered list, sorted by occurrence count descending. Example:

```
Failures found in atlasbcmw-dev — last 24h:

[1] DurableSerializationException — KeyNotFoundException: 'Code' not in dict
    Occurrences: 115 | Last seen: 22/04/2026 12:50 UTC

[2] HttpRequestException — Connection refused to https://api.internal
    Occurrences: 23 | Last seen: 22/04/2026 11:30 UTC

[3] Failed requests (HTTP 500) — POST /api/entities
    Occurrences: 8 | Last seen: 22/04/2026 10:15 UTC

Which one do you want to analyze? (enter the number, or "all" for a ranked summary of all)
```

If there are **no failures**, say clearly that no failures were found in the given period for the resource.

---

## Step 7 — Analyze the selected failure

Once the user picks a number:

1. Fetch up to 3 representative samples with full detail (including stack traces):
   ```bash
   az monitor app-insights query \
     --subscription <subscription-id> \
     --resource-group <rg-name> \
     --app <app-name> \
     --analytics-query "exceptions | where type == '<type>' | order by timestamp desc | limit 3 | project timestamp, type, outerMessage, innermostMessage, details" \
     --offset <N>h \
     -o json
   ```
   (Adjust to `requests` if the selection was a failed HTTP request rather than an exception.)

2. Extract from the stack trace:
   - Exception type and message (unwrap `DurableSerializationException` to get the inner exception)
   - Exact file and line number
   - Call chain (which method called which)

3. Present a concise analysis:
   - **What failed**: what operation was being performed
   - **Where**: filename and line number
   - **Why**: root cause in plain language

If the user selects **"all"**: produce a ranked summary of every item — one paragraph each, ordered by occurrence count. Skip the detailed stack trace fetch; use the data already available from Step 5.

---

## Step 8 — Search source code and explain the root cause

If the stack trace contains a class name, method name, or file path:

- **Search automatically** — do not ask for permission.
- Before searching, ask for the Azure DevOps organization and project if not already provided in the conversation:
  > "To search the source code I need the Azure DevOps organization and project. (e.g. org: \"atlas\", project: \"Atlas Development\")"
- Use `mcp__azure-devops__search_code` (organization: `{Organization}`, project: `{Project}`) to find the relevant file.
- Once you have the source, identify:
  - The exact line causing the error (reference as `filename.cs:lineNumber`)
  - The surrounding context that explains why the error occurs

Present:
- **Root cause**: what the code is doing and why it fails
- **Suggested fix**: what should be changed and why

If the stack trace has no identifiable class or file name (e.g. a generic infrastructure error), skip the source search and explain the problem based on the error message alone, then suggest what kind of fix would be needed.

> Do not modify any files. Only explain and propose the fix as text.

---

## Failure Handling

| Situation | Action |
|-----------|--------|
| `az account list` returns `[]` | Tell the user to run `az login` and stop |
| Resource not found in subscription | Report the resource name and subscription tried; suggest verifying the name or trying a different subscription |
| `az monitor app-insights query` fails | Show the raw error; suggest checking resource group permissions |
| `mcp__azure-devops__search_code` returns no results | Try with just the class name; if still nothing, analyze from stack trace alone |
| Azure DevOps org or project not provided when needed | Ask once before performing the source search in Step 8 |
| Query returns 0 rows for both tables | Confirm no failures in the period; offer to widen the time window |

---

## Tips

- Durable Function exceptions wrapped as `DurableSerializationException` contain the real exception in the `outerMessage` JSON — parse it to extract the true type and stack trace before presenting to the user.
- If a failure appears 0 times in the requests table but many times in exceptions, it is likely caught at the application level — explain this to the user.
- If `mcp__azure-devops__search_code` returns multiple files, pick the one whose path best matches the namespace or class in the stack trace.
- When the user mentions a subscription by a partial name or alias (e.g. "prod", "dev environment"), match it against the `az account list` output using a contains search before asking for clarification.
