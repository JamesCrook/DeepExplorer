import {Parser} from './parser.js'
import {SyntaxProcessor} from './syntax-processor.js'

// #asy/spec/grammar

Parser
  // ============ Asymptote ============

  // --- Program ---
  .addRep('ASY', [/^\s*/, 'asy_top'])
  .addOr('asy_top', [
    'asy_comment', 'asy_import', 'asy_struct', 'asy_typedef', 'asy_statement'
  ])

  // --- Comments (block before line so /*** ...***/ wins over //) ---
  .addOr('asy_comment', ['asy_block_comment', 'asy_line_comment'])
  .addSeq('asy_line_comment', [/^(\/\/[^\n]*\n?)/])
  .addSeq('asy_block_comment', [/^(\/\*[\s\S]*?\*\/)/])

  // --- Imports: import/include/access/unravel/from ---
  // Forgiving: just keyword then atoms until semicolon.
  // Covers "import graph;", "from graph access axes;", "include 'foo.asy';",
  // "access graph as g;", "unravel graph;"
  .addSeq('asy_import', [
    /^\s*(import|include|access|unravel|from)\b/,
    'asy_import_body', /^\s*/, 'asy_semi'
  ])
  .addRep('asy_import_body', [/^\s*/, 'asy_import_atom'])
  .addOr('asy_import_atom', ['quotedString', /^(as|access|,)/, 'token'])

  // --- Struct ---
  .addSeq('asy_struct', [/^\s*(struct)\b\s*/, 'token', /^\s*/, 'asy_block'])

  // --- Typedef (flat expression covers "typedef real realfunc(real)") ---
  .addSeq('asy_typedef', [/^\s*(typedef)\b\s*/, 'asy_expression', /^\s*/, 'asy_semi'])

  // --- Statements ---
  // Order matters: control flow before expr_block before expr_stmt,
  // so "if (...) {...}" isn't swallowed as expression + block.
  .addOr('asy_statement', [
    'asy_comment',
    'asy_if', 'asy_for', 'asy_while', 'asy_do_while',
    'asy_return_val', 'asy_return_void',
    'asy_break', 'asy_continue',
    'asy_block',
    'asy_expr_init',     // expression + init list  (new int[] {1,2,3};)
    'asy_expr_block',    // expression + block       (void f() { body })
    'asy_expr_stmt',     // expression + semicolon   (draw(x);)
    'asy_empty_stmt'
  ])
  .addSeq('asy_expr_init', ['asy_expression', /^\s*/, 'asy_init_list', /^\s*/, 'asy_semi'])


  // --- Block ---
  .addSeq('asy_block', [/^(\{)\s*/, 'asy_body', /^\s*(\})/])
  .addRep('asy_body', [/^\s*/, 'asy_statement'])

  // --- If (try if-else before if-only to avoid dangling-else) ---
  .addSeq('asy_if', [
    /^\s*(if)\s*/, 'asy_paren_group', /^\s*/, 'asy_statement', 'asy_else_opt'
  ])
  .addOr('asy_else_opt', ['asy_else_clause', /^/])
  .addSeq('asy_else_clause', [/^\s*(else)\b\s*/, 'asy_statement'])

  // --- For (forgiving interior: flat atoms, semicolons, and commas) ---
  // Works for both "for(int i=0; i<n; ++i)" and "for(int x : a)"
  // since : is already an operator atom. Semantic pass distinguishes.
  .addSeq('asy_for', [
    /^\s*(for)\s*/, /^(\()/, 'asy_for_interior', /^\s*(\))/,
    /^\s*/, 'asy_statement'
  ])
  .addRep('asy_for_interior', [/^\s*/, 'asy_for_atom'])
  .addOr('asy_for_atom', [/^(;)/, /^(,)/, 'asy_expr_atom'])

  // --- While / Do-while ---
  .addSeq('asy_while', [/^\s*(while)\s*/, 'asy_paren_group', /^\s*/, 'asy_statement'])
  .addSeq('asy_do_while', [
    /^\s*(do)\b\s*/, 'asy_statement',
    /^\s*(while)\s*/, 'asy_paren_group', /^\s*/, 'asy_semi'
  ])

  // --- Return / Break / Continue ---
  // return_val before return_void so "return expr;" is tried first.
  .addSeq('asy_return_val', [/^\s*(return)\b\s*/, 'asy_expression', /^\s*/, 'asy_semi'])
  .addSeq('asy_return_void', [/^\s*(return)\b\s*/, 'asy_semi'])
  .addSeq('asy_break', [/^\s*(break)\b\s*/, 'asy_semi'])
  .addSeq('asy_continue', [/^\s*(continue)\b\s*/, 'asy_semi'])

  // --- Expression statements ---
  // expr_block: "void f(real x) { ... }" — no trailing semi needed.
  // expr_stmt: "draw(circle((0,0),1));" — semi required.
  .addSeq('asy_expr_block', ['asy_expression', /^\s*/, 'asy_block'])
  .addSeq('asy_expr_stmt', ['asy_expression', /^\s*/, 'asy_semi'])
  .addSeq('asy_empty_stmt', ['asy_semi'])
  .addSeq('asy_semi', [/^\s*(;)/])

  // ============ Expressions ============
  // Flat: 1+ atoms with whitespace between. No precedence.
  // "draw((0,0)--(1,1)--cycle)" = token paren_group
  // "real x = 3.0"              = token token operator number
  // Semantic pass rebuilds structure.

  .addSeq('asy_expression', ['asy_expr_atom', 'asy_expr_tail'])
  .addRep('asy_expr_tail', [/^\s*/, 'asy_expr_atom'])

  .addOr('asy_expr_atom', [
    'asy_comment',
    'asy_new_expr',        // new type[] {init} / new type(args) { body }
    'asy_paren_group',     // grouping, tuples, calls: (expr, expr, ...)
    'asy_bracket_group',   // indexing, type dims: [expr, expr, ...]
    'asy_brace_expr',      // path direction specifiers: {right}, {dir(30)}
    'quotedString',        // reuse shared pool
    'asy_number',
    'asy_operator',
    'token'                // reuse shared pool — keywords are just tokens
  ])

  // --- Grouping (non-empty vs empty split avoids zero-match rep loops) ---
  .addOr('asy_paren_group', ['asy_paren_full', 'asy_paren_empty'])
  .addSeq('asy_paren_full', [/^(\()\s*/, 'asy_comma_list', /^\s*(\))/])
  .addSeq('asy_paren_empty', [/^(\(\s*\))/])

  .addOr('asy_bracket_group', ['asy_bracket_full', 'asy_bracket_empty'])
  .addSeq('asy_bracket_full', [/^(\[)\s*/, 'asy_comma_list', /^\s*(\])/])
  .addSeq('asy_bracket_empty', [/^(\[\s*\])/])

  // Comma-separated expressions. Reuses shared maybe_comma for trailing/optional commas.
  .addRep('asy_comma_list', [/^\s*/, 'asy_expression', 'maybe_comma'])

  // --- Brace expression (path direction specifiers) ---
  // Matches {expr} but NOT {stmts} — the expression inside must parse
  // without semicolons, so code blocks with "return x;" fail here
  // and fall through to asy_block at the statement level.
  .addSeq('asy_brace_expr', [/^(\{)\s*/, 'asy_expression', /^\s*(\})/])

  // --- New expressions ---
  // "new real[] {1,2,3}" → new, type atoms, init list
  // "new real(real x) { return x^2; }" → new, type atoms, block body
  // If no brace follows (e.g. "new real[10]"), the whole thing fails
  // and "new" falls through to plain token. Still correct, just flat.
  .addSeq('asy_new_expr', [
    /^(new)\b/, /^\s*/, 'asy_new_type', /^\s*/, 'asy_new_body'
  ])
  .addRep('asy_new_type', [/^\s*/, 'asy_new_type_atom'])
  .addOr('asy_new_type_atom', [
    'asy_paren_group', 'asy_bracket_group',
    'asy_number', 'asy_operator', 'token'
  ])
  .addOr('asy_new_body', ['asy_init_list', 'asy_block'])
  .addSeq('asy_init_list', [/^(\{)\s*/, 'asy_comma_list', /^\s*(\})/])

  // --- Terminals ---
  // Extended number: hex (0xFF), scientific (1e-5), standard int/real.
  .addSeq('asy_number', [/^(-?(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?))/])
  // Operators: standard C-like + path ops (.., ..., --, ---,  ::).
  // Dots handled separately so "3.14" (caught by asy_number first) isn't split.
  // Comma deliberately excluded — it lives in asy_comma_list only.
  .addSeq('asy_operator', [/^([+\-*\/%=<>!&|^~?:]+|\.{1,3})/])

const asyConfig = {
  rule: 'ASY',

  colors: {
    keyword:     '#c678dd',   // purple  — control flow, struct, import, new
    string:      '#98c379',   // green
    number:      '#d19a66',   // orange
    comment:     '#5c6370',   // gray
    operator:    '#56b6c2',   // cyan
    punctuation: '#636d83',   // dim gray — ; , ( ) [ ] { }
    token:       '#abb2bf',   // light gray — identifiers
  },

  handlers: (wrap, c) => {
    // Helper: render children, but wrap any regex-captured values
    // (keywords like "if", "for", "return", …) in the keyword color.
    const kw = (_ast, ctx) => ctx.children.replace(
      /^([^<]+)/,            // leading text before first child span = the keyword capture
      m => wrap(c.keyword, m)
    );

    return {
      // ── comments ───────────────────────────────────────────
      'asy_line_comment':  (_ast, ctx) => wrap(c.comment, ctx.val),
      'asy_block_comment': (_ast, ctx) => wrap(c.comment, ctx.val),

      // ── keywords (structural nodes whose regex captures a keyword) ─
      'asy_import':      kw,
      'asy_struct':      kw,
      'asy_typedef':     kw,
      'asy_if':          kw,
      'asy_else_clause': kw,
      'asy_for':         kw,
      'asy_while':       kw,
      'asy_do_while':    kw,
      'asy_return_val':  kw,
      'asy_return_void': kw,
      'asy_break':       kw,
      'asy_continue':    kw,
      'asy_new_expr':    kw,

      // ── terminals ──────────────────────────────────────────
      'quotedString':  (_ast, ctx) => wrap(c.string,   ctx.val),
      'asy_number':    (_ast, ctx) => wrap(c.number,    ctx.val),
      'asy_operator':  (_ast, ctx) => wrap(c.operator,  ctx.val),
      'token':         (_ast, ctx) => wrap(c.token,     ctx.val),

      // ── punctuation ────────────────────────────────────────
      'asy_semi':      (_ast, ctx) => wrap(c.punctuation, ctx.children || ';'),
      'maybe_comma':   (_ast, ctx) => ctx.val ? wrap(c.punctuation, ',') : '',

      // ── structural pass-through ────────────────────────────
      'default':       (_ast, ctx) => ctx.children || ctx.val,
    };
  },
};  

const asyExprConfig = {
  // Asymptote: C-like precedence, plus path operators
  precedence: {
    '=': 1, '+=': 1, '-=': 1, '*=': 1, '/=': 1,
    '?': 2,   // ternary handled via pairs
    '||': 3,
    '&&': 4,
    '|': 5,  '^': 6,  '&': 7,
    '==': 8, '!=': 8,
    '<': 9, '>': 9, '<=': 9, '>=': 9,
    '+': 10, '-': 10,
    '*': 11, '/': 11, '%': 11,
    '**': 12,
    // Path operators: lower than arithmetic so a+b--c+d
    // groups as (a+b)--(c+d) which is what asy users expect
    '--': 5.5, '---': 5.5, '..': 5.5, '...': 5.5, '::': 5.5,
    '^^': 6,
  },
  rightAssoc: ['=', '+=', '-=', '*=', '/=', '**'],
  prefix: ['!', '-', '+', '~', 'new', 'cast'],
  postfix: ['++', '--'],
  operatorTypes: ['asy_operator', 'token'],
  opText: node => node.value?.[1] || node.value || '',
  pairs: { '?': { separator: ':', type: 'ternary' } },
};



const asyProcessor = SyntaxProcessor(asyConfig);
// const cssProcessor = SyntaxProcessor(cssConfig);

const code = `
{
  "key": "value",
  // This is a comment
  "arr": [1, 2, 3],
  "nested": { "deep": "yes" },
  "number": 42,
  "operatorTest": 7 + 4 * 10
}
`;

console.log("AST:",  JSON.stringify(asyProcessor.astOf(code), null, 2));
console.log("HTML:", asyProcessor.htmlOf(code));

export { asyProcessor }
// Auto-generated exports
if (typeof window !== 'undefined') window.asyConfig = asyConfig;
export { asyConfig };
if (typeof window !== 'undefined') window.code = code;
export { code };
export { asyExprConfig } 
