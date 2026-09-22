#!/usr/bin/env node
// Re-vendors the archify engine that the diagram-artifact skill renders with.
//
// The skill ships the engine rather than depending on an installed copy, so the whole
// team runs one version. That only works if updating is automatic and gated, which is what
// this script is: resolve upstream, verify what was downloaded, replace engine/, and let
// tools/verify-engine.mjs decide whether the result is acceptable.
//
// Two tracks, recorded in engine.lock.json so the checker follows the same one:
//
//   channel:<name>   a published release, verified against the manifest's sha256
//   ref:<git ref>    a commit of the upstream repository, pinned by commit sha
//
// We track ref:main today because Azure DevOps repositories are only supported on
// unreleased upstream main: release v2.16.0 hardcodes a GitHub-only URL pattern in
// architecture.schema.json and has no link_mode. Switch to channel:stable once upstream
// ships 2.17.
//
//   node tools/update-engine.mjs                  report whether an update is pending
//   node tools/update-engine.mjs --apply          update along the tracked source
//   node tools/update-engine.mjs --apply --track ref:main
//   node tools/update-engine.mjs --apply --track channel:stable
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = path.join(repoRoot, 'plugins', 'atlas-ai-plugins', 'skills', 'atlas-diagram-artifact');
const engineRoot = path.join(skillRoot, 'engine');
const lockFile = path.join(skillRoot, 'engine.lock.json');

const REPOSITORY = 'tt-a1i/archify';
const DEFAULT_TRACK = 'ref:main';

// Upstream ships a few files the vendored copy must not keep. Everything else stays:
// deliver runs scripts/check-render-output.mjs as its final gate, and the engine's own
// doctor looks for the rendered examples, so pruning those breaks rendering.
//   SKILL.md           would register a second, competing skill inside this plugin
//   skill-release.json  would point the update notifier at a copy nobody installed
//   scripts/check-update.mjs  the update notifier itself; this script replaces it
const PRUNE = ['SKILL.md', 'skill-release.json', 'test', 'package-lock.json', path.join('scripts', 'check-update.mjs')];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Extractors run inside the staging directory with a bare filename: a Windows path such
// as C:\… reads as a remote host to GNU tar, and quoting does not help.
function run(command, args, cwd) {
  const result = spawnSync(command, args, { encoding: 'utf8', cwd });
  if (result.status !== 0) fail(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

// A scheduled job should not fail on a blip reaching GitHub.
async function get(url, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'atlas-ai-marketplace' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      if (attempt === attempts) fail(`could not reach ${url} after ${attempts} attempts: ${error.message}`);
      await new Promise((resolve) => { setTimeout(resolve, attempt * 2000); });
    }
  }
}

function readLock() {
  try {
    return JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  } catch {
    return null;
  }
}

/** Resolves what upstream currently offers on the tracked source. */
async function resolveUpstream(track) {
  if (track.startsWith('channel:')) {
    const channel = track.slice('channel:'.length);
    const manifest = await (await get(`https://tt-a1i.github.io/archify/skill-updates/archify/${channel}.json`)).json();
    return {
      track,
      identity: manifest.artifact?.sha256,
      version: manifest.version,
      ref: manifest.source.ref,
      url: `https://github.com/${REPOSITORY}/releases/download/${manifest.source.ref}/archify.zip`,
      archive: 'zip',
      sha256: manifest.artifact?.sha256,
      releaseNotes: manifest.releaseNotes,
      severity: manifest.severity,
    };
  }
  if (!track.startsWith('ref:')) fail(`unknown track "${track}"; expected channel:<name> or ref:<git ref>`);
  const ref = track.slice('ref:'.length);
  const commit = await (await get(`https://api.github.com/repos/${REPOSITORY}/commits/${ref}`)).json();
  if (!commit?.sha) fail(`could not resolve ${REPOSITORY}@${ref}`);
  const manifest = await (await get(`https://raw.githubusercontent.com/${REPOSITORY}/${commit.sha}/archify/package.json`)).json();
  return {
    track,
    identity: commit.sha,
    version: manifest.version,
    ref,
    commit: commit.sha,
    url: `https://codeload.github.com/${REPOSITORY}/tar.gz/${commit.sha}`,
    archive: 'tar',
    committedAt: commit.commit?.committer?.date,
  };
}

function prune(root) {
  for (const entry of PRUNE) fs.rmSync(path.join(root, entry), { recursive: true, force: true });
}

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const trackIndex = argv.indexOf('--track');
const lock = readLock();
const track = trackIndex > -1 ? argv[trackIndex + 1] : lock?.track ?? DEFAULT_TRACK;

const upstream = await resolveUpstream(track);

if (lock?.track === track && lock?.identity === upstream.identity) {
  process.stdout.write(`${JSON.stringify({ ok: true, status: 'current', track, version: lock.version }, null, 2)}\n`);
  process.exit(0);
}

if (!apply) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    status: 'update_available',
    track,
    vendored: lock ? { version: lock.version, identity: lock.identity } : null,
    available: { version: upstream.version, identity: upstream.identity, committedAt: upstream.committedAt },
    releaseNotes: upstream.releaseNotes,
    severity: upstream.severity,
  }, null, 2)}\n`);
  process.exit(0);
}

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-vendor-'));
const archive = path.join(staging, upstream.archive === 'zip' ? 'archify.zip' : 'archify.tar.gz');

// A ref: download is the whole upstream repository (~19MB for a ~6MB engine), so a slow
// link makes this the long pole. --archive reuses one already on disk, which also lets a
// failed run be retried without fetching again.
const suppliedIndex = argv.indexOf('--archive');
if (suppliedIndex > -1) fs.copyFileSync(path.resolve(argv[suppliedIndex + 1]), archive);
else fs.writeFileSync(archive, Buffer.from(await (await get(upstream.url)).arrayBuffer()));

const digest = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
if (upstream.sha256) {
  // A published release carries its own digest, so a tampered or truncated download never
  // reaches the tree. A commit pin has no published digest: the commit sha is the pin, and
  // this digest only records what was fetched.
  if (digest !== upstream.sha256) {
    fail(`digest mismatch for ${upstream.ref}\n  expected ${upstream.sha256}\n  got      ${digest}`);
  }
}

let unpacked;
if (upstream.archive === 'zip') {
  run('unzip', ['-q', path.basename(archive)], staging);
  unpacked = path.join(staging, 'archify');
} else {
  run('tar', ['-xzf', path.basename(archive)], staging);
  const top = fs.readdirSync(staging).find((name) => name.startsWith('archify-'));
  if (!top) fail('the tarball has no archify- directory');
  unpacked = path.join(staging, top, 'archify');
}

if (!fs.existsSync(path.join(unpacked, 'bin', 'archify.mjs'))) fail('the downloaded tree has no bin/archify.mjs');
if (!fs.existsSync(path.join(unpacked, 'LICENSE'))) fail('the downloaded tree has no LICENSE; it must ship with the vendored engine');

prune(unpacked);
fs.rmSync(engineRoot, { recursive: true, force: true });
fs.cpSync(unpacked, engineRoot, { recursive: true });
fs.rmSync(staging, { recursive: true, force: true });

fs.writeFileSync(lockFile, `${JSON.stringify({
  repository: `https://github.com/${REPOSITORY}`,
  track,
  identity: upstream.identity,
  version: upstream.version,
  ref: upstream.ref,
  ...(upstream.commit ? { commit: upstream.commit, committedAt: upstream.committedAt } : {}),
  archiveSha256: digest,
  verifiedAgainstPublishedDigest: Boolean(upstream.sha256),
  vendoredAt: new Date().toISOString(),
}, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({
  ok: true,
  status: 'vendored',
  track,
  version: upstream.version,
  from: lock?.version ?? null,
  next: 'run the acceptance gates: node tools/verify-engine.mjs',
}, null, 2)}\n`);
