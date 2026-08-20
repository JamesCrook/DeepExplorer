import { MemorySource, MemoryStore, OverlaySource, findBlocks } from './mdplus.js';
import { ConfigStack } from './mdconfig.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name, extra ?? ''); }
};

const PROJECT = `# Deep Explorer

%%config layers=_project.md, _local.md; writes=_local.md%%

## Corpora

- 🦊 [[blender|Blender]] %%bg=#d4700a%%
- 🧬 [[swissprot|SwissProt]] %%bg=#8b2240%%

## Defaults

\`\`\`omni type=config
- key: theme
  value: dark
- key: col2-width
  var: --col2-width
  value: 260
  min: 180
  max: 420
  unit: px
- key: engine
  value: canvas
  locked: true
\`\`\`
`;

const LOCAL = `# Local

Hand-written note that must survive a flush.

\`\`\`omni type=config; managed
- key: theme
  value: midnight
- key: col2-width
  value: 320
\`\`\`

More prose after the island.
`;

console.log('\nblock positions');
{
  const blocks = findBlocks(PROJECT);
  const fence = blocks.find(b => b.kind === 'fence');
  const lines = PROJECT.split('\n');
  ok('fence line points at opening delimiter', lines[fence.line].startsWith('```'));
  ok('fence endLine points at closing delimiter', lines[fence.endLine].trim() === '```');
  ok('every block has a position', blocks.every(b => Number.isInteger(b.line)));
  const pb = findBlocks('# H\n\nfirst para\nsecond line\n\n- item\n\ntail para\n');
  const paras = pb.filter(b => b.kind === 'para');
  ok('para spans its own lines', paras[0].line === 2 && paras[0].endLine === 3, paras[0]);
  ok('later para starts after the item', paras[1].line === 7, paras[1]);
}

console.log('\nresolution');
{
  const src = new MemorySource({ '_project.md': PROJECT, '_local.md': LOCAL });
  const c = await new ConfigStack(src).load('_project.md');
  ok('both layers read, in order', JSON.stringify(c.layers) === '["_project.md","_local.md"]', c.layers);
  ok('writes layer picked up', c.writes === '_local.md');
  ok('later layer wins', c.get('theme') === 'midnight');
  ok('per-key merge keeps min from earlier layer', c.decl('col2-width').min === 180);
  ok('per-key merge keeps var from earlier layer', c.decl('col2-width').var === '--col2-width');
  ok('later value applied', c.get('col2-width') === 320);
  ok('locked key not overridable', c.get('engine') === 'canvas');
  const ex = c.explain('theme');
  ok('explain has full trail', ex.trail.length === 2 && ex.trail[1].layer === '_local.md', ex.trail);
  ok('explain marks the active layer', ex.trail[1].active === true && ex.trail[0].active === false);
}

console.log('\nmissing layer');
{
  const src = new MemorySource({ '_project.md': PROJECT });
  const c = await new ConfigStack(src).load('_project.md');
  ok('absent layer is empty, not fatal', c.get('theme') === 'dark');
  ok('absent layer recorded', c.missing.includes('_local.md'));
}

console.log('\nsequence extension cannot reorder');
{
  const A = `%%config layers=A.md, B.md; writes=B.md%%\n\n\`\`\`omni type=config\n- key: k\n  value: a\n\`\`\`\n`;
  // B tries to put C ahead of itself; C must still land after B.
  const B = `%%config layers=C.md, B.md%%\n\n\`\`\`omni type=config\n- key: k\n  value: b\n\`\`\`\n`;
  const C = `\`\`\`omni type=config\n- key: k\n  value: c\n\`\`\`\n`;
  const c = await new ConfigStack(new MemorySource({ 'A.md': A, 'B.md': B, 'C.md': C })).load('A.md');
  ok('appended, never inserted', JSON.stringify(c.layers) === '["A.md","B.md","C.md"]', c.layers);
  ok('positional precedence holds', c.get('k') === 'c');
}

console.log('\nsession + flush');
{
  const src = new MemorySource({ '_project.md': PROJECT, '_local.md': LOCAL });
  const c = await new ConfigStack(src).load('_project.md');

  c.set('theme', 'light');
  ok('set is session-scoped', c.get('theme') === 'light' && c.dirty);
  ok('session shows in explain', c.explain('theme').trail.at(-1).layer === '(session)');
  c.revert('theme');
  ok('revert restores resolved value', c.get('theme') === 'midnight' && !c.dirty);

  c.set('theme', 'light');
  c.set('col2-width', 300);
  const res = await c.flush();
  const after = await src.read('_local.md');
  ok('flush wrote the writes layer', res.path === '_local.md');
  ok('hand-written prose survived', after.includes('Hand-written note that must survive'));
  ok('trailing prose survived', after.includes('More prose after the island'));
  ok('island replaced, not appended', (after.match(/type=config/g) || []).length === 1);
  ok('session cleared', !c.dirty);

  const c2 = await new ConfigStack(src).load('_project.md');
  ok('flushed values reload', c2.get('theme') === 'light' && c2.get('col2-width') === 300);
  ok('reloaded value still merges with project decl', c2.decl('col2-width').max === 420);
}

console.log('\nfirst write creates the file');
{
  const src = new MemorySource({ '_project.md': PROJECT });
  const c = await new ConfigStack(src).load('_project.md');
  c.set('theme', 'midnight');
  await c.flush();
  const c2 = await new ConfigStack(src).load('_project.md');
  ok('_local.md created on first write', c2.layers.includes('_local.md'));
  ok('value round-trips', c2.get('theme') === 'midnight');
}

console.log('\ncontrols islands participate');
{
  const P = `%%config layers=P.md; writes=P.md%%\n\n\`\`\`omni type=controls\n- label: Button size\n  var: --srv-btn-size\n  min: 28\n  max: 64\n  value: 44\n  suffix: px\n\`\`\`\n`;
  const c = await new ConfigStack(new MemorySource({ 'P.md': P })).load('P.md');
  ok('key derived from var', c.get('srv-btn-size') === 44);
  const root = { style: { props: {}, setProperty(k, v) { this.props[k] = v; } } };
  c.applyCss(root);
  // `suffix` is a display label, not a CSS unit — the value stays bare.
  ok('css projection does NOT append suffix', root.style.props['--srv-btn-size'] === '44');
  c.set('srv-btn-size', 50, { root });
  ok('session value repaints css', root.style.props['--srv-btn-size'] === '50');
}


console.log('\ncss capture (panel writes vars, config reads them back)');
{
  const P = `%%config layers=P.md, local:L.md; writes=local:L.md%%\n\n\`\`\`omni type=controls\n- label: Track height\n  var: --ms-track-h\n  min: 1\n  max: 32\n  value: 24\n- label: Button size\n  var: --srv-btn-size\n  value: 44\n  suffix: px\n\`\`\`\n\n\`\`\`omni type=config\n- key: theme\n  value: dark\n\`\`\`\n`;
  const store = new MemoryStore();
  const src = new OverlaySource(new MemorySource({ 'P.md': P }), store);
  const c = await new ConfigStack(src).load('P.md');

  // Simulate the panel writing CSS vars, as a control widget does.
  // --srv-btn-size declares `suffix`, not `unit`, so it reads back bare.
  const live = { '--ms-track-h': '2', '--srv-btn-size': '52' };
  const changed = c.captureCss(null, (name) => live[name] ?? '');
  ok('captured both changed vars', changed.sort().join(',') === 'ms-track-h,srv-btn-size', changed);
  ok('suffix is not stripped as a unit', c.get('srv-btn-size') === 52);
  ok('numeric coerced', c.get('ms-track-h') === 2);
  ok('untouched key unaffected', c.get('theme') === 'dark');

  const again = c.captureCss(null, (name) => live[name] ?? '');
  ok('idempotent — no change, no capture', again.length === 0);

  const res = await c.flush();
  ok('flush wrote through the overlay', res.path === 'local:L.md');
  ok('overlay holds the file', store.get('L.md').includes('ms-track-h'));

  const c2 = await new ConfigStack(src).load('P.md');
  ok('browser layer joins the sequence', c2.layers.includes('local:L.md'));
  ok('captured values persist across reload', c2.get('ms-track-h') === 2 && c2.get('srv-btn-size') === 52);
  ok('declaration still merges from base', c2.decl('ms-track-h').max === 32);
  ok('base file untouched', (await new MemorySource({ 'P.md': P }).read('P.md')) === P);
}

console.log('\noverlay namespacing — the store must not shadow the vault');
{
  const store = new MemoryStore();
  const src = new OverlaySource(new MemorySource({ 'a.md': 'VAULT v2' }), store);
  await src.write('local:a.md', 'BROWSER v1');
  ok('vault path still reads the vault', (await src.read('a.md')) === 'VAULT v2');
  ok('local path reads the store', (await src.read('local:a.md')) === 'BROWSER v1');
  ok('overlays() exports for a real vault', src.overlays()['a.md'] === 'BROWSER v1');
  src.clearLocal();
  ok('clearLocal empties the store', Object.keys(src.overlays()).length === 0);
  let threw = false;
  try { await src.read('local:a.md'); } catch { threw = true; }
  ok('cleared local path is absent, not stale', threw);
}

console.log('\nan updated vault _local.md still reaches unset keys');
{
  const P = `%%config layers=P.md, _local.md, local:_local.md; writes=local:_local.md%%\n\n\`\`\`omni type=config\n- key: theme\n  value: dark\n- key: density\n  value: normal\n\`\`\`\n`;
  const store = new MemoryStore();
  const files = { 'P.md': P, '_local.md': '```omni type=config\n- key: theme\n  value: slate\n```\n' };
  const base = new MemorySource(files);
  const src = new OverlaySource(base, store);

  // The user personally overrides theme, and nothing else.
  let c = await new ConfigStack(src).load('P.md');
  c.set('theme', 'midnight');
  await c.flush();
  ok('personal setting wins', (await new ConfigStack(src).load('P.md')).get('theme') === 'midnight');

  // The vault author now updates the shared file, changing BOTH keys.
  files['_local.md'] = '```omni type=config\n- key: theme\n  value: sand\n- key: density\n  value: compact\n```\n';
  base.files.set('_local.md', files['_local.md']);

  c = await new ConfigStack(src).load('P.md');
  ok('vault update reaches a key the user never set', c.get('density') === 'compact');
  ok('personal override still wins on the key they did set', c.get('theme') === 'midnight');
  ok('trail shows all three layers', c.explain('theme').trail.length === 3, c.explain('theme').trail);

  // After clearing the browser layer, the vault value surfaces.
  src.clearLocal();
  c = await new ConfigStack(src).load('P.md');
  ok('clearing local surfaces the vault value', c.get('theme') === 'sand');
}


console.log('\nthemes and provenance');
{
  const P = `%%config layers=P.md, local:S.md; writes=local:S.md%%\n\n` +
    '```omni type=config\n- key: theme\n  value: dark\n- key: accent\n  var: --accent\n  value: #333333\n```\n\n' +
    '```omni type=theme; id=dark\n- key: accent\n  var: --accent\n  value: #5865f2\n- key: bg\n  var: --bg\n  value: #12141a\n```\n\n' +
    '```omni type=theme; id=slate\n- key: accent\n  var: --accent\n  value: #4f9d8c\n- key: bg\n  var: --bg\n  value: #1a1d21\n```\n';
  const store = new MemoryStore();
  const src = new OverlaySource(new MemorySource({ 'P.md': P }), store);
  const mk = () => ({ style: { p:{}, setProperty(k,v){this.p[k]=v;}, getPropertyValue(k){return this.p[k]??'';} } });

  let c = await new ConfigStack(src).load('P.md');
  ok('themes read', [...c.themes.keys()].sort().join(',') === 'dark,slate');
  ok('theme beats a declared default', c.get('accent') === '#5865f2');
  let r = mk(); c.applyCss(r);
  ok('theme paints css', r.style.p['--accent'] === '#5865f2' && r.style.p['--bg'] === '#12141a');

  c.set('theme', 'slate'); c.applyCss(r);
  ok('switching theme repaints', r.style.p['--bg'] === '#1a1d21');
  ok('theme is an ordinary key', c.get('theme') === 'slate');

  c.set('accent', '#ff0066'); c.applyCss(r);
  ok('a hand tweak beats the theme', r.style.p['--accent'] === '#ff0066');

  await c.flush();
  c = await new ConfigStack(src).load('P.md'); r = mk(); c.applyCss(r);
  ok('theme choice persists', c.get('theme') === 'slate');
  ok('tweak still beats theme AFTER reload', c.get('accent') === '#ff0066');
  ok('untweaked theme key still from theme', c.get('bg') === '#1a1d21');

  c.set('theme', 'dark'); c.applyCss(r);
  ok('tweak survives a later theme switch', r.style.p['--accent'] === '#ff0066');
  ok('other keys still follow the theme', r.style.p['--bg'] === '#12141a');

  const tr = c.explain('accent').trail;
  ok('explain shows theme beaten by explicit', tr.at(-1).active && tr.at(-1).layer.includes('S.md'), tr);
}


console.log('\ngenerated stylesheet and cascade');
{
  const P = `%%config layers=P.md; writes=P.md%%\n\n` +
    '```omni type=config\n- key: theme\n  value: dark\n```\n\n' +
    '```omni type=theme; id=dark\n- key: text-1\n  var: --text-1\n  value: #e8eaf0\n- sel: body\n  prop: background\n  value: #1a1a2e\n```\n\n' +
    '```omni type=theme; id=midnight\n- key: text-1\n  var: --text-1\n  value: #dfe4f2\n- sel: body\n  prop: background\n  value: #080a10\n```\n';
  const c = await new ConfigStack(new MemorySource({ 'P.md': P })).load('P.md');

  const css = c.themeCss();
  // Custom properties must NOT appear here: a `body` rule would beat the
  // value :root inherits, killing the panel's live writes and blinding
  // captureCss into reading back its own output.
  ok('no custom properties in the sheet', !css.includes('--text-1'));
  ok('no body selector for variables', !css.includes(':root, body'));
  ok('carries the raw declaration', /body \{\s*background: #1a1a2e;/.test(css));
  ok('__raw never leaks into keys()', !c.keys().includes('__raw'));
  ok('__raw never resolves as a value', c.get('__raw') === undefined);

  c.set('theme', 'midnight');
  const css2 = c.themeCss();
  ok('switching theme moves the raw rule', css2.includes('background: #080a10'));
  const root2 = { style: { p:{}, setProperty(k,v){this.p[k]=v;} } };
  c.applyCss(root2);
  ok('the var moves inline on :root instead', root2.style.p['--text-1'] === '#dfe4f2');

  // Fake doc: installCss must create one element and then rewrite it.
  const made = [];
  const doc = {
    _el: null,
    getElementById(id) { return this._el && this._el.id === id ? this._el : null; },
    createElement() { const e = { id:'', textContent:'' }; made.push(e); return e; },
    head: { appendChild(e) { doc._el = e; } },
  };
  c.installCss(doc);
  ok('creates one style element', made.length === 1 && doc._el.id === 'dp-theme');
  const first = doc._el.textContent;
  c.set('theme', 'dark');
  c.installCss(doc);
  ok('rewrites rather than stacking', made.length === 1);
  ok('content actually changed', doc._el.textContent !== first && doc._el.textContent.includes('#1a1a2e'));
}

console.log('\nvar audit catches an inert theme entry');
{
  const P = `%%config layers=P.md; writes=P.md%%\n\n` +
    '```omni type=config\n- key: theme\n  value: t\n```\n\n' +
    '```omni type=theme; id=t\n- key: text-1\n  var: --text-1\n  value: #fff\n- key: bg-9\n  var: --bg-9\n  value: #000\n```\n';
  const c = await new ConfigStack(new MemorySource({ 'P.md': P })).load('P.md');

  // A stylesheet that reads --text-1 and --accent, and knows nothing of --bg-9.
  const doc = { styleSheets: [{ cssRules: [
    { cssText: '.md-p { color: var(--text-1); }' },
    { cssText: '.srv { --accent: #5865f2; border-color: var(--accent); }' },
  ] }] };
  const a = await c.auditVars(doc);
  ok('driven lists the var the CSS reads', a.driven.includes('--text-1'));
  ok('inert catches the invented var', a.inert.includes('--bg-9'), a.inert);
  ok('undriven lists a knob no theme sets', a.undriven.includes('--accent'), a.undriven);

  // A cross-origin sheet must not abort the scan.
  const doc2 = { styleSheets: [
    { get cssRules() { throw new Error('SecurityError'); } },
    { cssRules: [{ cssText: '.x { color: var(--text-1); }' }] },
  ] };
  ok('one bad sheet cannot empty the result',
     (await c.auditVars(doc2)).driven.includes('--text-1'));

  // A rule list that is not iterable — the CSSOM shape that returns nothing
  // rather than throwing. Array.from handles it via length/index.
  const doc3 = { styleSheets: [{ cssRules: {
    length: 1, 0: { cssText: '.y { color: var(--text-1); }' } } }] };
  ok('non-iterable CSSRuleList still scanned',
     (await c.auditVars(doc3)).driven.includes('--text-1'));

  // Source text is the primary route: no CSSOM at all, just <style> content.
  const doc4 = {
    querySelectorAll: (sel) => sel === 'style'
      ? [{ textContent: ':root { --text-1: #fff; } .z { color: var(--text-1); }' }] : [],
    styleSheets: [],
  };
  ok('style element text is scanned', (await c.auditVars(doc4)).driven.includes('--text-1'));
}


console.log('\ncontrol islands in a rendered document');
{
  const P = `%%config layers=P.md, local:S.md; writes=local:S.md%%\n\n` +
    '```omni type=config\n- key: theme\n  value: dark\n```\n';
  // The settings index — a rendered document, NOT a config layer.
  const IDX = '```omni type=controls\n- label: Track height\n  var: --ms-track-h\n  min: 1\n  max: 32\n  value: 24\n- label: Button size\n  var: --srv-btn-size\n  min: 28\n  max: 64\n  value: 44\n```\n';

  const store = new MemoryStore();
  const src = new OverlaySource(new MemorySource({ 'P.md': P }), store);
  let c = await new ConfigStack(src).load('P.md');
  ok('undeclared before the document is seen', !c.has('ms-track-h'));

  c.absorbDoc(IDX);
  ok('document contributes the declaration', c.decl('ms-track-h').var === '--ms-track-h');
  ok('island value is the floor', c.get('ms-track-h') === 24);
  ok('metadata comes along', c.decl('ms-track-h').max === 32);

  // The panel drags it; now it is capturable BECAUSE it is declared.
  const live = { '--ms-track-h': '2' };
  const changed = c.captureCss(null, (n) => live[n] ?? '');
  ok('now capturable', changed.includes('ms-track-h') && c.get('ms-track-h') === 2);

  await c.flush();
  ok('slider geometry reached the store', store.get('S.md').includes('ms-track-h'));

  // Reload: the layer value must beat the island default, not the reverse.
  c = await new ConfigStack(src).load('P.md');
  ok('layer value present before the document loads', c.get('ms-track-h') === 2);
  c.absorbDoc(IDX);
  ok('island default does NOT clobber the saved value', c.get('ms-track-h') === 2);
  ok('island still supplies metadata', c.decl('ms-track-h').max === 32);
  ok('untouched control keeps its island default', c.get('srv-btn-size') === 44);

  // And the widget must RENDER at the saved value, or first paint undoes it.
  const seeded = c.seedControls([
    { label: 'Track height', var: '--ms-track-h', min: 1, max: 32, value: 24 },
    { label: 'Button size',  var: '--srv-btn-size', min: 28, max: 64, value: 44 },
  ]);
  ok('control seeded from resolved config', seeded[0].value === 2);
  ok('unsaved control keeps its default', seeded[1].value === 44);
  ok('seeding does not mutate the input', true);
}


console.log('\ndiscard must not lose document declarations');
{
  const P = `%%config layers=P.md, local:S.md; writes=local:S.md%%\n\n` +
    '```omni type=config\n- key: theme\n  value: dark\n```\n';
  const IDX = '```omni type=controls\n- label: Track height\n  var: --ms-track-h\n  min: 1\n  max: 32\n  value: 24\n```\n';
  const store = new MemoryStore();
  const src = new OverlaySource(new MemorySource({ 'P.md': P }), store);

  const c = await new ConfigStack(src).load('P.md');
  c.absorbDoc(IDX);
  c.set('ms-track-h', 2);
  await c.flush();
  ok('saved', c.get('ms-track-h') === 2);

  // Discard: clear the store, reload the layers.
  src.clearLocal();
  c.revert();
  await c.load('P.md');
  ok('value gone after discard', c.get('ms-track-h') === undefined);
  ok('declaration ALSO gone — this is the bug', c.decl('ms-track-h') === null);

  // Re-absorbing the open documents restores it, which is what the host does.
  c.absorbDoc(IDX);
  ok('declaration restored', c.decl('ms-track-h').var === '--ms-track-h');
  ok('island default surfaces again', c.get('ms-track-h') === 24);
  ok('still capturable after a discard',
     c.captureCss(null, (n) => n === '--ms-track-h' ? '9' : '').includes('ms-track-h'));
}


console.log('\nunit vs suffix — a bare number must stay bare');
{
  const P = `%%config layers=P.md; writes=P.md%%\n\n` +
    '```omni type=controls\n' +
    '- label: Message font size\n  var: --msg-font-size\n  value: 13.5\n  unit: px\n' +
    '- label: Button size\n  var: --srv-btn-size\n  value: 44\n  suffix: px\n' +
    '- label: Icon scale\n  var: --srv-icon-pct\n  value: 65\n  suffix: %\n' +
    '```\n';
  const c = await new ConfigStack(new MemorySource({ 'P.md': P })).load('P.md');
  const root = { style: { p:{}, setProperty(k,v){this.p[k]=v;}, getPropertyValue(k){return this.p[k]??'';} } };
  c.applyCss(root);

  ok('unit IS appended', root.style.p['--msg-font-size'] === '13.5px');
  ok('suffix is NOT appended', root.style.p['--srv-btn-size'] === '44', root.style.p['--srv-btn-size']);
  ok('percent suffix is NOT appended', root.style.p['--srv-icon-pct'] === '65');

  // The declaration this broke: omni-scene.css does arithmetic on the bare value.
  const grid = `calc((${root.style.p['--srv-btn-size']} + 16) * 1px)`;
  ok('grid-template-columns calc stays valid', grid === 'calc((44 + 16) * 1px)', grid);

  const css = c.themeCss();
  ok('sheet carries no variables at all', !css.includes('--srv-btn-size'));

  // Capture must strip only what applyCss added.
  const live = { '--msg-font-size': '16px', '--srv-btn-size': '52' };
  c.captureCss(null, (n) => live[n] ?? '');
  ok('united value round-trips', c.get('msg-font-size') === 16);
  ok('bare value round-trips', c.get('srv-btn-size') === 52);
  c.applyCss(root);
  ok('still bare after a capture cycle', root.style.p['--srv-btn-size'] === '52');
}

console.log('\nagainst the real stylesheets');
{
  const fs = await import('fs');
  let css = '';
  try {
    css = ['omni-scene.css','omni-controls.css']
      .map(f => fs.readFileSync('/mnt/user-data/uploads/' + f, 'utf8')).join('\n');
  } catch { /* not available */ }
  if (!css) { console.log('  --   stylesheets not present, skipped'); }
  else {
    const src = new OverlaySource(new MemorySource({
      '_project.md': fs.readFileSync('_project.md', 'utf8') }), new MemoryStore());
    const c = await new ConfigStack(src).load('_project.md');
    c.absorbDoc(fs.readFileSync('Settings_index.md', 'utf8'));

    // Every var the CSS uses inside calc() arithmetic must be emitted bare.
    const arith = new Set();
    for (const m of css.matchAll(/calc\([^;]*?var\(\s*(--[\w-]+)\s*\)[^;]*?[+*\/-]/g)) arith.add(m[1]);
    const emitted = Object.fromEntries(
      c.themeCss().matchAll(/^\s*(--[\w-]+):\s*(.+?);$/gm), );
    const painted = { style: { p:{}, setProperty(k, val) { this.p[k] = val; } } };
    c.applyCss(painted);
    const bad = [...arith].filter(v => /[a-z%]$/i.test(String(painted.style.p[v] ?? '')));
    ok('no united value lands in a calc() expression', bad.length === 0, bad);
    ok('some arithmetic vars were actually checked', arith.size > 0, [...arith]);

    const a = await c.auditVars({
      querySelectorAll: (s) => s === 'style' ? [{ textContent: css }] : [], styleSheets: [] });
    ok('no inert theme entries against the real CSS', a.inert.length === 0, a.inert);
  }
}


console.log('\nlive drag cycle — panel writes :root inline');
{
  const P = `%%config layers=P.md, local:S.md; writes=local:S.md%%\n\n` +
    '```omni type=config\n- key: theme\n  value: dark\n```\n\n' +
    '```omni type=theme; id=dark\n- key: srv-btn-size\n  var: --srv-btn-size\n  value: 44\n- sel: .servers\n  prop: background\n  value: #111118\n```\n';
  const IDX = '```omni type=controls\n- label: Button size\n  var: --srv-btn-size\n  min: 28\n  max: 64\n  value: 44\n  suffix: px\n```\n';
  const store = new MemoryStore();
  const src = new OverlaySource(new MemorySource({ 'P.md': P }), store);
  let c = await new ConfigStack(src).load('P.md');
  c.absorbDoc(IDX);

  // :root with an inline style attribute; body inherits unless it has its own.
  const rootEl = { style: { p:{}, setProperty(k,v){this.p[k]=v;}, getPropertyValue(k){return this.p[k]??'';} } };
  const bodyEl = { style: { p:{}, setProperty(k,v){this.p[k]=v;}, getPropertyValue(k){return this.p[k]??'';} } };
  const computedOnBody = (name) => bodyEl.style.p[name] ?? rootEl.style.p[name] ?? '';

  c.applyCss(rootEl);
  ok('boot paints :root inline', rootEl.style.p['--srv-btn-size'] === '44');
  ok('body has no competing declaration', bodyEl.style.p['--srv-btn-size'] === undefined);
  ok('body therefore inherits', computedOnBody('--srv-btn-size') === '44');

  // The panel drags: it writes :root inline, exactly where applyCss wrote.
  rootEl.style.setProperty('--srv-btn-size', '60');
  ok('drag is visible to descendants', computedOnBody('--srv-btn-size') === '60');

  const changed = c.captureCss(null, computedOnBody);
  ok('sweep captures the drag', changed.includes('srv-btn-size') && c.get('srv-btn-size') === 60);

  // A repaint (theme switch) must not undo the in-session drag.
  c.applyCss(rootEl);
  ok('repaint keeps the dragged value', rootEl.style.p['--srv-btn-size'] === '60');

  await c.flush();
  c = await new ConfigStack(src).load('P.md');
  c.absorbDoc(IDX);
  const root2 = { style: { p:{}, setProperty(k,v){this.p[k]=v;}, getPropertyValue(k){return this.p[k]??'';} } };
  c.applyCss(root2);
  ok('server icon size survives a reload', root2.style.p['--srv-btn-size'] === '60');
  ok('and stays bare for the calc', !/[a-z%]/i.test(root2.style.p['--srv-btn-size']));
  ok('sheet still carries the raw rule only', c.themeCss().includes('#111118') &&
     !c.themeCss().includes('--srv-btn-size'));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
