// Load graph for website/: broken imports, and files no page reaches.
//
//   node docs/tests/load-graph.mjs            summary (exit 1 if any import is broken)
//   node docs/tests/load-graph.mjs --unloaded list every file no page loads
//
// Follows, from every HTML page: <script src>, inline module imports, static
// `import … from` / `export … from` / `import '…'` / `import {} from '…'`, and
// dynamic import() of a literal path.  Bare specifiers (three, …) come from the
// import maps and are not files here.  Comments are ignored.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../website');
const files = [];
(function walk(d) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) { if (n !== 'node_modules' && !n.startsWith('.')) walk(p); }
    else if (/\.(m?js|html?)$/.test(n)) files.push(p);
  }
})(ROOT);

const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const specsOf = (file) => {
  let src = fs.readFileSync(file, 'utf8');
  const out = [];
  if (/\.html?$/.test(file)) {
    for (const m of src.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) out.push(m[1]);
    src = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
  }
  src = stripComments(src);
  for (const m of src.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
};

const deps = new Map(), broken = [];
for (const f of files) {
  const s = new Set();
  for (const spec of specsOf(f)) {
    if (!/^[./]/.test(spec) || /^https?:/.test(spec)) continue;
    const target = path.resolve(path.dirname(f), spec);
    if (fs.existsSync(target) && fs.statSync(target).isFile()) s.add(target);
    else broken.push(`${path.relative(ROOT, f)}  ->  ${spec}`);
  }
  deps.set(f, s);
}

const pages = files.filter(f => /\.html?$/.test(f));
const reached = new Set();
for (const p of pages) { const st = [p]; while (st.length) for (const d of deps.get(st.pop()) || []) if (!reached.has(d)) { reached.add(d); st.push(d); } }
const unloaded = files.filter(f => /\.m?js$/.test(f) && !reached.has(f)).map(f => path.relative(ROOT, f)).sort();

console.log(`${pages.length} pages, ${files.length - pages.length} scripts, ${unloaded.length} reached by no page, ${broken.length} broken imports`);
for (const b of broken) console.log('  BROKEN  ' + b);
if (process.argv.includes('--unloaded')) for (const u of unloaded) console.log('  unloaded  ' + u);
process.exitCode = broken.length ? 1 : 0;
