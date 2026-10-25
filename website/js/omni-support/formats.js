import { SYS } from './sys.js';

/* ─────────────────────────────────────────────────────────────────────────────
formats — named number formats, pushed into SYS.FUNCTIONS as format.<name>.

The first tenants of FUNCTIONS.  A node refers to a format by name
(format: 'pct'), which serialises; the function is looked up at use.  The
morph slider's Format field lists whatever is registered, so pushing a
format.<name> record from any nugget adds it to the list.
──────────────────────────────────────────────────────────────────────────── */

SYS.FUNCTIONS.push(
  { name: 'format.int',    label: 'integer',     fn: v => String(Math.round(v)) },
  { name: 'format.pct',    label: 'percent',     fn: v => `${Math.round(v * 100)}%` },
  { name: 'format.deg',    label: 'degrees',     fn: v => `${v.toFixed(1)}°` },
  { name: 'format.degInt', label: 'whole °',     fn: v => `${Math.round(v)}°` },
  { name: 'format.degRad', label: 'radians → °', fn: v => `${Math.round(v * 180 / Math.PI)}°` },
);
