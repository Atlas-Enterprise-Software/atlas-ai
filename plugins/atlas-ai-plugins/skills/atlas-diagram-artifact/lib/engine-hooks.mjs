// Upstream rejects a repository URL whose decoded path segments contain whitespace, which
// discards every Azure DevOps project with a space in its name ("Baviera%20Digital"). The
// fix is applied here, to the loaded module, so the vendored engine stays byte-identical to upstream and
// upgrades on its own. Behavioural rather than textual: it wraps the export instead of
// editing the regex, so an upstream refactor of that check does not silently drop it.
const TARGET = '/renderers/shared/repository-location.mjs';

const PATCH = `
const __SPACE = '-archifySpaceToken-';
const __upstreamParse = parseRepositoryRemote;
parseRepositoryRemote = function (value, options) {
  const direct = __upstreamParse(value, options);
  // Masking the escape keeps the segment check happy; the result is unmasked back, so
  // identity, canonical url and path are exactly what an unpatched engine would produce
  // for a project whose name has no space.
  if (direct || typeof value !== 'string' || !/%20/i.test(value)) return direct;
  const masked = __upstreamParse(value.replace(/%20/gi, __SPACE), options);
  if (!masked) return null;
  return {
    ...masked,
    identity: masked.identity.split(__SPACE).join(' '),
    url: masked.url.split(__SPACE).join('%20'),
    path: masked.path.split(__SPACE).join(' '),
  };
};
`;

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.endsWith(TARGET) || result.format !== 'module') return result;
  return { ...result, source: `${String(result.source)}\n${PATCH}`, shortCircuit: true };
}
