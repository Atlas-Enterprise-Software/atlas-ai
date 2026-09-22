# Authoring

Condensed from the engine's own contract. Run `node bin/diagram-artifact.mjs contract` for
field enums, spacing math, geometry repair rules and repository evidence details — only
when a diagnostic sends you there.

## Type router

| Type | Use for |
|---|---|
| `architecture` | Components, services, cloud/security boundaries, infrastructure |
| `workflow` | Processes, approval gates, tool calls, runbooks, CI/CD |
| `sequence` | API call chains, request lifecycles, async traces, returns |
| `dataflow` | Pipelines, ETL/ELT, lineage, governance, consumers |
| `lifecycle` | State/status transitions, retries, waiting and terminal states |

## Mermaid input

Read Mermaid for topology and meaning, then author fresh JSON. Do not mechanically
reproduce Mermaid styling.

- `flowchart` / `graph` → `workflow`, or `architecture` for a component map.
- `sequenceDiagram` → `sequence`.
- `stateDiagram` → `lifecycle`.

## Composition invariants

- One obvious main path; side branches leave the nearest main-path node. Remove low-value
  edges before adding routing controls. Start with at most 12 primary nodes.
- Start with automatic routes and labels. Do not add `via`, `channelX`, `channelY` or
  `labelAt` before a diagnostic calls for one, and apply at most one diagnosed geometry
  control per repair.
- Relationship labels are semantic data. When one collides, move the label, adjust the
  route or spacing, then shorten the wording while preserving meaning. Deleting a label is
  not a geometry repair.
- Never accept an edge crossing an unrelated opaque node, an ambiguous shared corridor, or
  a label masking another route.
- Omit `meta.visual_preset`, `meta.subtitle`, `meta.legend` and `meta.engineering_profile`
  by default. Set them only on an explicit user request.
- Component fields are `id`, `type`, `label`, `sublabel`, `tag`, `brand`, `sources`, and
  the placement pair (`pos`/`size`, or `row`/`col`) — nothing else. Types are `frontend`,
  `backend`, `database`, `cloud`, `security`, `messagebus`, `external`.
- `variant` (`default`, `emphasis`, `security`, `dashed`) belongs to relationships, not to
  components. Emphasis on a component is carried by its `type` and its position.
- Preserve exact product names, code identifiers, commands, protocols, API paths and
  environment names, including inside localized copy.
- `meta.locale` controls only the fixed viewer UI and accepts `"en"` or `"zh-CN"`. For any
  other authoring language omit it and tell the user the viewer chrome stays English.
- Brand marks are optional and explicit: `node bin/diagram-artifact.mjs brands "<name>"
  --json`. Never infer a brand from a generic role such as "database".

## Per-type notes

- **workflow** — new sources use `schema_version: 2` and its readable layout contract.
  Keep `schema_version: 1` only to preserve an existing workflow's fixed geometry.
  Diagnose geometry with `validate workflow <spec> --layout-json`.
- **lifecycle** — phase columns `0..4` occupy the main rail; event/terminal column `N`
  aligns beneath main column `N + 2`. A recoverable state uses `type: "failure"` plus a
  real transition back to the active state.
- **sequence** — omit `meta.column_fit` for the stable `fixed` layout; set `"spread"` when
  a wide viewBox leaves unused horizontal space or meaningful participant labels do not
  fit. Do not shorten semantic labels first.
- **architecture** — `pos` and `size` are authored directly; this is the only type that
  accepts `--repo-root` and repository evidence.

## Real-code architecture

When the diagram must reflect a real repository, inventory it first — a diagram that omits
the queue, the blob container or the domain it calls is wrong, not merely incomplete:

```bash
node bin/diagram-artifact.mjs discover <repo-root>
node bin/diagram-artifact.mjs repository <repo-root>   # the meta.repository block
```

**Diagrams track `main`, never the working checkout.** Take `meta.repository` from
`repository` — it resolves `origin/main` — so the diagram describes the integrated system
rather than whatever branch happens to be checked out. Source links then point at the
branch (`GBmain` on Azure DevOps, `/blob/main/` on GitHub), so they keep working as the
code moves; the pinned commit is only what the engine verified the blobs against.

The rules live in `discovery/<ruleset>.json` — `dotnet` is the only one bundled; add a
file there and pass `--ruleset <id>` for another stack.

Findings are **candidates with evidence**, never conclusions. Each carries `path` and
`line`; open them and confirm the wiring before drawing it. Never infer runtime causality
from a package reference or a file name alone — a referenced package may be unused, and a
registration behind a feature flag is not the production path.

Map each confirmed concern onto the diagram:

| Concern | Draw as | Notes |
|---|---|---|
| `consumedDomains` | `external` component | One node per domain, not per client class |
| `storage` (blob, cosmos, sql, cache, search) | `database` | Name the real store: container, database, index |
| `messaging` (queue, topic, bus, event grid, hub) | `messagebus` | The broker is a node; events are edge labels |
| `events` | edge count + one card per aggregate | Never a node each; names verbatim |
| `entrypoints` | `frontend` / `backend` | The host, its controllers, functions, workers |
| `platform` (key vault, app config, identity, telemetry) | `cloud` | Include only when the diagram is about deployment or security |

**Name the real technology, and never let the generic type contradict it.** A component's
`type` is a semantic slot (`messagebus`, `database`, `cloud`), not a product: the legend
renders that slot's generic name, so a node labelled "Azure Event Grid" under a legend
reading "Message bus" tells the reader the team runs a bus it does not run. Relabel the
slot with `meta.legend.entries.<type>.label` whenever the generic wording would misreport
the stack — Event Grid is pub/sub, not a bus; Cosmos is not "a database" in general. Check
the delivered legend against the real technology before publishing.

Name the resource, never just the technology. `discover` returns a `summary` with
`namedResources` and `publishedEvents` precisely so a node can read
**`Blob Storage · documents, pending-documents`** instead of "Blob Storage", and a Cosmos
node can list its real containers. A `deploy-time-setting` finding is the opposite signal:
the account, endpoint or connection string lives in configuration, not in the repository —
say "cuenta por configuración" on the node or in a card, and never invent a resource name.

**Group with `boundaries`, by who owns the code.** The team's hand-made diagrams frame
each system or repository in a dashed box titled with its name and runtime —
`Cb.Dicom.Horus.Middleware — Function App / Durable`, `UK source — stgdicomfileswesteudev` —
and the draw.io export renders `boundaries` exactly that way: `region` in Azure blue for
what we deploy, `security-group` in red, `zone` in grey for a system we do not own. Wrap
the components of one repository in one boundary whenever a diagram spans several, so a
reader sees the ownership seams the moment it opens.

**A topic is not a delivery. Draw the queue.** In this stack an event reaches its consumer
through a storage queue: the Event Grid subscription writes into a queue and the function
wakes on `QueueTrigger`. An edge straight from the broker to the service hides a named
resource, its retry behaviour and its dwell time, so every queue on the path is its own
node, labelled with its real name (`pendingdocumentsevents`, `documents-to-extract-data`),
and the subscription's filter goes on that queue's `tag`, where it fits. `discover` reports
this as `messaging` findings of kind `queue-consumer`, `queue-producer` and
`eventgrid-trigger`, plus the queue names under `resources`: cross-check every consumer,
because a direct `[EventGridTrigger]` is the exception worth showing, not the rule.

Published events must be **readable in the diagram**, by their exact type names. A reader
looking for `DocumentCreatedEvent` has to find that string, so:

- name the broker and its topic on the node (`Azure Event Grid` / `tópico CB:EventGrid:Horus`);
- put the count on the edge (`publica 20 eventos`) so the reader knows where to look;
- give each aggregate its own conclusion card listing **every** event verbatim —
  `DocumentCreatedEvent`, never `Created`. Event type names are code identifiers: abbreviating
  them breaks the invariant above and makes them unsearchable in the viewer.

Draw one edge per aggregate only when there are two or three; with more, a single edge
carrying the total plus one card per aggregate reads better.
`summary.publishedEvents.aggregates` already gives you that grouping.

Aggregation applies to nodes and edges, never to the facts. A service publishing seventy
events still gets one broker node and one edge — twelve primary nodes remains the ceiling —
but the seventy names belong in the cards, grouped by aggregate. Collapse the drawing, not
the vocabulary.
Reuse the discovery evidence as `components[].sources` so every node links to the code it
stands for.

State what you left out. A diagram that hides an infrastructure participant because it did
not fit must say so in a card or in the reply, never silently.

## Desktop composition

The viewer is a first-screen artifact, not a shallow strip. Author enough vertical rhythm
that the diagram and its conclusion cards fill a desktop screen as a balanced whole. Never
fake a pass with `overflow: hidden`, clipped content, an internal scroller, stretched SVG
height or smaller typography.
