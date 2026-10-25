/**
 * @fileoverview A parameterised syntax-highlighter factory.
 *
 * Usage:
 *   const proc = SyntaxProcessor(jsonConfig);
 *   proc.htmlOf('{ "a": 1 }');
 *
 * Each grammar is described by a plain config object:
 *   {
 *     rule:   'JSON',                        // parser entry rule
 *     colors: { comment:'#3b3', ... },        // palette (keys are semantic roles)
 *     handlers: (wrap, colors) => ({ ... })   // node-type → render function
 *   }
 *
 * A handler receives (ast, ctx) where ctx = { val, children }.
 * Return a string of HTML.  The special key 'default' is the fallback.
 */

import {Parser} from './parser.js'
import { createHandlerRegistry, AstNode } from '../utilities2/ast-manager.js'

// ── factory ────────────────────────────────────────────────────────────

function SyntaxProcessor(config) {
  const parser   = Parser.createParserFromRule(config.rule);
  const registry = createHandlerRegistry();
  const colors   = config.colors;
  let input      = '';

  // Build and register handlers from the config
  const handlers = config.handlers(wrap, colors);
  registry.registerGroup(() => ({ print: handlers }));

  // ── core ───────────────────────────────────────────────────────────

  function pretty(ast) {
    const val = safeString(ast.value || '');

    let children = '';
    let lastPos  = ast.jref;
    for (const node of ast.subtree) {
      if (node.jref > lastPos)
        children += safeString(input.substring(lastPos, node.jref));
      children += pretty(node);
      lastPos = node.jend;
    }
    if (ast.jend > lastPos)
      children += safeString(input.substring(lastPos, ast.jend));

    return registry.print(ast, { val, children });
  }

  // ── helpers ────────────────────────────────────────────────────────

  function safeString(str) {
    if (!str) return '';
    if (typeof str !== 'string')
      str = str[1] !== undefined ? str[1] : str[0];
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function wrap(color, value) {
    return value
      ? '<span style="color:' + color + '">' + value + '</span>'
      : '';
  }

  // ── public API ─────────────────────────────────────────────────────

  return {
    astOf:  (text) => parser.parse(text),
    htmlOf: (text) => { input = text; return '<pre>' + pretty(parser.parse(text)) + '</pre>'; },
    pretty,
  };
}

export { SyntaxProcessor }

