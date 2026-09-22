#!/usr/bin/env node
// Acceptance gates for the vendored archify engine. Run after tools/update-engine.mjs
// --apply, and before proposing the version bump.
//
// The skill reaches into the engine's rendered output in ways upstream never promised to
// keep stable, so a version bump is only safe once these pass. A red gate names the exact
// thing that moved.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = path.join(repoRoot, 'plugins', 'atlas-ai-plugins', 'skills', 'atlas-diagram-artifact');
const cli = path.join(skillRoot, 'bin', 'diagram-artifact.mjs');

// The two controls the artifact transform hides. They are hidden rather than deleted
// because the viewer is one script block with non-null-safe lookups, so if these selectors
// stop matching the buttons come back instead of the page breaking.
const HIDDEN_CONTROLS = ['id="btn-present"', 'class="export-wrap"'];

const results = [];
let failed = 0;

function gate(name, check) {
  try {
    const detail = check();
    results.push({ gate: name, ok: true, ...(detail ? { detail } : {}) });
  } catch (error) {
    failed += 1;
    results.push({ gate: name, ok: false, error: error.message });
  }
}

// A command prints more than one JSON document — deliver emits the engine's receipt and
// then the export receipt, and doctor follows its report with the engine's own text — so
// the whole of stdout never parses. Pull out each balanced top-level object instead.
function jsonDocuments(stdout) {
  const documents = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < stdout.length; index += 1) {
    const character = stdout[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') { if (depth === 0) start = index; depth += 1; } else if (character === '}') {
      depth -= 1;
      if (depth === 0 && start > -1) {
        try { documents.push(JSON.parse(stdout.slice(start, index + 1))); } catch { /* not a document */ }
        start = -1;
      }
    }
  }
  return documents;
}

function skill(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', ...options });
  const documents = jsonDocuments(result.stdout || '');
  return { ...result, documents, json: documents[0] ?? null };
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'diagram-artifact-gates-'));

// Everything below runs against the working tree, which happily includes files git is not
// tracking. The repository's .NET .gitignore carries a [Bb]in/ rule that silently dropped
// both CLIs from a commit once: the gates passed locally and the pushed tree could not
// render at all. Assert what is committed, not what is on disk.
gate('every file the skill runs is tracked by git', () => {
  const tracked = new Set(spawnSync('git', ['-C', repoRoot, 'ls-files'], { encoding: 'utf8' })
    .stdout.split('\n').map((line) => line.trim()).filter(Boolean));
  const required = [cli, path.join(skillRoot, 'engine', 'bin', 'archify.mjs')];
  const untracked = required
    .map((file) => path.relative(repoRoot, file).split(path.sep).join('/'))
    .filter((file) => !tracked.has(file));
  if (untracked.length) throw new Error(`git is not tracking ${untracked.join(', ')}; a clone of this commit could not run the skill`);
  const ignored = spawnSync('git', ['-C', repoRoot, 'status', '--ignored', '--short', skillRoot], { encoding: 'utf8' })
    .stdout.split('\n').filter((line) => line.startsWith('!!'));
  if (ignored.length) throw new Error(`.gitignore excludes ${ignored.map((line) => line.slice(3).trim()).join(', ')} from the skill`);
  return `${required.length} entry points tracked, nothing in the skill ignored`;
});

gate('engine resolves and doctor is green', () => {
  const doctor = skill(['doctor'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const report = doctor.json;
  if (!report?.ok) throw new Error(`doctor did not report ok: ${doctor.stdout || doctor.stderr}`);
  if (!report.engine?.supported) throw new Error(`archify ${report.engine?.version} is outside the tested majors`);
  if (report.azureDevOpsSpacePatch !== true) throw new Error('the Azure DevOps space patch no longer applies');
  if (report.drawioContract !== 'intact') throw new Error(`the .drawio contract moved: ${JSON.stringify(report.drawioContract)}`);
  return `archify ${report.engine.version}`;
});

const spec = path.join(workspace, 'smoke.architecture.json');
const out = path.join(workspace, 'smoke.html');

gate('an engine example still delivers', () => {
  const example = skill(['example', 'architecture'], { stdio: ['ignore', 'pipe', 'ignore'] });
  if (!example.stdout) throw new Error('the engine ships no architecture example');
  fs.writeFileSync(spec, example.stdout);
  const delivered = skill(['deliver', 'architecture', spec, out, '--no-source-links']);
  if (delivered.status !== 0) throw new Error(`deliver exited ${delivered.status}: ${delivered.stdout || delivered.stderr}`);
  if (!fs.existsSync(out)) throw new Error('deliver wrote no viewer');
  return `${fs.statSync(out).size} bytes`;
});

gate('both exports carry the graph', () => {
  const artifact = `${out.slice(0, -5)}.artifact.html`;
  const drawio = `${out.slice(0, -5)}.drawio`;
  if (!fs.existsSync(artifact)) throw new Error('no .artifact.html was written');
  if (!fs.existsSync(drawio)) throw new Error('no .drawio was written');
  const vertices = (fs.readFileSync(drawio, 'utf8').match(/<mxCell[^>]+vertex="1"/g) || []).length;
  const edges = (fs.readFileSync(drawio, 'utf8').match(/<mxCell[^>]+edge="1"/g) || []).length;
  if (vertices === 0) throw new Error('the .drawio export has no vertices; the SVG attributes it reads have moved');
  if (edges === 0) throw new Error('the .drawio export has no edges');
  return `${vertices} vertices, ${edges} edges`;
});

gate('the hidden toolbar controls still exist to hide', () => {
  const delivered = fs.readFileSync(out, 'utf8');
  const missing = HIDDEN_CONTROLS.filter((selector) => !delivered.includes(selector));
  if (missing.length) throw new Error(`the viewer no longer emits ${missing.join(', ')}; the artifact transform would stop hiding them`);
  const artifact = fs.readFileSync(`${out.slice(0, -5)}.artifact.html`, 'utf8');
  if (!artifact.includes('#btn-present')) throw new Error('the artifact transform did not inject the control-hiding rule');
  return 'present and export hidden';
});

// The SIL Open Font License requires its text to travel with the font. Upstream embeds
// JetBrains Mono in some builds and not others, so this is checked per update rather than
// assumed. See NOTICE.md.
gate('an embedded font ships its licence', () => {
  const template = path.join(skillRoot, 'engine', 'assets', 'template.html');
  if (!fs.existsSync(template)) throw new Error('the vendored engine has no assets/template.html');
  const embedsFont = fs.readFileSync(template, 'utf8').includes('font/woff2;base64');
  if (!embedsFont) return 'no font embedded';
  const licences = fs.readdirSync(path.join(skillRoot, 'engine', 'assets'))
    .filter((name) => /OFL|LICEN[CS]E/i.test(name));
  if (!licences.length) throw new Error('the template embeds a WOFF2 font but assets/ ships no font licence');
  return `font embedded, licence present (${licences.join(', ')})`;
});

gate('source evidence verifies against this checkout', () => {
  const block = skill(['repository', repoRoot], { stdio: ['ignore', 'pipe', 'ignore'] });
  if (!block.json?.ok) return 'skipped: no resolvable git origin';
  const evidenceSpec = path.join(workspace, 'evidence.architecture.json');
  const diagram = JSON.parse(fs.readFileSync(spec, 'utf8'));
  diagram.meta.repository = block.json.repository;
  diagram.components[1].sources = [{ path: 'plugins/atlas-ai-plugins/plugin.json', label: 'plugin' }];
  fs.writeFileSync(evidenceSpec, JSON.stringify(diagram, null, 2));
  const evidenceOut = path.join(workspace, 'evidence.html');
  const delivered = skill(['deliver', 'architecture', evidenceSpec, evidenceOut, '--repo-root', repoRoot]);
  if (delivered.status !== 0) throw new Error(`deliver with source evidence exited ${delivered.status}: ${delivered.stdout || delivered.stderr}`);
  // The engine's own receipt also has an "artifact" key, so match on the export receipt.
  const linked = delivered.documents
    .find((document) => document.artifact?.sourceLinks)?.artifact.sourceLinks.linked;
  if (!linked) throw new Error('the delivered artifact carries no source links');
  return `${linked} source link(s)`;
});

fs.rmSync(workspace, { recursive: true, force: true });

process.stdout.write(`${JSON.stringify({ ok: failed === 0, failed, gates: results }, null, 2)}\n`);
process.exit(failed === 0 ? 0 : 1);
