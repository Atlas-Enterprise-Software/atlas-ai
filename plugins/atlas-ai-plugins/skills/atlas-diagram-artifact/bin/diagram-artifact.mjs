#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { convertFile as toArtifact } from '../lib/to-artifact.mjs';
import { convertFile as toDrawio } from '../lib/to-drawio.mjs';
import {
  repositoryBlock, resolveOrigin, resolveRepoRoot, resolveRevision,
} from '../lib/repo-origin.mjs';
import { discover } from '../lib/discover.mjs';
import { engineEnv, engineFile, resolveEngine } from '../lib/engine.mjs';

const USAGE = `diagram-artifact - validated diagrams published as Claude Artifacts

  doctor                                    check the vendored archify engine
  schema <type|common>                      the authoring schema, from that engine
  example <type>                            one example spec of that type
  contract                                  the engine's authoring contract
  guide "<scenario>" --json                 pick the diagram type
  brands "<product>" --json                 look up a brand mark
  validate <type> <spec.json>               showcase validation (repair loop)
  deliver <type> <spec.json> <out.html>     final acceptance + both exports
  artifact <delivered.html> [out.html]      re-run only the Artifact transform
  drawio <delivered.html> [out.drawio]      re-run only the draw.io export
  repository [repo-root]                    the meta.repository block, ready to paste
  origin [repo-root]                        the repository's web address
  revision [repo-root] [--link-ref <ref>]   the commit of main, for meta.repository
  discover [repo-root] [--ruleset <id>]     infrastructure participants in code

Source links are on by default and need no flag. A spec that declares
meta.repository is verified against the working tree the command runs in, and
the repository's web address comes from its own origin remote, credentials
stripped and SSH transports mapped to HTTPS. Override only when that is wrong:
  --repo-root <path>     the checkout to verify against (default: this one)
  --repo-url <url>       repository home; also builds per-file links
  --source-url <tpl>     explicit file template for an unknown forge
                         placeholders: {repo} {path} {revision} {line} {endLine}
  --no-source-links      publish without any repository hyperlink
  --link-ref <ref>       branch the file links point at (default: main)

deliver writes three files:
  <out>.html            standalone interactive viewer (local reference)
  <out>.artifact.html   publish THIS one with the Artifact tool
  <out>.drawio          editable mxGraph export for official documents`;

const argv = process.argv.slice(2);
const command = argv[0];

const LOCAL_FLAGS = new Set(['--repo-url', '--source-url', '--link-ref']);
const forgeOptions = {};
const passthrough = [];
let repoRoot = null;
let linkRef = 'main';
let sourceLinksDisabled = false;
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === '--no-source-links') {
    sourceLinksDisabled = true;
    continue;
  }
  if (argv[index] === '--repo-root') repoRoot = argv[index + 1];
  if (!LOCAL_FLAGS.has(argv[index])) {
    passthrough.push(argv[index]);
    continue;
  }
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: `${argv[index]} needs a value` })}
`);
    process.exit(1);
  }
  if (argv[index] === '--repo-url') forgeOptions.repositoryUrl = value;
  else if (argv[index] === '--link-ref') linkRef = value;
  else forgeOptions.sourceTemplate = value;
  index += 1;
}

if (!command || command === '--help' || command === '-h') {
  process.stdout.write(`${USAGE}\n`);
  process.exit(command ? 0 : 2);
}

function applyDerivedOrigin() {
  if (sourceLinksDisabled) {
    delete forgeOptions.repositoryUrl;
    return null;
  }
  // Link to the branch, not to the commit: a diagram tracks main, and a pinned
  // commit link rots. Only claim the branch when git actually resolved it.
  const revision = resolveRevision(repoRoot || process.cwd(), linkRef);
  if (revision && revision.resolvedFrom.endsWith(linkRef)) forgeOptions.linkRef = linkRef;
  if (forgeOptions.repositoryUrl) {
    forgeOptions.repositoryUrlSource = 'flag';
    return null;
  }
  const resolved = resolveOrigin(repoRoot || process.cwd());
  if (!resolved) return null;
  forgeOptions.repositoryUrl = resolved.url;
  forgeOptions.repositoryUrlSource = 'origin';
  return resolved;
}

function sibling(outputPath, suffix) {
  const resolved = path.resolve(outputPath);
  const base = path.basename(resolved, path.extname(resolved));
  return path.join(path.dirname(resolved), `${base}${suffix}`);
}

function emit(receipt) {
  process.stdout.write(`${JSON.stringify({ ok: true, ...receipt }, null, 2)}\n`);
}

function abort(message) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  process.exit(1);
}

function run(converter, input, output, fallbackSuffix) {
  if (!input) abort(`${command} needs a delivered .html path`);
  try {
    emit(converter(input, output || sibling(input, fallbackSuffix), forgeOptions));
  } catch (error) {
    abort(error.message);
  }
  process.exit(0);
}

// The draw.io export reads the engine's rendered SVG, so these attributes are the contract
// between the two. An upstream rename would otherwise cost graph elements in silence.
const SVG_CONTRACT = [
  'data-node-id', 'data-node-kind', 'data-node-label', 'data-node-sublabel', 'data-node-tag',
  'data-edge-id', 'data-edge-from', 'data-edge-to', 'data-edge-label',
  'data-graph-role', 'data-composition-frame-id', 'data-composition-frame-kind',
  'data-composition-frame-label', 'data-composition-points',
];

function engineSources(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const resolved = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(resolved);
      else if (entry.name.endsWith('.mjs')) files.push(fs.readFileSync(resolved, 'utf8'));
    }
  };
  walk(path.join(root, 'renderers'));
  return files.join('\n');
}

// Parsing a spaced Azure DevOps project proves the loader hook reached the engine.
const PATCH_PROBE = `
import { parseRepositoryRemote } from ${JSON.stringify('%URL%')};
const parsed = parseRepositoryRemote('https://dev.azure.com/org/With%20Space/_git/Repo', { authored: true });
process.stdout.write(parsed ? parsed.path : '');
`;

if (command === 'doctor') {
  let engine;
  try {
    engine = resolveEngine();
  } catch (error) {
    abort(error.message);
  }
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e', PATCH_PROBE.replace(
    '%URL%', pathToFileURL(path.join(engine.root, 'renderers', 'shared', 'repository-location.mjs')).href,
  )], { encoding: 'utf8', env: engineEnv() });
  const rendered = engineSources(engine.root);
  const missing = SVG_CONTRACT.filter((attribute) => !rendered.includes(attribute));
  const report = {
    engine: { root: engine.root, version: engine.version, supported: engine.supported },
    azureDevOpsSpacePatch: probe.stdout?.trim() === 'org/With Space/_git/Repo',
    drawioContract: missing.length === 0 ? 'intact' : { missing },
  };
  if (!engine.supported) report.warning = `archify ${engine.version} is outside the tested majors (${[2]}); re-check the exports`;
  if (!report.azureDevOpsSpacePatch) report.error = 'the Azure DevOps space patch did not apply; repositories under a project with a space in its name will be rejected';
  if (missing.length) report.error = `the engine no longer emits ${missing.join(', ')}; the .drawio export would lose those elements`;
  emit(report);
  const engineDoctor = spawnSync(process.execPath, [engine.cli, 'doctor'], {
    encoding: 'utf8', env: engineEnv(), stdio: 'inherit',
  });
  process.exit(report.error ? 1 : engineDoctor.status ?? 0);
}

if (command === 'schema' || command === 'example' || command === 'contract') {
  try {
    if (command === 'contract') process.stdout.write(engineFile(path.join('references', 'authoring-contract.md')));
    else if (command === 'schema') {
      if (!passthrough[1]) abort('schema needs a type, or "common"');
      process.stdout.write(engineFile(path.join('schemas', `${passthrough[1]}.schema.json`)));
    } else {
      if (!passthrough[1]) abort('example needs a type');
      const examples = path.join(resolveEngine().root, 'examples');
      const match = fs.readdirSync(examples).find((name) => name.endsWith(`.${passthrough[1]}.json`));
      if (!match) abort(`the vendored engine ships no ${passthrough[1]} example`);
      process.stdout.write(fs.readFileSync(path.join(examples, match), 'utf8'));
    }
  } catch (error) {
    abort(error.message);
  }
  process.exit(0);
}

if (command === 'discover') {
  const ruleIndex = passthrough.indexOf('--ruleset');
  try {
    emit(discover(passthrough[1] && !passthrough[1].startsWith('--') ? passthrough[1] : process.cwd(), {
      ruleset: ruleIndex > 0 ? passthrough[ruleIndex + 1] : undefined,
    }));
  } catch (error) {
    abort(error.message);
  }
  process.exit(0);
}

if (command === 'revision') {
  const resolved = resolveRevision(
    passthrough[1] && !passthrough[1].startsWith('--') ? passthrough[1] : process.cwd(),
    linkRef,
  );
  if (!resolved) abort('could not resolve a revision; is this a git repository?');
  emit(resolved);
  process.exit(0);
}

if (command === 'repository') {
  const resolved = repositoryBlock(passthrough[1] || process.cwd(), linkRef);
  if (!resolved) abort('could not resolve a repository block; is this a git checkout with an origin remote?');
  emit(resolved);
  process.exit(0);
}

if (command === 'origin') {
  const resolved = resolveOrigin(passthrough[1] || process.cwd());
  if (!resolved) abort('no usable origin remote found; pass --repo-url explicitly');
  emit(resolved);
  process.exit(0);
}

// Locating the checkout is not the author's job. The spec already names the
// repository and the command runs inside it, so a diagram that declares source
// evidence gets verified by default instead of failing on a missing flag.
function adoptWorkingCheckout() {
  if (repoRoot || sourceLinksDisabled) return;
  if (command !== 'validate' && command !== 'deliver') return;
  if (passthrough[1] !== 'architecture') return;
  const spec = passthrough[2];
  if (!spec || spec.startsWith('--')) return;
  let declared;
  try {
    declared = JSON.parse(fs.readFileSync(path.resolve(spec), 'utf8'))?.meta?.repository;
  } catch {
    return;
  }
  if (!declared?.url) return;
  const root = resolveRepoRoot(process.cwd());
  if (!root) return;
  repoRoot = root;
  passthrough.push('--repo-root', root);
}

adoptWorkingCheckout();
applyDerivedOrigin();

if (command === 'artifact') run(toArtifact, passthrough[1], passthrough[2], '.artifact.html');
if (command === 'drawio') run(toDrawio, passthrough[1], passthrough[2], '.drawio');

const engineArgs = [...passthrough];
const isAcceptance = command === 'validate' || command === 'deliver';
if (isAcceptance && !engineArgs.includes('--quality')) engineArgs.push('--quality', 'showcase');
if (isAcceptance && !engineArgs.includes('--json')) engineArgs.push('--json');

let engineCli;
try {
  ({ cli: engineCli } = resolveEngine());
} catch (error) {
  abort(error.message);
}

const engine = spawnSync(process.execPath, [engineCli, ...engineArgs], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
  env: engineEnv(),
});

if (engine.stdout) process.stdout.write(engine.stdout);
if (engine.status !== 0) process.exit(engine.status ?? 1);

if (command === 'deliver') {
  const output = engineArgs.slice(1).filter((value) => !value.startsWith('--'))[2];
  if (!output) abort('deliver needs <type> <spec.json> <out.html>');
  const exports_ = {};
  try {
    exports_.artifact = toArtifact(output, sibling(output, '.artifact.html'), forgeOptions);
  } catch (error) {
    abort(`delivery succeeded but the Artifact transform failed: ${error.message}`);
  }
  try {
    exports_.drawio = toDrawio(output, sibling(output, '.drawio'));
  } catch (error) {
    exports_.drawio = { error: error.message };
  }
  emit(exports_);
}

process.exit(0);
