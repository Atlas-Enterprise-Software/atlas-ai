import { spawnSync } from 'node:child_process';
import path from 'node:path';

const AZURE_SSH = /^ssh:\/\/git@(?:ssh\.)?(dev\.azure\.com|[\w-]+\.visualstudio\.com)\/v3\/(.+)$/i;

function encodePath(segments) {
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

/**
 * Rewrites a Git remote into the repository's web address: credentials removed,
 * SSH transports mapped to HTTPS, and the Azure DevOps `v3` SSH layout mapped to
 * its `_git` web layout.
 * @param {string} remote
 * @returns {string|null}
 */
export function webUrlFromRemote(remote) {
  const raw = String(remote || '').trim();
  if (!raw) return null;

  const scp = /^([\w.-]+)@([^/:]+):(.+)$/.exec(raw);
  const expanded = scp ? `ssh://${scp[1]}@${scp[2]}/${scp[3].replace(/^\/+/, '')}` : raw;

  const azure = AZURE_SSH.exec(expanded);
  if (azure) {
    const segments = azure[2].replace(/\.git$/i, '').split('/').filter(Boolean);
    if (segments.length < 3) return null;
    const repository = segments.pop();
    return `https://${azure[1].toLowerCase()}/${encodePath(segments)}/_git/${encodeURIComponent(repository)}`;
  }

  let url;
  try {
    url = new URL(expanded);
  } catch {
    return null;
  }
  if (!/^(https?|ssh):$/.test(url.protocol)) return null;

  const segments = url.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (!segments.length) return null;
  segments[segments.length - 1] = segments[segments.length - 1].replace(/\.git$/i, '');

  return `https://${url.hostname.toLowerCase()}/${segments.join('/')}`;
}

/**
 * Resolves the commit a diagram is built from. Diagrams track the integration
 * branch, so the default is `main` and the returned `ref` is what source links
 * point at, while `sha` is what the engine verifies blobs against.
 * @param {string} repoRoot
 * @param {string} [ref]
 * @returns {{ ref: string, sha: string, resolvedFrom: string }|null}
 */
export function resolveRevision(repoRoot, ref = 'main') {
  const root = path.resolve(repoRoot);
  for (const candidate of [`origin/${ref}`, ref, 'origin/HEAD', 'HEAD']) {
    const result = spawnSync('git', ['-C', root, 'rev-parse', candidate], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.error || result.status !== 0) continue;
    const sha = result.stdout.trim();
    if (/^[0-9a-f]{40}$/i.test(sha)) return { ref, sha, resolvedFrom: candidate };
  }
  return null;
}

/**
 * Reads the web address of a repository's `origin` remote.
 * @param {string} repoRoot
 * @returns {{ url: string, remote: string }|null}
 */
export function resolveOrigin(repoRoot) {
  const result = spawnSync('git', ['-C', path.resolve(repoRoot), 'remote', 'get-url', 'origin'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) return null;

  const remote = result.stdout.trim();
  const url = webUrlFromRemote(remote);
  return url ? { url, remote } : null;
}

/**
 * The working tree a path belongs to, so a diagram that declares source evidence
 * finds its own checkout without the caller naming it.
 * @param {string} from
 * @returns {string|null}
 */
export function resolveRepoRoot(from) {
  const result = spawnSync('git', ['-C', path.resolve(from), 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) return null;
  const root = result.stdout.trim();
  return root ? path.normalize(root) : null;
}

/**
 * The `meta.repository` block for a spec, ready to paste: the web address of the
 * checkout's own origin and the commit `main` currently points at.
 * @param {string} from
 * @param {string} [ref]
 * @returns {{ repository: { url: string, revision: string, link_mode: string }, root: string, remote: string, resolvedFrom: string }|null}
 */
export function repositoryBlock(from, ref = 'main') {
  const root = resolveRepoRoot(from);
  if (!root) return null;
  const origin = resolveOrigin(root);
  const revision = resolveRevision(root, ref);
  if (!origin || !revision) return null;
  return {
    repository: { url: origin.url, revision: revision.sha, link_mode: 'local-only' },
    root,
    remote: origin.remote,
    resolvedFrom: revision.resolvedFrom,
  };
}
