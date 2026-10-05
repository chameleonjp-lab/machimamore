import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const walk = async (dir) => {
  const files = [];
  for (const name of await readdir(dir)) {
    const path = `${dir}/${name}`;
    if ((await stat(path)).isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files.sort();
};
const files = (await walk('dist')).filter(p => p !== 'dist/artifact-manifest.json');
assert(files.includes('dist/index.html'));
assert(files.includes('dist/third-party-notices.txt'));
const manifest = [];
for (const path of files) {
  assert(/^dist\/(index\.html|third-party-notices\.txt|assets\/[\w.-]+\.(js|css))$/.test(path), `Unexpected distribution file: ${path}`);
  const data = await readFile(path);
  const text = data.toString('utf8');
  assert(!/supabase|ranking-manifest|score-submit|api[_-]?key|__MACHIMAMORE_TEST__|__machimamoreDebug|__machimamoreRead/i.test(text), `Forbidden integration/debug hook: ${path}`);
  assert(!/sourceMappingURL=/.test(text), `Source map reference: ${path}`);
  if (/\.(html|css)$/.test(path)) {
    assert(!/(?:src|href)=["']https?:\/\/|url\(["']?https?:\/\//i.test(text), `External asset: ${path}`);
  }
  manifest.push({ path: path.slice(5), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
const notice = await readFile('dist/third-party-notices.txt', 'utf8');
assert.equal(notice, await readFile('public/third-party-notices.txt', 'utf8'), 'Shipped NOTICE differs from source');
assert.equal(notice, await readFile('node_modules/three/LICENSE', 'utf8'), 'Three.js license must be preserved verbatim');
assert(/Three\.js|three\.js/i.test(notice));
assert(/Permission is hereby granted/.test(notice));
const html = await readFile('dist/index.html', 'utf8');
assert(!/src="\/assets\//.test(html), 'Assets must use relative paths for project hosting');
await writeFile('dist/artifact-manifest.json', JSON.stringify({ schema: 1, files: manifest }, null, 2) + '\n');
console.log(`Distribution verified: ${manifest.length} files; artifact-manifest.json written.`);
