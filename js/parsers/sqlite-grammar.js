import {Parser} from './parser.js'

// ── SQLite SQL ──────────────────────────────────────────
// #sql/spec/grammar
Parser
  .addRep('SQL', ['sql_stmt', /^\s*;?\s*/])

  // ── Statements ──
  .addOr('sql_stmt', [
    'sql_select', 'sql_insert', 'sql_update', 'sql_delete',
    'sql_create_table', 'sql_create_index', 'sql_drop',
    'sql_alter', 'sql_begin', 'sql_commit', 'sql_rollback',
    'sql_pragma', 'sql_explain'
  ])

  // ── SELECT ──
  .addSeq('sql_select', [
    'sql_select_core', 'sql_compound_tail', 'sql_orderby', 'sql_limit'
  ])
  .addSeq('sql_select_core', [
    /^\s*(SELECT)\s+/i,
    'sql_distinct_opt', 'sql_result_cols',
    'sql_from', 'sql_where', 'sql_groupby'
  ])
  .addSeq('sql_distinct_opt', [/^\s*(DISTINCT|ALL)?/i])

  // compound: UNION / INTERSECT / EXCEPT tails, flat array
  .addRep('sql_compound_tail', ['sql_compound_op', 'sql_select_core'])
  .addSeq('sql_compound_op', [/^\s*(UNION\s+ALL|UNION|INTERSECT|EXCEPT)\s+/i])

  // Result columns
  .addRep('sql_result_cols', ['sql_result_col', /^\s*,?\s*/])
  .addOr('sql_result_col', ['sql_star', 'sql_aliased_expr'])
  .addSeq('sql_star', [/^(\*)/])
  .addSeq('sql_aliased_expr', ['sql_expr', 'sql_alias_opt'])
  .addSeq('sql_alias_opt', [/^\s*(?:AS\s+)?/i, /^([a-zA-Z_]\w*)?/])

  // ── FROM ──
  .addOr('sql_from', ['sql_from_clause', /^()/])
  .addSeq('sql_from_clause', [/^\s*FROM\s+/i, 'sql_table_sources'])
  .addRep('sql_table_sources', ['sql_table_or_join', /^\s*,?\s*/])
  .addOr('sql_table_or_join', ['sql_join', 'sql_table_ref'])
  .addOr('sql_table_ref', ['sql_subquery', 'sql_table_name'])
  .addSeq('sql_table_name', [
    /^\s*([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)/,
    'sql_alias_opt'
  ])
  .addSeq('sql_subquery', [/^\s*\(\s*/, 'sql_select', /^\s*\)/, 'sql_alias_opt'])

  // ── JOIN ──
  .addSeq('sql_join', [
    'sql_table_ref', 'sql_join_op', 'sql_table_ref', 'sql_join_constraint'
  ])
  .addSeq('sql_join_op', [
    /^\s*(NATURAL\s+)?/i,
    /^(LEFT\s+OUTER|LEFT|INNER|CROSS)?\s*/i,
    /^(JOIN)\s+/i
  ])
  .addOr('sql_join_constraint', ['sql_join_on', 'sql_join_using', /^()/])
  .addSeq('sql_join_on', [/^\s*ON\s+/i, 'sql_expr'])
  .addSeq('sql_join_using', [
    /^\s*USING\s*\(\s*/i, 'sql_ident_list', /^\s*\)/
  ])

  // ── WHERE / GROUP BY / HAVING / ORDER BY / LIMIT ──
  .addOr('sql_where', ['sql_where_clause', /^()/])
  .addSeq('sql_where_clause', [/^\s*WHERE\s+/i, 'sql_expr'])

  .addOr('sql_groupby', ['sql_groupby_clause', /^()/])
  .addSeq('sql_groupby_clause', [
    /^\s*GROUP\s+BY\s+/i, 'sql_expr_list', 'sql_having'
  ])
  .addOr('sql_having', ['sql_having_clause', /^()/])
  .addSeq('sql_having_clause', [/^\s*HAVING\s+/i, 'sql_expr'])

  .addOr('sql_orderby', ['sql_orderby_clause', /^()/])
  .addSeq('sql_orderby_clause', [/^\s*ORDER\s+BY\s+/i, 'sql_ordering_list'])
  .addRep('sql_ordering_list', ['sql_ordering_term', /^\s*,?\s*/])
  .addSeq('sql_ordering_term', ['sql_expr', /^\s*(ASC|DESC)?/i])

  .addOr('sql_limit', ['sql_limit_clause', /^()/])
  .addSeq('sql_limit_clause', [
    /^\s*LIMIT\s+/i, 'sql_expr', 'sql_offset_opt'
  ])
  .addOr('sql_offset_opt', ['sql_offset', /^()/])
  .addSeq('sql_offset', [/^\s*(?:OFFSET|,)\s*/i, 'sql_expr'])

  // ── INSERT ──
  .addSeq('sql_insert', [
    /^\s*(INSERT|REPLACE)\s+/i,
    /^(OR\s+(?:REPLACE|ROLLBACK|ABORT|FAIL|IGNORE))?\s*/i,
    /^INTO\s+/i,
    'sql_table_name', 'sql_insert_cols', 'sql_insert_body'
  ])
  .addOr('sql_insert_cols', ['sql_col_list', /^()/])
  .addSeq('sql_col_list', [/^\s*\(\s*/, 'sql_ident_list', /^\s*\)/])
  .addOr('sql_insert_body', ['sql_values', 'sql_select', 'sql_default_values'])
  .addSeq('sql_values', [/^\s*VALUES\s*/i, 'sql_value_rows'])
  .addRep('sql_value_rows', ['sql_value_row', /^\s*,?\s*/])
  .addSeq('sql_value_row', [/^\s*\(\s*/, 'sql_expr_list', /^\s*\)/])
  .addSeq('sql_default_values', [/^\s*(DEFAULT\s+VALUES)/i])

  // ── UPDATE ──
  .addSeq('sql_update', [
    /^\s*(UPDATE)\s+/i,
    /^(OR\s+(?:REPLACE|ROLLBACK|ABORT|FAIL|IGNORE))?\s*/i,
    'sql_table_name', /^\s*SET\s+/i,
    'sql_set_list', 'sql_where'
  ])
  .addRep('sql_set_list', ['sql_set_pair', /^\s*,?\s*/])
  .addSeq('sql_set_pair', ['sql_ident', /^\s*=\s*/, 'sql_expr'])

  // ── DELETE ──
  .addSeq('sql_delete', [
    /^\s*(DELETE\s+FROM)\s+/i, 'sql_table_name', 'sql_where'
  ])

  // ── CREATE TABLE ──
  .addSeq('sql_create_table', [
    /^\s*(CREATE)\s+/i,
    /^(TEMP|TEMPORARY)?\s*/i,
    /^(TABLE)\s+/i,
    /^(IF\s+NOT\s+EXISTS\s+)?/i,
    'sql_table_name', 'sql_table_def'
  ])
  .addOr('sql_table_def', ['sql_col_defs', 'sql_create_as'])
  .addSeq('sql_create_as', [/^\s*AS\s+/i, 'sql_select'])
  .addSeq('sql_col_defs', [
    /^\s*\(\s*/, 'sql_col_def_list', /^\s*\)/
  ])
  .addRep('sql_col_def_list', ['sql_col_def_or_constraint', /^\s*,?\s*/])
  .addOr('sql_col_def_or_constraint', ['sql_table_constraint', 'sql_col_def'])
  .addSeq('sql_col_def', [
    'sql_ident', 'sql_type_name', 'sql_col_constraints'
  ])
  .addSeq('sql_type_name', [/^\s*([A-Za-z_]\w*(?:\s+[A-Za-z_]\w*)*)?/])
  .addRep('sql_col_constraints', ['sql_col_constraint'])
  .addOr('sql_col_constraint', [
    'sql_primary_key_col', 'sql_not_null', 'sql_unique_col',
    'sql_default_val', 'sql_references', 'sql_check'
  ])
  .addSeq('sql_primary_key_col', [
    /^\s*(PRIMARY\s+KEY)/i, /^\s*(ASC|DESC)?/i,
    /^\s*(AUTOINCREMENT)?/i
  ])
  .addSeq('sql_not_null', [/^\s*(NOT\s+NULL)/i])
  .addSeq('sql_unique_col', [/^\s*(UNIQUE)/i])
  .addSeq('sql_default_val', [/^\s*DEFAULT\s+/i, 'sql_expr'])
  .addSeq('sql_references', [
    /^\s*REFERENCES\s+/i, 'sql_ident',
    'sql_insert_cols'
  ])
  .addSeq('sql_check', [/^\s*CHECK\s*\(\s*/i, 'sql_expr', /^\s*\)/])

  // Table-level constraints
  .addOr('sql_table_constraint', [
    'sql_pk_table', 'sql_unique_table', 'sql_fk_table', 'sql_check'
  ])
  .addSeq('sql_pk_table', [
    /^\s*(PRIMARY\s+KEY)\s*\(\s*/i, 'sql_ident_list', /^\s*\)/
  ])
  .addSeq('sql_unique_table', [
    /^\s*(UNIQUE)\s*\(\s*/i, 'sql_ident_list', /^\s*\)/
  ])
  .addSeq('sql_fk_table', [
    /^\s*(FOREIGN\s+KEY)\s*\(\s*/i, 'sql_ident_list',
    /^\s*\)\s*REFERENCES\s+/i, 'sql_ident', 'sql_insert_cols'
  ])

  // ── CREATE INDEX / DROP / ALTER / TX / PRAGMA ──
  .addSeq('sql_create_index', [
    /^\s*(CREATE)\s+/i,
    /^(UNIQUE\s+)?/i,
    /^(INDEX)\s+/i,
    /^(IF\s+NOT\s+EXISTS\s+)?/i,
    'sql_ident', /^\s*ON\s+/i, 'sql_ident',
    /^\s*\(\s*/, 'sql_ordering_list', /^\s*\)/,
    'sql_where'
  ])
  .addSeq('sql_drop', [
    /^\s*(DROP)\s+/i, /^(TABLE|INDEX|VIEW|TRIGGER)\s+/i,
    /^(IF\s+EXISTS\s+)?/i, 'sql_ident'
  ])
  .addSeq('sql_alter', [
    /^\s*(ALTER\s+TABLE)\s+/i, 'sql_ident', 'sql_alter_action'
  ])
  .addOr('sql_alter_action', ['sql_rename_to', 'sql_add_col'])
  .addSeq('sql_rename_to', [/^\s*RENAME\s+TO\s+/i, 'sql_ident'])
  .addSeq('sql_add_col', [/^\s*ADD\s+(?:COLUMN\s+)?/i, 'sql_col_def'])
  .addSeq('sql_begin', [/^\s*(BEGIN)\s*/i, /^(DEFERRED|IMMEDIATE|EXCLUSIVE)?\s*/i, /^(TRANSACTION)?/i])
  .addSeq('sql_commit', [/^\s*(COMMIT|END)\s*/i, /^(TRANSACTION)?/i])
  .addSeq('sql_rollback', [/^\s*(ROLLBACK)\s*/i, /^(TRANSACTION)?/i])
  .addSeq('sql_pragma', [/^\s*(PRAGMA)\s+/i, 'sql_ident', 'sql_pragma_val'])
  .addOr('sql_pragma_val', ['sql_pragma_eq', 'sql_pragma_call', /^()/])
  .addSeq('sql_pragma_eq', [/^\s*=\s*/, 'sql_expr'])
  .addSeq('sql_pragma_call', [/^\s*\(\s*/, 'sql_expr', /^\s*\)/])
  .addSeq('sql_explain', [/^\s*(EXPLAIN)\s+/i, /^(QUERY\s+PLAN\s+)?/i, 'sql_stmt'])

  // ── Expressions (flat, no precedence tower) ──
  .addRep('sql_expr_list', ['sql_expr', /^\s*,?\s*/])
  .addRep('sql_expr', ['sql_atom', 'sql_expr_tail'])
  .addOr('sql_expr_tail', [
    'sql_binop', 'sql_is_null', 'sql_between',
    'sql_in', 'sql_like', 'sql_collate', 'sql_cast_tail', /^()/
  ])
  .addSeq('sql_binop', [
    /^\s*(AND|OR|IS\s+NOT|IS|NOT|IN|LIKE|GLOB|MATCH|REGEXP|[+\-*\/%]|<>|!=|<=|>=|<<|>>|[<>=&|])\s*/i,
    'sql_atom'
  ])
  .addSeq('sql_is_null', [/^\s*(ISNULL|NOTNULL|NOT\s+NULL)/i])
  .addSeq('sql_between', [
    /^\s*(NOT\s+)?BETWEEN\s+/i, 'sql_atom', /^\s*AND\s+/i, 'sql_atom'
  ])
  .addSeq('sql_in', [
    /^\s*(NOT\s+)?IN\s*\(\s*/i, 'sql_in_body', /^\s*\)/
  ])
  .addOr('sql_in_body', ['sql_select', 'sql_expr_list'])
  .addSeq('sql_like', [
    /^\s*(NOT\s+)?LIKE\s+/i, 'sql_atom', 'sql_escape_opt'
  ])
  .addOr('sql_escape_opt', ['sql_escape', /^()/])
  .addSeq('sql_escape', [/^\s*ESCAPE\s+/i, 'sql_atom'])
  .addSeq('sql_collate', [/^\s*(COLLATE)\s+/i, 'sql_ident'])
  .addSeq('sql_cast_tail', [/^\s*(::)\s*/, 'sql_type_name'])

  // ── Atoms ──
  .addOr('sql_atom', [
    'sql_paren_expr', 'sql_cast', 'sql_case', 'sql_exists',
    'sql_func_call', 'sql_unary', 'sql_literal',
    'sql_bind_param', 'sql_column_ref'
  ])
  .addSeq('sql_paren_expr', [/^\s*\(\s*/, 'sql_expr', /^\s*\)/])
  .addSeq('sql_cast', [
    /^\s*CAST\s*\(\s*/i, 'sql_expr', /^\s+AS\s+/i,
    'sql_type_name', /^\s*\)/
  ])
  .addSeq('sql_case', [
    /^\s*(CASE)\s+/i, 'sql_case_operand',
    'sql_when_list', 'sql_else_opt', /^\s*END/i
  ])
  .addOr('sql_case_operand', ['sql_atom', /^()/])
  .addRep('sql_when_list', ['sql_when'])
  .addSeq('sql_when', [/^\s*WHEN\s+/i, 'sql_expr', /^\s*THEN\s+/i, 'sql_expr'])
  .addOr('sql_else_opt', ['sql_else_clause', /^()/])
  .addSeq('sql_else_clause', [/^\s*ELSE\s+/i, 'sql_expr'])
  .addSeq('sql_exists', [/^\s*(NOT\s+)?EXISTS\s*\(\s*/i, 'sql_select', /^\s*\)/])
  .addSeq('sql_func_call', [
    'sql_ident', /^\s*\(\s*/, 'sql_func_args', /^\s*\)/
  ])
  .addOr('sql_func_args', ['sql_star', 'sql_func_arg_list', /^()/])
  .addSeq('sql_func_arg_list', ['sql_distinct_opt', 'sql_expr_list'])
  .addSeq('sql_unary', [/^\s*(-|NOT|\+|~)\s*/i, 'sql_atom'])

  // ── Literals & identifiers ──
  .addOr('sql_literal', [
    'sql_string_lit', 'sql_blob_lit', 'sql_number_lit',
    'sql_null_lit', 'sql_current_lit'
  ])
  .addSeq('sql_string_lit', [/^\s*('(?:[^']|'')*')/])
  .addSeq('sql_blob_lit', [/^\s*(x'[0-9a-fA-F]*')/i])
  .addSeq('sql_number_lit', [/^\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/])
  .addSeq('sql_null_lit', [/^\s*(NULL)/i])
  .addSeq('sql_current_lit', [
    /^\s*(CURRENT_DATE|CURRENT_TIME|CURRENT_TIMESTAMP)/i
  ])
  .addSeq('sql_bind_param', [/^\s*(\?(?:\d+)?|:[a-zA-Z_]\w*|@[a-zA-Z_]\w*)/])
  .addSeq('sql_column_ref', [
    /^\s*([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*){0,2})/
  ])
  .addOr('sql_ident', ['sql_quoted_ident', 'sql_bare_ident'])
  .addSeq('sql_bare_ident', [/^\s*([a-zA-Z_]\w*)/])
  .addSeq('sql_quoted_ident', [/^\s*("(?:[^"]|"")*"|`(?:[^`]|``)*`|\[(?:[^\]])*\])/])
  .addRep('sql_ident_list', ['sql_ident', /^\s*,?\s*/])


const sqlExprConfig = {
  precedence: {
    'OR': 1,
    'AND': 2,
    'NOT': 3,   // also prefix
    '=': 4, '!=': 4, '<>': 4, '<': 4, '>': 4, '<=': 4, '>=': 4,
    'IS': 4, 'IS NOT': 4,
    'LIKE': 4, 'GLOB': 4, 'MATCH': 4, 'REGEXP': 4,
    'IN': 4, 'NOT IN': 4,
    'BETWEEN': 4, 'NOT BETWEEN': 4,
    '||': 5,  // string concatenation in SQL
    '+': 6, '-': 6,
    '*': 7, '/': 7, '%': 7,
    '&': 8, '|': 8, '<<': 8, '>>': 8,
    '~': 9,
  },
  rightAssoc: [],
  prefix: ['NOT', '-', '+', '~'],
  postfix: ['ISNULL', 'NOTNULL'],
  operatorTypes: ['sql_binop', 'sql_is_null'],
  opText: node => {
    const v = node.value?.[1] || node.value || '';
    return v.toUpperCase().trim();
  },
  pairs: {},  // SQL has no ternary; CASE/WHEN is structural
};

export { sqlExprConfig }  