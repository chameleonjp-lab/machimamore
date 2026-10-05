import { createHash } from 'node:crypto';
import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const paths = [];
async function visit(root) {
  for (const entry of (await readdir(root)).sort()) {
    const path = `${root}/${entry}`;
    if ((await stat(path)).isDirectory()) await visit(path); else paths.push(path);
  }
}
for (const root of ['src', 'tests', 'browser-tests', 'scripts', 'public', '.github']) await visit(root);
paths.push('index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.tools.json', 'vite.config.ts', 'playwright.config.ts');
const files = [];
for (const path of paths.sort()) {
  const data = await readFile(path);
  files.push({ path, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
const digest = createHash('sha256').update(JSON.stringify(files)).digest('hex');
const manifest = { schema: 1, generatedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), workingTreeDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()), contentDigest: digest, files };
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/source-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Verification input digest: ${digest}`);
