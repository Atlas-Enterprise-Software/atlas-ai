---
name: atlas-diagram-artifact
description: Create validated architecture, workflow, sequence, data-flow and lifecycle diagrams, always published as an interactive Claude Artifact, with an editable draw.io export for official documents and verified links from each component to its source code. Use when the user asks to visualize, document or share system architecture, infrastructure, cloud/security/network topology, technical workflows, API call sequences, request lifecycles, data pipelines, ETL/ELT, data lineage or state machines, to convert or beautify Mermaid, or says "diagrama", "haz un diagrama", "diagrama de arquitectura", "visualiza la arquitectura", "diagrama de secuencia", "diagrama compartible", "pásalo a draw.io".
version: 1.2.0
---

# atlas-diagram-artifact

Author a small typed JSON specification, render it with the bundled engine, and publish
the result as an Artifact. Every diagram ends as a link the user can open and share.

## Defaults — never ask for these

Apply them unasked; the user only ever has to say what to draw.

- **The repository is the working directory.** When the user names no repository, the
  diagram is about the checkout the command runs in. Name the repositories only when the
  subject spans several, and resolve each one's path before authoring.
- **Source links are on.** Every architecture diagram of real code declares
  `meta.repository` and carries `components[].sources`, so clicking a component opens its
  code. Drop them only when the user asks, or when the code is not on disk — then say so.
- **The infrastructure is in scope.** Queues, blob containers, topics, databases, hubs,
  consumed domains and published events belong in the diagram by default. Narrow only on
  an explicit request, and state in the reply what the narrowing left out.

## Pipeline

Run every command through `bin/diagram-artifact.mjs`; never call the engine directly. Paths
below are relative to this skill's directory. The rendering engine is archify, vendored
under `engine/` — see [NOTICE.md](NOTICE.md).

1. **Pick the type** — `architecture`, `workflow`, `sequence`, `dataflow`, `lifecycle`.
   See the router in [references/AUTHORING.md](references/AUTHORING.md). When ambiguous:
   `node bin/diagram-artifact.mjs guide "<scenario>" --json`.
2. **Inventory the code first when the diagram must reflect a real repository:**
   ```bash
   node bin/diagram-artifact.mjs discover <repo-root>
   ```
   It reports, with `path`/`line` evidence, the infrastructure participants a real
   architecture diagram has to show: published domain events, blob/file storage,
   databases and caches, queues, topics and buses, hubs, consumed domains, entry points
   and platform services. Treat every finding as a candidate — open the evidence and
   confirm the wiring before drawing it — and reuse it as `components[].sources`.
   The mapping from concern to component type is in
   [references/AUTHORING.md](references/AUTHORING.md).
3. **Take the repository block** for an architecture diagram of real code:
   ```bash
   node bin/diagram-artifact.mjs repository <repo-root>
   ```
   It returns `meta.repository` ready to paste — origin web address, the commit `main`
   points at, `link_mode: "local-only"` — so the authored identity matches what the engine
   verifies. Paste it; do not hand-write the url or the revision.
4. **Author the candidate.** Read the schema and one example for field shape only — never
   copy its facts:
   ```bash
   node bin/diagram-artifact.mjs schema <type>      # and: schema common
   node bin/diagram-artifact.mjs example <type>
   ``` Write the candidate JSON before reading anything
   else. Set `meta.quality_profile: "showcase"`. Follow the invariants in
   [references/AUTHORING.md](references/AUTHORING.md).
5. **Validate and repair** until clean:
   ```bash
   node bin/diagram-artifact.mjs validate <type> <candidate.json>
   ```
   Showcase acceptance is 9/9 artifact checks, 0 errors, 0 warnings. Fix only the
   diagnosed `subject`, choose from `supportedFixes`, and rerun. Stop and report
   truthfully when two consecutive rounds do not lower the error count.
6. **Deliver** — one command, three files:
   ```bash
   node bin/diagram-artifact.mjs deliver <type> <candidate.json> <out.html>
   ```
   - `<out>.html` — standalone viewer, byte-frozen with a SHA-256 receipt.
   - `<out>.artifact.html` — the page to publish. Never publish `<out>.html`.
   - `<out>.drawio` — editable mxGraph export.

   A non-zero exit is never success. Write outputs to the scratchpad directory unless
   the user names a location.
7. **Publish — mandatory, never optional.** Call the Artifact tool with
   `file_path` = `<out>.artifact.html`. No capabilities are needed: the artifact hides the
   viewer's Export and Present controls, because the page is already shareable and the
   `.drawio` covers taking it into a document. The page is engine-generated: never hand-edit it,
   and keep the `<title>` the engine produced. To update a diagram, re-deliver and
   republish the same file path (same URL); pass `url` for an artifact from an earlier
   session.

## draw.io export

`deliver` always writes `<out>.drawio`: real mxGraph vertices and edges with the rendered
geometry, orthogonal waypoints, semantic colors and boundary frames — editable, not an
image. Hand the user both links: the Artifact for exploring and sharing, the `.drawio` for
official documents. Regenerate on its own with
`node bin/diagram-artifact.mjs drawio <out.html>`.

Nodes that name a product carry its real draw.io stencil — Event Grid, Cosmos DB, Blob
Storage, SignalR, Entra ID and the rest of `drawio/icons.json`. A rule matches the node's
label, plus its sublabel only when the node is infrastructure, so a backend whose sublabel
reads "Cosmos + Blob" does not borrow the icon of the stores it uses. The receipt reports
`iconed`; add a rule to that file for a product it does not know yet, taking the style
string from the draw.io shape library rather than guessing a URL. Cards, guided chapters
and source links stay in the Artifact: the export carries the graph, not the narrative.

## Source links (architecture only)

Every component links to the code it represents. This is the default, not a feature to
offer: a diagram of real code whose nodes do not open the code is a worse diagram.
Verification is local and reads blobs at a pinned commit, so it needs the repository on
disk — if it is not, say so in the reply instead of publishing a diagram that looks linked.

```bash
node bin/diagram-artifact.mjs repository <local repo>   # the whole meta.repository block
node bin/diagram-artifact.mjs deliver architecture spec.json out.html
```

No flag is needed. A spec that declares `meta.repository` is verified against the working
tree the command runs in; pass `--repo-root <path>` only when the diagram is about a
checkout elsewhere, which is the normal case for a multi-repository diagram.

Diagrams always describe `main`: `repository` reads `origin/main` for the revision. Links
point at the branch, not at that commit, so they survive new commits; `--link-ref <ref>`
changes the branch.

The web address comes from the repository's own `origin` remote — credentials stripped,
SSH mapped to HTTPS, Azure DevOps `v3` SSH mapped to its `_git` layout — so nothing is
hardcoded per organization and GitHub, GitLab, Bitbucket and Azure DevOps all work.
Override with `--repo-url` only when the origin is not the address readers should follow;
`--source-url "<template>"` handles an unrecognized forge; `--no-source-links` publishes
without any repository hyperlink. `origin` and `revision` return the two halves separately
when you need only one.

Declare `meta.repository` (`url`, 40-character `revision`, `link_mode: "local-only"`) and
`components[].sources` with repository-relative `path` and optional `line`/`end_line`/
`label`. Clicking a component then opens its passport — kind, context, tag, id — with the
verified file links. Record only evidence you verified: the engine reads the local Git
objects at that commit and never contacts the remote, so the links assert neither that the
commit was pushed nor that the reader has access.

## Reporting back

Give the user: the Artifact URL, the `.drawio` path, the diagram type, the validation
summary (checks passed, errors, warnings), and the source-link count when used. Never
claim a visual review you did not perform.

See [references/PUBLISHING.md](references/PUBLISHING.md) for the Artifact transform,
sandbox limits and update rules, and [references/AUTHORING.md](references/AUTHORING.md)
for the type router, Mermaid intake and composition invariants.
