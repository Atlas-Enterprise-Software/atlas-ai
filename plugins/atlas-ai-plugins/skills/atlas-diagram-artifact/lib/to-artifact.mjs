import fs from 'node:fs';
import path from 'node:path';
import { applyForgeLinks } from './forge-links.mjs';

const MAX_ARTIFACT_BYTES = 15 * 1024 * 1024;
const TITLE_SCAN_BYTES = 8 * 1024;

/**
 * Parses the double-quoted attributes of a raw start-tag body.
 * @param {string} raw
 * @returns {Record<string, string>}
 */
function parseAttributes(raw) {
  const attributes = {};
  for (const match of raw.matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/g)) attributes[match[1]] = match[2];
  return attributes;
}

function fail(message) {
  const error = new Error(message);
  error.code = 'ARTIFACT_CONVERSION_FAILED';
  throw error;
}

/**
 * Converts a standalone archify document into an Artifact page body.
 * The Artifact host supplies `<!doctype html><head>…</head><body>`, so the
 * document shell is removed and its `<html>`/`<body>` attributes are re-applied
 * at runtime. `data-theme` is dropped: the host stamps it for the viewer theme
 * and the viewer's own pre-paint script resolves it again.
 * @param {string} source
 * @returns {{ html: string, title: string, rootAttributes: Record<string, string>, bodyAttributes: Record<string, string>, externalReferences: string[] }}
 */
export function toArtifactHtml(source) {
  const htmlTag = /<html\b([^>]*)>/i.exec(source);
  if (!htmlTag) fail('input has no <html> element; it is not a standalone diagram document');

  const lower = source.toLowerCase();
  const headTag = lower.indexOf('<head');
  const headEnd = lower.indexOf('</head>');
  const bodyTag = lower.indexOf('<body', headEnd);
  const bodyEnd = lower.lastIndexOf('</body>');
  if (headTag < 0 || headEnd < 0 || bodyTag < 0 || bodyEnd < 0) fail('could not locate the <head>/<body> boundaries');

  const headStart = source.indexOf('>', headTag) + 1;
  const bodyStart = source.indexOf('>', bodyTag) + 1;
  const bodyAttributes = parseAttributes(/<body\b([^>]*)>/i.exec(source.slice(bodyTag, bodyStart))?.[1] ?? '');
  const rootAttributes = parseAttributes(htmlTag[1]);
  delete rootAttributes['data-theme'];

  let head = source
    .slice(headStart, headEnd)
    .replace(/\s*<meta\s+charset[^>]*>/gi, '')
    .replace(/\s*<meta\s+name=["']viewport["'][^>]*>/gi, '');
  const body = source.slice(bodyStart, bodyEnd);

  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const title = titleTag ? titleTag[1].trim() : '';
  if (!title) fail('the delivered document has no <title>; the Artifact would be unnamed');
  head = head.replace(titleTag[0], '');

  const downloadsBridge = `<script>
(function () {
  var nativeClick = HTMLAnchorElement.prototype.click;
  var namespace = null;
  var pending = null;

  function resolveNamespace() {
    if (namespace) return Promise.resolve(namespace);
    if (pending) return pending;
    if (!window.claude || typeof window.claude.use !== 'function') return Promise.resolve(null);
    pending = window.claude.use('downloads').then(function (resolved) {
      namespace = resolved;
      return resolved;
    }).catch(function () { return null; });
    return pending;
  }

  function notify(message) {
    var toast = document.createElement('div');
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;'
      + 'max-width:min(92vw,420px);padding:10px 14px;border-radius:8px;font:500 13px/1.4 system-ui,sans-serif;'
      + 'background:rgba(17,24,39,.92);color:#f8fafc;box-shadow:0 6px 24px rgba(0,0,0,.28)';
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 4500);
  }

  HTMLAnchorElement.prototype.click = function () {
    var filename = this.getAttribute('download');
    var href = this.href;
    if (!filename || !href || href.indexOf('blob:') !== 0) return nativeClick.apply(this, arguments);

    resolveNamespace().then(function (downloads) {
      if (!downloads) {
        notify('Export unavailable in this view. Open the standalone diagram file to export.');
        return;
      }
      return fetch(href)
        .then(function (response) { return response.blob(); })
        .then(function (data) { return downloads.save({ filename: filename, data: data }); })
        .catch(function (error) {
          if (error && error.code === 'declined') return;
          notify('Export failed: ' + ((error && error.message) || 'unknown error'));
        });
    });
    return undefined;
  };
})();
</script>`;

  const shell = `<script>
(function () {
  try {
    var root = document.documentElement;
    var rootAttributes = ${JSON.stringify(rootAttributes)};
    for (var name in rootAttributes) root.setAttribute(name, rootAttributes[name]);
    var bodyAttributes = ${JSON.stringify(bodyAttributes)};
    var applyBodyAttributes = function () {
      if (!document.body) return;
      for (var name in bodyAttributes) document.body.setAttribute(name, bodyAttributes[name]);
    };
    if (document.body) applyBodyAttributes();
    else document.addEventListener('DOMContentLoaded', applyBodyAttributes);
  } catch (_) {}
})();
</script>`;

  // Export and Present earn nothing once the diagram is an Artifact: the page is already
  // shareable and the .drawio covers taking it into a document. They are hidden rather
  // than removed because the viewer is a single script block whose lookups are not
  // null-safe — deleting the markup throws and takes the rest of the viewer with it,
  // including the trace-motion button and the source links.
  const prunedControls = `<style>
#btn-present,
.export-wrap,
.diagram-guide-action[data-guide-action="present"] { display: none !important; }
</style>
<script>
(function () {
  // Their shortcuts would otherwise still fire, opening an invisible menu or entering a
  // mode with no visible way back. Typing is left alone.
  document.addEventListener('keydown', function (event) {
    var key = event.key;
    if (key !== 'e' && key !== 'E' && key !== 'f' && key !== 'F') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    var target = event.target;
    if (target && (target.isContentEditable || target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
    event.stopImmediatePropagation();
  }, true);
})();
</script>`;

  const html = `<title>${title}</title>\n${shell}\n${prunedControls}\n${downloadsBridge}\n${head}\n${body}\n`;
  if (html.indexOf('<title>') > TITLE_SCAN_BYTES) fail('the <title> falls outside the first 8KB scanned by the Artifact host');

  const externalReferences = [
    ...new Set([...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/gi)].map((match) => match[1])),
  ];

  return { html, title, rootAttributes, bodyAttributes, externalReferences };
}

/**
 * Converts a delivered diagram file and writes the Artifact-ready page.
 * @param {string} inputPath
 * @param {string} outputPath
 */
export function convertFile(inputPath, outputPath, options = {}) {
  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath);

  let source = fs.readFileSync(resolvedInput, 'utf8');
  let forge = null;
  if (options.repositoryUrl) {
    forge = applyForgeLinks(source, options);
    source = forge.html;
  }

  const result = toArtifactHtml(source);

  const bytes = Buffer.byteLength(result.html, 'utf8');
  if (bytes > MAX_ARTIFACT_BYTES) fail(`the page is ${bytes} bytes; the Artifact limit is ${MAX_ARTIFACT_BYTES}`);

  fs.writeFileSync(resolvedOutput, result.html, 'utf8');
  return {
    source: resolvedInput,
    artifactPath: resolvedOutput,
    title: result.title,
    bytes,
    rootAttributes: result.rootAttributes,
    bodyAttributes: result.bodyAttributes,
    externalReferences: result.externalReferences,
    ...(forge
      ? {
        sourceLinks: {
          repositoryUrl: forge.repositoryUrl,
          from: options.repositoryUrlSource || 'flag',
          linked: forge.linked,
        },
      }
      : {}),
  };
}
