import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Run after all checks, against the immutable checkout verified by the workflow.
const commit = process.env.BUILD_COMMIT;
assert.match(commit ?? '', /^[0-9a-f]{40}$/, 'BUILD_COMMIT must be a full commit SHA');
const root = 'dist';
const hash = (data) => createHash('sha256').update(data).digest('hex');
assert(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), 'dist must be a real directory');
function collect(directory) {
  return readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    const stat = lstatSync(path);
    assert(!stat.isSymbolicLink(), 'Public build must not contain symlinks');
    if (stat.isDirectory()) {
      assert(relative(root, path) === 'assets', `Unexpected public directory: ${path}`);
      return collect(path);
    }
    assert(stat.isFile() && stat.nlink === 1, 'Public build must contain only regular, non-linked files');
    return [relative(root, path)];
  });
}
const files = collect(root).sort();
for (const path of files) {
  assert(path === 'index.html' || path === 'third-party-notices.txt' ||
    path === 'artifact-manifest.json' ||
    /^assets\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(js|css)$/.test(path), `Unexpected public file: ${path}`);
  const text = readFileSync(join(root, path), 'utf8');
  assert(!/supabase|ranking-manifest|score-submit|api[_-]?key|__MACHIMAMORE_TEST__|__machimamoreDebug|__machimamoreRead|__gekichinDebug|__gekichinRead/i.test(text),
    `Forbidden integration/debug hook: ${path}`);
  assert(!/sourceMappingURL=/.test(text), `Source map reference: ${path}`);
  if (/\.(html|css)$/.test(path)) {
    assert(!/(?:src|href)=["'](?:https?:)?\/\/|url\(["']?(?:https?:)?\/\//i.test(text), `External asset: ${path}`);
    assert(!/(?:src|href)=["']\/|url\(["']?\//i.test(text), `Root-relative asset: ${path}`);
  }
}
assert(files.includes('index.html'), 'Missing HTML entry');
assert(files.includes('third-party-notices.txt'), 'Missing third-party notices');
const notice = readFileSync(join(root, 'third-party-notices.txt'), 'utf8');
assert.equal(notice, readFileSync('public/third-party-notices.txt', 'utf8'), 'Shipped NOTICE differs from source');
assert.equal(notice, readFileSync('node_modules/three/LICENSE', 'utf8'), 'Three.js license must be preserved verbatim');
const html = readFileSync(join(root, 'index.html'), 'utf8');
assert(html.includes('マチマモレ'), 'Unexpected game entry point');
const assets = [...html.matchAll(/(?:src|href)=["'](\.\/assets\/[^"']+)["']/g)].map((match) => match[1].slice(2));
assert(assets.some((path) => path.endsWith('.js')), 'Missing relative JavaScript entry');
assert(assets.some((path) => path.endsWith('.css')), 'Missing relative CSS entry');
for (const path of assets) assert(files.includes(path), `Missing public asset: ${path}`);
const entries = files.map((path) => {
  const data = readFileSync(join(root, path));
  return { path, bytes: data.length, sha256: hash(data) };
});
const artifact = JSON.parse(readFileSync(join(root, 'artifact-manifest.json'), 'utf8'));
assert.equal(artifact.schema, 1, 'Unexpected artifact manifest schema');
assert.deepEqual(artifact.files, entries.filter((entry) => entry.path !== 'artifact-manifest.json'), 'Artifact manifest must match every public file');
const sourceBytes = readFileSync('artifacts/source-manifest.json');
const source = JSON.parse(sourceBytes.toString('utf8'));
assert.equal(source.commit, commit, 'Source manifest must match BUILD_COMMIT');
assert.equal(source.workingTreeDirty, false, 'Source checkout must be clean');
// Keep this list aligned with scripts/source-manifest.mjs. A digest of an empty or
// partial list is not proof that the checked input tree is the published source.
const sourceInputs = ['src', 'tests', 'browser-tests', 'scripts', 'public', '.github',
  'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.tools.json', 'vite.config.ts', 'playwright.config.ts'];
const sourcePaths = execFileSync('git', ['ls-files', '-z', '--', ...sourceInputs], { encoding: 'utf8' }).split('\0').filter(Boolean).sort();
assert(sourcePaths.length > 0 && Array.isArray(source.files), 'Source manifest must cover tracked verification inputs');
assert.deepEqual(source.files.map((entry) => entry.path), sourcePaths, 'Source manifest must cover every tracked verification input');
assert.equal(source.contentDigest, hash(JSON.stringify(source.files)), 'Source manifest digest mismatch');
for (const entry of source.files) {
  assert(typeof entry.path === 'string' && !entry.path.startsWith('/') && !entry.path.split('/').includes('..'), 'Invalid source manifest path');
  const data = readFileSync(entry.path);
  assert.equal(entry.bytes, data.length, `Source size mismatch: ${entry.path}`);
  assert.equal(entry.sha256, hash(data), `Source hash mismatch: ${entry.path}`);
}
const manifest = { schema: 1, repository: 'chameleonjp-lab/machimamore', commit, sourceContentDigest: source.contentDigest, sourceManifestSha256: hash(sourceBytes), files: entries };
// Exclusive create prevents silently replacing an old or unverified manifest.
writeFileSync(join(root, 'deployment.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(manifest, null, 2));
