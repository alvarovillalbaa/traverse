import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
function files(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const sources = ['src', 'scripts', 'examples', 'tests'].flatMap((name) => files(resolve(root, name)));
const javascript = sources.filter((path) => ['.js', '.mjs'].includes(extname(path)));
for (const path of javascript) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) throw new Error(`syntax_failed:${relative(root, path)}`);
  for (const match of readFileSync(path, 'utf8').matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
    if (!existsSync(resolve(dirname(path), match[1]))) throw new Error(`unresolved_import:${relative(root, path)}`);
  }
}
let inlineScripts = 0;
for (const path of sources.filter((path) => path.endsWith('.html'))) {
  for (const match of readFileSync(path, 'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const result = spawnSync(process.execPath, ['--check', '--input-type=commonjs'],
      { input: match[1], encoding: 'utf8', timeout: 10000 });
    if (result.status !== 0) throw new Error(`inline_syntax_failed:${relative(root, path)}`);
    inlineScripts++;
  }
}
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
if (Object.keys(pkg.dependencies ?? {}).length || Object.keys(pkg.devDependencies ?? {}).length) throw new Error('unexpected_dependency');
for (const entry of Object.values(pkg.exports)) {
  for (const path of Object.values(entry)) if (!existsSync(resolve(root, path))) throw new Error('missing_package_export');
}
const documents = ['README.md', 'AGENTS.md', ...files(resolve(root, 'docs')).filter((path) => path.endsWith('.md'))]
  .map((path) => resolve(root, path));
let links = 0;
for (const path of documents) {
  const content = readFileSync(path, 'utf8');
  if (!content.trim()) throw new Error(`empty_document:${relative(root, path)}`);
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    if (!existsSync(resolve(dirname(path), decodeURIComponent(target)))) throw new Error(`broken_link:${relative(root, path)}`);
    links++;
  }
}
const caseCounts = Object.fromEntries(sources.filter((path) => path.endsWith('.test.mjs')).map((path) =>
  [relative(root, path), [...readFileSync(path, 'utf8').matchAll(/^test\(['"]/gm)].length]));
console.log(JSON.stringify({ nodeVersion: process.version, nodeExecutable: process.execPath, javascriptParsed: javascript.length,
  inlineScriptsParsed: inlineScripts, localLinks: links, authoredCaseRegistrations: caseCounts,
  authoredCases: Object.values(caseCounts).reduce((a, b) => a + b, 0),
  execution: 'syntax and references only; no product/test import, test, browser or model execution' }));
