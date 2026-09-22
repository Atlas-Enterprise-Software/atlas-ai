import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const boot = path.join(skillRoot, 'lib', 'engine-boot.mjs');

// The engine ships vendored under engine/, so the whole team renders with one version and a
// fresh clone works. Only the majors this skill was written against are accepted.
export const SUPPORTED_MAJORS = [2];

function manifestOf(root) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return manifest?.name === 'archify' ? manifest : null;
  } catch {
    return null;
  }
}

// The vendored engine wins over any locally installed archify: the team renders with the
// version this plugin shipped and tested. DIAGRAM_ARTIFACT_ENGINE overrides it to try an
// upstream release before vendoring; the remaining roots keep the skill working when it is
// run from a checkout whose engine/ has not been vendored yet.
function* candidateRoots() {
  if (process.env.DIAGRAM_ARTIFACT_ENGINE) yield path.resolve(process.env.DIAGRAM_ARTIFACT_ENGINE);
  yield path.join(skillRoot, 'engine');
  yield path.resolve(skillRoot, '..', 'archify');
  yield path.join(os.homedir(), '.claude', 'skills', 'archify');
  for (let dir = process.cwd(); ;) {
    yield path.join(dir, '.claude', 'skills', 'archify');
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

/**
 * Locates the archify engine this skill renders with.
 * @returns {{root: string, cli: string, version: string, major: number, supported: boolean}}
 * @throws when no engine is found, naming the places searched.
 */
export function resolveEngine() {
  const searched = [];
  for (const root of candidateRoots()) {
    if (searched.includes(root)) continue;
    searched.push(root);
    const manifest = manifestOf(root);
    const cli = path.join(root, 'bin', 'archify.mjs');
    if (!manifest || !fs.existsSync(cli)) continue;
    const major = Number.parseInt(String(manifest.version).split('.')[0], 10);
    return {
      root, cli, version: manifest.version, major, supported: SUPPORTED_MAJORS.includes(major),
    };
  }
  throw new Error(
    'the vendored archify engine was not found under engine/. It ships with this skill, so this\n'
    + '  normally means a partial checkout, or a tree whose engine/ was never vendored.\n'
    + `  looked in:\n${searched.map((entry) => `    ${entry}`).join('\n')}\n`
    + '  run `node tools/update-engine.mjs --apply` from the marketplace repository, or point\n'
    + '  DIAGRAM_ARTIFACT_ENGINE at an archify directory.',
  );
}

/**
 * The child environment that carries the engine patches into the renderer, which
 * `archify.mjs` runs in a node process of its own.
 */
export function engineEnv(base = process.env) {
  const flag = `--import ${pathToFileURL(boot).href}`;
  const existing = base.NODE_OPTIONS ? `${base.NODE_OPTIONS} ` : '';
  return { ...base, NODE_OPTIONS: `${existing}${flag}` };
}

/** Reads a file from the vendored engine, so authoring never hardcodes its layout. */
export function engineFile(relativePath) {
  const { root } = resolveEngine();
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`refusing to read outside the engine: ${relativePath}`);
  if (!fs.existsSync(resolved)) throw new Error(`the vendored engine has no ${relativePath}`);
  return fs.readFileSync(resolved, 'utf8');
}
