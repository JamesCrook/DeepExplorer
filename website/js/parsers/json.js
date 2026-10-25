/**
 * @fileoverview A parser and syntax highlighter for JavaScript.
 * It handles standard JavaScript syntax as well as nested template literals.
 * The parser generates an Abstract Syntax Tree (AST), and the processor
 * converts this AST into syntax-highlighted HTML.
 */


import { SyntaxProcessor } from "./syntax-processor.js"


// ── grammar configs ────────────────────────────────────────────────────

/**
 * Each config is a self-contained description of "how to highlight grammar X".
 * Adding a new grammar means adding a new object — no framework code changes.
 */

const jsonConfig = {
  rule: 'JSON',

  colors: {
    comment:     '#3b3',
    string:      '#df3',
    number:      '#3ef',
    token:       '#fff',
    punctuation: '#f93',
  },

  handlers: (wrap, c) => ({
    'json_comment':  (_ast, ctx) => wrap(c.comment,     ctx.val),
    'operator':      (_ast, ctx) => wrap(c.string,      ctx.val),
    'doubleQuoted':  (_ast, ctx) => wrap(c.string,      ctx.val),
    'singleQuoted':  (_ast, ctx) => wrap(c.string,      ctx.val),
    'number':        (_ast, ctx) => wrap(c.number,      ctx.val),
    'token':         (_ast, ctx) => wrap(c.token,       ctx.val),
    'json_object':   (_ast, ctx) => ctx.children,
    'json_array':    (_ast, ctx) => ctx.children,
    'maybe_comma':   (_ast, ctx) => ctx.val ? wrap(c.punctuation, ',') : '',
    'open_brace':    (_ast, ctx) => wrap(c.punctuation, '{'),
    'close_brace':   (_ast, ctx) => wrap(c.punctuation, '}'),
    'open_bracket':  (_ast, ctx) => wrap(c.punctuation, '['),
    'close_bracket': (_ast, ctx) => wrap(c.punctuation, ']'),
    'colon':         (_ast, ctx) => wrap(c.punctuation, ':'),
    'equals':        (_ast, ctx) => wrap(c.punctuation, '='),
    'default':       (_ast, ctx) => ctx.children ?? ctx.val,
  }),
};

// Example: a hypothetical CSS grammar config would look like this:
//
// const cssConfig = {
//   rule: 'CSS',
//   colors: {
//     selector:    '#e06c75',
//     property:    '#d19a66',
//     value:       '#98c379',
//     punctuation: '#abb2bf',
//     comment:     '#5c6370',
//     atRule:      '#c678dd',
//   },
//   handlers: (wrap, c) => ({
//     'selector':    (_ast, ctx) => wrap(c.selector,    ctx.val),
//     'property':    (_ast, ctx) => wrap(c.property,    ctx.val),
//     'css_value':   (_ast, ctx) => wrap(c.value,       ctx.val),
//     'css_comment': (_ast, ctx) => wrap(c.comment,     ctx.val),
//     'at_rule':     (_ast, ctx) => wrap(c.atRule,      ctx.val),
//     'open_brace':  (_ast, ctx) => wrap(c.punctuation, '{'),
//     'close_brace': (_ast, ctx) => wrap(c.punctuation, '}'),
//     'default':     (_ast, ctx) => ctx.children || ctx.val,
//   }),
// };


// ── usage ──────────────────────────────────────────────────────────────

const jsProcessor = SyntaxProcessor(jsonConfig);
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

console.log("AST:",  JSON.stringify(jsProcessor.astOf(code), null, 2));
console.log("HTML:", jsProcessor.htmlOf(code));

window.jsProcessor = jsProcessor;
export { jsProcessor }
// Auto-generated exports
if (typeof window !== 'undefined') window.code = code;
export { code };
if (typeof window !== 'undefined') window.jsonConfig = jsonConfig;
export { jsonConfig };
