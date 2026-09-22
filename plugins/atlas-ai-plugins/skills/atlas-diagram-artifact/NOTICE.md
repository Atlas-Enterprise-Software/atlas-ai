# Third-party notices

`engine/` is a vendored copy of **archify**, re-vendored by `tools/update-engine.mjs`.
The exact release is recorded in `engine.lock.json`. This plugin is mirrored to a public
GitHub repository, so everything below is redistributed in the open.

## archify — MIT

Copyright (c) 2026 tt-a1i (Archify)
Copyright (c) 2025 Cocoon AI (original "architecture-diagram-generator")

Full text in `engine/LICENSE`, which must ship with the vendored tree. Upstream:
<https://github.com/tt-a1i/archify>.

Nothing under `engine/` is modified. The one behaviour this skill needs to differ —
Azure DevOps rejects a project name containing a space, such as `Baviera%20Digital` or
`Atlas%20PoCs` — is applied at load time by `lib/engine-hooks.mjs` instead of by editing
the source, so the vendored copy stays byte-identical to the published release.

## Brand marks — Simple Icons, and four under CC BY 4.0

`engine/renderers/shared/generated-brand-marks.mjs` embeds 107 vector logos generated from
**Simple Icons 16.28.0** (<https://simpleicons.org>). Simple Icons releases its collection
under CC0-1.0, which asks for nothing.

Four of the embedded marks carry **CC BY 4.0** upstream and therefore do require
attribution when redistributed:

- Angular
- Jenkins
- Rust
- Vue.js

Each mark records its own `provenance` (provider, version, source URL) in that file, and
upstream's own [`engine/THIRD_PARTY_NOTICES.md`](engine/THIRD_PARTY_NOTICES.md) ships
alongside it with the full statement.

Simple Icons' licence covers the collection work, not the underlying trademarks. Brand
names and logos remain the property of their owners; they appear here to identify the
products a diagram depicts, which is nominative use.

## Fonts

The vendored engine embeds **JetBrains Mono** as base64 WOFF2 inside
`engine/assets/template.html`, so a diagram renders identically on a machine that does not
have the font. It is licensed under the **SIL Open Font License 1.1**, whose text ships
beside it in `engine/assets/JetBrainsMono-OFL.txt`.

The OFL requires that licence to travel with the font, and forbids selling the font on its
own. Neither constrains this plugin: the font is redistributed inside a larger work and
nothing here is sold. Earlier archify releases did not embed it at all, so
`tools/update-engine.mjs` never prunes the licence file and `tools/verify-engine.mjs`
fails any update whose template embeds a font without one.

## draw.io stencils

`drawio/icons.json` is this skill's own file. It stores mxGraph *style strings* — shape
identifiers from the draw.io libraries — not image data. The rendered `.drawio` references
those shapes by name; draw.io resolves them from its own bundled stencils.
