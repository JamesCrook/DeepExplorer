import {Parser} from './parser.js'

// ── JavaScript (flat-expression, ~70 rules) ─────────────
Parser
  // ── Program ──
  .addRep('JavaScript', [/^\s*/, 'js_top'])
  .addOr('js_top', ['js_import', 'js_export', 'js_statement'])

  // ── Import ──
  .addOr('js_import', [
    'js_import_named', 'js_import_default_named', 'js_import_default',
    'js_import_star', 'js_import_bare'
  ])
  .addSeq('js_import_named', [
    /^(import)\s*\{\s*/, 'js_specifiers', /^\s*\}\s*from\s*/, 'js_string', /^\s*;?/
  ])
  .addSeq('js_import_default_named', [
    /^(import)\s*/, 'js_ident', /^\s*,\s*\{\s*/, 'js_specifiers',
    /^\s*\}\s*from\s*/, 'js_string', /^\s*;?/
  ])
  .addSeq('js_import_default', [
    /^(import)\s*/, 'js_ident', /^\s*from\s*/, 'js_string', /^\s*;?/
  ])
  .addSeq('js_import_star', [
    /^(import)\s*\*\s*as\s*/, 'js_ident', /^\s*from\s*/, 'js_string', /^\s*;?/
  ])
  .addSeq('js_import_bare', [
    /^(import)\s*/, 'js_string', /^\s*;?/
  ])
  .addRep('js_specifiers', ['js_specifier', /^\s*,?\s*/])
  .addSeq('js_specifier', [/^([a-zA-Z_$][\w$]*)\s*/, 'js_as_opt'])
  .addOr('js_as_opt', ['js_as_rename', /^/])
  .addSeq('js_as_rename', [/^as\s+/, 'js_ident'])

  // ── Export ──
  .addOr('js_export', ['js_export_named', 'js_export_default', 'js_export_decl'])
  .addSeq('js_export_named', [
    /^(export)\s*\{\s*/, 'js_specifiers', /^\s*\}/, 'js_from_opt', /^\s*;?/
  ])
  .addOr('js_from_opt', ['js_from_clause', /^/])
  .addSeq('js_from_clause', [/^\s*from\s*/, 'js_string'])
  .addSeq('js_export_default', [
    /^(export\s+default)\s*/, 'js_statement'
  ])
  .addSeq('js_export_decl', [
    /^(export)\s*/, 'js_statement'
  ])

  // ── Statements ──
  // Control flow first (so `if` isn't swallowed as token),
  // then class/function declarations, then expr+block, then expr+semi.
  .addOr('js_statement', [
    'js_comment',
    'js_if', 'js_for', 'js_while', 'js_do_while',
    'js_switch', 'js_try',
    'js_class', 'js_func_decl',
    'js_block',
    'js_expr_block',
    'js_expr_stmt',
    'js_empty_stmt'
  ])

  // ── Comments ──
  .addOr('js_comment', ['js_block_comment', 'js_line_comment'])
  .addSeq('js_line_comment', [/^(\/\/[^\n]*\n?)/])
  .addSeq('js_block_comment', [/^(\/\*[\s\S]*?\*\/)/])

  // ── Block ──
  .addSeq('js_block', [/^(\{)\s*/, 'js_body', /^\s*(\})/])
  .addRep('js_body', [/^\s*/, 'js_statement'])

  // ── If ──
  .addSeq('js_if', [
    /^\s*(if)\s*/, 'js_paren_group', /^\s*/, 'js_statement', 'js_else_opt'
  ])
  .addOr('js_else_opt', ['js_else_clause', /^/])
  .addSeq('js_else_clause', [/^\s*(else)\s*/, 'js_statement'])

  // ── For (forgiving interior, same as asy) ──
  .addSeq('js_for', [
    /^\s*(for)\s*/, /^(\()/, 'js_for_interior', /^\s*(\))/,
    /^\s*/, 'js_statement'
  ])
  .addRep('js_for_interior', [/^\s*/, 'js_for_atom'])
  .addOr('js_for_atom', [/^(;)/, /^(,)/, 'js_expr_atom'])

  // ── While / Do-while ──
  .addSeq('js_while', [/^\s*(while)\s*/, 'js_paren_group', /^\s*/, 'js_statement'])
  .addSeq('js_do_while', [
    /^\s*(do)\b\s*/, 'js_statement',
    /^\s*(while)\s*/, 'js_paren_group', /^\s*;?/
  ])

  // ── Switch ──
  .addSeq('js_switch', [
    /^\s*(switch)\s*/, 'js_paren_group', /^\s*\{\s*/, 'js_cases', /^\s*\}/
  ])
  .addRep('js_cases', [/^\s*/, 'js_case'])
  .addOr('js_case', ['js_case_clause', 'js_default_clause'])
  .addSeq('js_case_clause', [/^(case)\s*/, 'js_expression', /^\s*:\s*/, 'js_case_body'])
  .addSeq('js_default_clause', [/^(default)\s*:\s*/, 'js_case_body'])
  .addRep('js_case_body', [/^\s*/, 'js_statement'])

  // ── Try / Catch / Finally ──
  .addSeq('js_try', [/^\s*(try)\s*/, 'js_block', 'js_catch_opt', 'js_finally_opt'])
  .addOr('js_catch_opt', ['js_catch', /^/])
  .addSeq('js_catch', [/^\s*(catch)\s*/, 'js_catch_param_opt', /^\s*/, 'js_block'])
  .addOr('js_catch_param_opt', ['js_catch_param', /^/])
  .addSeq('js_catch_param', [/^\(\s*/, 'js_ident', /^\s*\)/])
  .addOr('js_finally_opt', ['js_finally', /^/])
  .addSeq('js_finally', [/^\s*(finally)\s*/, 'js_block'])

  // ── Class ──
  .addSeq('js_class', [
    /^(class)\b\s*/, 'js_ident_opt', 'js_extends_opt',
    /^\s*\{\s*/, 'js_class_body', /^\s*\}/
  ])
  .addOr('js_ident_opt', ['js_ident', /^/])
  .addOr('js_extends_opt', ['js_extends', /^/])
  .addSeq('js_extends', [/^\s*(extends)\s*/, 'js_expression'])
  .addRep('js_class_body', [/^\s*/, 'js_class_member'])
  // Class members are just expressions optionally followed by blocks or semis.
  // static get #foo() {} → token token token paren_group block.
  .addOr('js_class_member', [
    'js_comment', 'js_expr_block', 'js_expr_stmt', 'js_empty_stmt'
  ])

  // ── Function declaration (only at statement level) ──
  .addSeq('js_func_decl', [
    /^(function)\s*(\*?)\s*/, 'js_ident', /^\s*/, 'js_paren_group', /^\s*/, 'js_block'
  ])

  // ── Expression statements ──
  .addSeq('js_expr_block', ['js_expression', /^\s*/, 'js_block'])
  .addSeq('js_expr_stmt', ['js_expression', /^\s*;?\s*/])
  .addSeq('js_empty_stmt', [/^(;)/])

  // ══════════════════════════════════════════════════════
  // ── Expressions (flat atom + tail, no precedence) ──
  // ══════════════════════════════════════════════════════

  .addSeq('js_expression', ['js_expr_atom', 'js_expr_tail'])
  .addRep('js_expr_tail', [/^\s*/, 'js_expr_atom'])

  .addOr('js_expr_atom', [
    'js_comment',
    'js_paren_group',
    'js_bracket_group',
    'js_arrow',
    'js_template',
    'js_regex',
    'js_string',
    'js_number',
    'js_operator',
    'js_ident'
  ])

  // ── Grouping (same empty/full split as asy) ──
  .addOr('js_paren_group', ['js_paren_full', 'js_paren_empty'])
  .addSeq('js_paren_full', [/^(\()\s*/, 'js_comma_list', /^\s*(\))/])
  .addSeq('js_paren_empty', [/^(\(\s*\))/])

  .addOr('js_bracket_group', ['js_bracket_full', 'js_bracket_empty'])
  .addSeq('js_bracket_full', [/^(\[)\s*/, 'js_comma_list', /^\s*(\])/])
  .addSeq('js_bracket_empty', [/^(\[\s*\])/])

  .addRep('js_comma_list', [/^\s*/, 'js_expression', 'maybe_comma'])

  // ── Arrow (only the => and body; params already parsed as paren_group or ident) ──
  .addSeq('js_arrow', [/^(=>)\s*/, 'js_arrow_body'])
  .addOr('js_arrow_body', ['js_block', 'js_expression'])

  // ── Template literals ──
  .addSeq('js_template', [/^`/, 'js_template_parts', /^`/])
  .addRep('js_template_parts', ['js_template_part'])
  .addOr('js_template_part', ['js_template_interp', 'js_template_text'])
  .addSeq('js_template_interp', [/^\$\{/, 'js_expression', /^\}/])
  .addSeq('js_template_text', [/^([^`$]+|\$(?!\{))/])

  // ── Terminals ──
  .addSeq('js_regex', [/^(\/(?:[^\/\\\n]|\\.)+\/[gimsuy]*)/])
  .addSeq('js_string', [/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/])
  .addSeq('js_number', [/^(0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+|\d+\.?\d*(?:[eE][+-]?\d+)?)/])
  .addSeq('js_operator', [/^(\.{3}|=>|[+\-*/%=<>!&|^~?:]+|\.)/])
  .addSeq('js_ident', [/^([a-zA-Z_$][\w$]*)/])


const jsExprConfig = {
  precedence: {
    '=': 1, '+=': 1, '-=': 1, '*=': 1, '/=': 1, '%=': 1,
    '||=': 1, '&&=': 1, '??=': 1,
    '??': 2,
    '||': 3,
    '&&': 4,
    '|': 5,  '^': 6,  '&': 7,
    '==': 8, '!=': 8, '===': 8, '!==': 8,
    '<': 9, '>': 9, '<=': 9, '>=': 9, 'in': 9, 'instanceof': 9,
    '<<': 10, '>>': 10, '>>>': 10,
    '+': 11, '-': 11,
    '*': 12, '/': 12, '%': 12,
    '**': 13,
  },
  rightAssoc: ['=', '+=', '-=', '*=', '/=', '%=', '||=', '&&=', '??=', '**'],
  prefix: ['!', '~', '-', '+', 'typeof', 'void', 'delete', 'await', 'yield', '...'],
  postfix: ['++', '--'],
  operatorTypes: ['js_operator', 'js_keyword'],
  opText: node => node.value?.[1] || node.value || '',
  pairs: { '?': { separator: ':', type: 'ternary' } },
};

export { jsExprConfig }   