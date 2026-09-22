# Publishing

## What the transform does

The engine emits a standalone document; the Artifact host supplies its own
`<!doctype html><head>…</head><body>` skeleton. `lib/to-artifact.mjs` therefore:

- strips the document shell and re-applies the `<html>`/`<body>` attributes at runtime;
- drops `data-theme` from the root — the host stamps the viewer's theme and the viewer's
  own pre-paint script resolves it again, so both toggles keep working;
- hoists the `<title>` to the top so the host finds it inside the first 8 KB it scans;
- drops the duplicate charset and viewport metas;
- injects the downloads bridge (below);
- fails loudly rather than publishing a broken page: no `<title>`, no `<head>`/`<body>`
  boundaries, or over 15 MB.

The output is self-contained — fonts and icons are inlined, nothing is fetched — so the
Artifact CSP, which blocks every external stylesheet, image and fetch, changes nothing.
The receipt lists `externalReferences`; it must stay empty.

## Downloads

The sandbox makes a page's own `<a download>` and script-driven saves inert, which would
kill the viewer's PNG/JPEG/WebP/SVG/WebM exports. The injected bridge overrides
`HTMLAnchorElement.prototype.click` for blob URLs and routes them to
`claude.use("downloads").save({filename, data})`, falling back to a toast when the
capability is absent. It only works if the publish declares:

```json
{"capabilities": {"downloads": true}}
```

Always pass it. Every format the viewer exports is on the host's extension allowlist.

## Publishing rules

- Publish `<out>.artifact.html`, never `<out>.html`.
- Keep the engine's `<title>`; do not hand-edit the generated page.
- First publish needs a `favicon` (one or two emoji) and a one-sentence `description`.
  Redeploys omit both — the artifact keeps them.
- Re-deliver then republish the same `file_path` to keep the URL. From a later session,
  find the URL with `action: "list"` and pass it as `url`, after reading it first.
- `capabilities` must be restated on every publish that still needs downloads: a
  non-empty object is a full-set declaration, and omitting the field carries the stored
  one forward.

## Known limits

- ~800 KB per page — well inside the 16 MB cap, but do not publish several diagrams as
  supporting files of one page.
- `localStorage` is per-viewer and may be unavailable; the viewer already guards it, so
  theme and preset choices simply do not persist for some viewers.
- The standalone `<out>.html` keeps its delivery receipt intact: source links are injected
  into the artifact copy only, so the engine's SHA-256 receipt stays truthful.
- Source links are derived from the repository's `origin` remote at delivery time. A
  repository with no origin, or one whose remote is not an HTTP(S)/SSH address, publishes
  without links rather than guessing one.
