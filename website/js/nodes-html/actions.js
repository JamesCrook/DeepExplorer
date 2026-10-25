import { SYS } from '../omni-support/sys.js';

/* ─────────────────────────────────────────────────────────────────────────────
actions — what an on entry can do, as action.<name> records in SYS.FUNCTIONS.

Each record names its arguments, which is what lets the short form be
positional: 'nav note {label}' is { kind: 'note', target: '{label}' }.  The
harness has already filled {key} placeholders from the item and params, and
hands fn a ctx of { harness, app, model, params, node, item, event?, data? }.

  set     param value     write a param ('true', 'false' and numbers coerced)
  toggle  param           flip a boolean param
  select  group key?      make key (default: the item's) active in group
  nav     kind target     go somewhere.  The panopticon has nowhere to go, so
                          it records 'kind → target' in the nav param and
                          tells the model (onNav), which is where D+ would
                          load a note, a server or an index.
  emit    event           hand a named event to the model (onEmit), for what
                          only the application knows: sending a message,
                          receiving files.
  scroll  key             bring the node with that key into view

Adding an action is a push from any nugget; nothing else changes.
──────────────────────────────────────────────────────────────────────────── */

const coerceArg = (v) => {
  if (typeof v !== 'string') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
};

SYS.FUNCTIONS.push(
  { name: 'action.set', args: ['param', 'value'],
    fn: (ctx, a) => ctx.harness.setParam(a.param, coerceArg(a.value)) },
  { name: 'action.toggle', args: ['param'],
    fn: (ctx, a) => ctx.harness.setParam(a.param, !ctx.params[a.param]) },
  { name: 'action.select', args: ['group', 'key'],
    fn: (ctx, a) => ctx.harness.setParam(a.group, a.key ?? ctx.item?.value?.key ?? ctx.item?.value?.id) },
  { name: 'action.nav', args: ['kind', 'target'],
    fn: (ctx, a) => { ctx.harness.setParam('nav', `${a.kind} → ${a.target}`); ctx.model.onNav?.(a.kind, a.target, ctx); } },
  { name: 'action.emit', args: ['event'],
    fn: (ctx, a) => ctx.model.onEmit?.(a.event, ctx) },
  { name: 'action.scroll', args: ['key'],
    fn: (ctx, a) => ctx.harness.find(n => String(n.value?.key) === String(a.key))
      ?.inst?.el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) },
);
