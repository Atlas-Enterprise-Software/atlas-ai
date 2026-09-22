const PAYLOAD_ID = 'archify-source-evidence-data';

const TEMPLATES = [
  {
    match: /(^|\/\/)(dev\.azure\.com|[\w-]+\.visualstudio\.com)\//i,
    source: '{repo}?path=/{path}&version={azureVersion}{lineFragment}&_a=contents',
    line: '&line={line}&lineEnd={lineEnd}&lineStartColumn=1&lineEndColumn=1',
  },
  {
    match: /(^|\/\/)github\.com\//i,
    source: '{repo}/blob/{revision}/{path}{lineFragment}',
    line: '#L{line}',
  },
  {
    match: /(^|\/\/)gitlab\./i,
    source: '{repo}/-/blob/{revision}/{path}{lineFragment}',
    line: '#L{line}',
  },
  {
    match: /(^|\/\/)bitbucket\./i,
    source: '{repo}/src/{revision}/{path}{lineFragment}',
    line: '#lines-{line}',
  },
];

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (values[key] === undefined ? '' : String(values[key])));
}

/**
 * Resolves the forge templates for a repository URL.
 * @param {string} repositoryUrl
 * @param {string} [sourceTemplate] explicit override, with {repo} {path} {revision} {line} {endLine} placeholders
 */
export function resolveForge(repositoryUrl, sourceTemplate) {
  if (sourceTemplate) return { source: sourceTemplate, line: '' };
  return TEMPLATES.find((candidate) => candidate.match.test(repositoryUrl)) || null;
}

/**
 * Adds forge hyperlinks to a delivered document whose repository evidence was
 * verified in `local-only` mode. The engine verifies the paths, revision and
 * line ranges; this only supplies the href an unsupported forge cannot build,
 * so an unverified document is never linked.
 * @param {string} html
 * @param {{ repositoryUrl: string, sourceTemplate?: string, linkRef?: string }} options
 * @returns {{ html: string, linked: number, repositoryUrl: string }}
 */
export function applyForgeLinks(html, options) {
  const repositoryUrl = String(options.repositoryUrl || '').replace(/\/+$/, '');
  if (!repositoryUrl) throw new Error('a repository URL is required to build forge links');

  const start = html.indexOf(`id="${PAYLOAD_ID}"`);
  if (start < 0) return { html, linked: 0, repositoryUrl };
  const open = html.indexOf('>', start) + 1;
  const close = html.indexOf('</script>', open);
  if (open <= 0 || close < 0) return { html, linked: 0, repositoryUrl };

  let payload;
  try {
    payload = JSON.parse(html.slice(open, close));
  } catch {
    return { html, linked: 0, repositoryUrl };
  }
  if (!payload || payload.verified !== true || !payload.repository || !payload.nodes) {
    return { html, linked: 0, repositoryUrl };
  }

  const forge = resolveForge(repositoryUrl, options.sourceTemplate);
  if (!forge) throw new Error(`no source-link template known for ${repositoryUrl}; pass --source-url`);

  const revision = payload.repository.revision;
  const ref = options.linkRef || revision;
  const azureVersion = options.linkRef ? `GB${options.linkRef}` : `GC${revision}`;
  payload.repository.href = options.linkRef
    ? `${repositoryUrl}?version=GB${options.linkRef}`
    : repositoryUrl;

  let linked = 0;
  for (const sources of Object.values(payload.nodes)) {
    if (!Array.isArray(sources)) continue;
    for (const source of sources) {
      const lineFragment = source.line
        ? fill(forge.line, { line: source.line, lineEnd: source.endLine || source.line })
        : '';
      source.href = fill(forge.source, {
        repo: repositoryUrl,
        path: source.path.split('/').map(encodeURIComponent).join('/'),
        revision: ref,
        azureVersion,
        line: source.line || '',
        endLine: source.endLine || source.line || '',
        lineFragment,
      });
      linked += 1;
    }
  }

  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
  return { html: html.slice(0, open) + serialized + html.slice(close), linked, repositoryUrl };
}
