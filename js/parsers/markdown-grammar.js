import {Parser} from './parser.js'


// ── Markdown (with recursive nesting) ───────────────────
//
// Two tiers: blocks and inlines.
// Containers (blockquotes, lists) recurse into blocks.
// Emphasis is captured as markers, paired downstream.

// #markdown/grammar

Parser

  // ── Document ──
  .addRep('Markdown', [/^[ \t]*/, 'md_block', /^\n*/])

  .addOr('md_block', [
    'md_blank_line',
    'md_fence', 'md_heading_atx', 'md_hr',
    'md_blockquote',
    'md_list_ul', 'md_list_ol',
    'md_table', 'md_html_block', 'md_link_def',
    'md_heading_setext',
    'md_paragraph'
  ])
  .addSeq('md_blank_line', [/^([ \t]*\n)/])

  // ══════════════════════════════════════════════════════
  // ── Blockquote (recursive) ──
  // ══════════════════════════════════════════════════════
  //
  // Strategy: consume > at each line start, parse content
  // as blocks between prefixes. The rep cycles:
  //   consume newline+prefix → parse one block element
  // The first line's prefix is consumed by the seq opener.
  // Nested blockquotes just hit another > after the strip.

  .addSeq('md_blockquote', [
    /^[ \t]{0,3}>[ \t]?/, 'md_bq_first', 'md_bq_rest'
  ])

  // First line after >: try block starts, fall back to inline
  .addOr('md_bq_first', [
    'md_blockquote', 'md_heading_atx', 'md_hr',
    'md_bq_fence',
    'md_list_ul', 'md_list_ol',
    'md_bq_inline'
  ])

  // Subsequent lines: each consumes \n then > prefix
  .addRep('md_bq_rest', ['md_bq_cont'])
  .addOr('md_bq_cont', ['md_bq_blank', 'md_bq_line'])
  .addSeq('md_bq_blank', [/^\n([ \t]{0,3}>[ \t]*(?=\n))/])
  .addSeq('md_bq_line', [/^\n[ \t]{0,3}>[ \t]?/, 'md_bq_line_content'])

  .addOr('md_bq_line_content', [
    'md_blockquote', 'md_heading_atx', 'md_hr',
    'md_bq_fence',
    'md_list_ul', 'md_list_ol',
    'md_bq_inline'
  ])

  // Inline content within a blockquote: runs to end of line
  .addSeq('md_bq_inline', ['md_inline'])

  // Fenced code inside blockquote: each line prefixed with >
  .addSeq('md_bq_fence', [
    /^(`{3,}|~{3,})[ \t]*([^\n]*)[ \t]*/, 'md_bq_fence_body',
    /^\n[ \t]{0,3}>[ \t]?(`{3,}|~{3,})[ \t]*/
  ])
  .addRep('md_bq_fence_body', ['md_bq_fence_line'])
  .addSeq('md_bq_fence_line', [
    /^\n[ \t]{0,3}>[ \t]?(?![ \t]*(?:`{3,}|~{3,})[ \t]*$)([^\n]*)/
  ])

  // ══════════════════════════════════════════════════════
  // ── Lists (recursive) ──
  // ══════════════════════════════════════════════════════
  //
  // Strategy: each item consumes its marker, then collects
  // content. Continuation lines must be indented. Sub-blocks
  // (including nested lists) appear on indented lines.
  // The indent regex requires SOME whitespace on continuation;
  // a downstream pass validates depth consistency.

  // ── Unordered list ──
  .addRep('md_list_ul', ['md_item_ul'])
  .addSeq('md_item_ul', [
    /^([ \t]*)([*+\-])[ \t]+/, 'md_item_body'
  ])

  // ── Ordered list ──
  .addRep('md_list_ol', ['md_item_ol'])
  .addSeq('md_item_ol', [
    /^([ \t]*)(\d{1,9})[.)][ \t]+/, 'md_item_body'
  ])

  // ── Item body: first line inline, then continuation blocks ──
  .addSeq('md_item_body', ['md_inline', 'md_item_rest'])
  .addRep('md_item_rest', ['md_item_cont'])
  .addOr('md_item_cont', ['md_item_blank_then_block', 'md_item_sub'])

  // Continuation with blank line (loose list): blank then indented block
  .addSeq('md_item_blank_then_block', [
    /^\n(?=[ \t]*\n)/, 'md_blank_line', /^([ \t]+)/, 'md_item_block'
  ])

  // Continuation without blank line: newline + indent + content
  .addSeq('md_item_sub', [/^\n([ \t]+)/, 'md_item_block'])

  // What can appear inside an indented list item
  .addOr('md_item_block', [
    'md_list_ul', 'md_list_ol',     // nested lists — recursion
    'md_blockquote',                 // blockquote inside list
    'md_fence', 'md_heading_atx', 'md_hr',
    'md_inline'                      // paragraph continuation
  ])

  // ══════════════════════════════════════════════════════
  // ── Other block-level rules ──
  // ══════════════════════════════════════════════════════

  // ── ATX heading ──
  .addSeq('md_heading_atx', [/^(#{1,6})[ \t]+/, 'md_inline', /^[ \t]*#*/])

  // ── Setext heading ──
  .addSeq('md_heading_setext', [
    'md_inline', /^\n(={3,}|-{3,})[ \t]*/
  ])

  // ── Horizontal rule ──
  .addSeq('md_hr', [/^([ \t]*([*\-_])[ \t]*\2[ \t]*\2[\t *\-_]*)/])

  // ── Fenced code block (outside blockquote) ──
  .addSeq('md_fence', [
    /^(`{3,}|~{3,})[ \t]*([^\n`]*)[ \t]*\n/,
    'md_fence_body',
    /^\n[ \t]*(`{3,}|~{3,})[ \t]*/
  ])
  .addSeq('md_fence_body', [/^([\s\S]*?)(?=\n[ \t]*(?:`{3,}|~{3,})[ \t]*)/])

  // ── Table (GFM) ──
  .addSeq('md_table', [
    'md_table_header', /^\n/, 'md_table_sep', 'md_table_rows'
  ])
  .addSeq('md_table_header', ['md_table_row'])
  .addSeq('md_table_sep', [
    /^(\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?)[ \t]*/
  ])
  .addRep('md_table_rows', [/^\n/, 'md_table_row'])
  .addSeq('md_table_row', [/^\|?/, 'md_table_cells', /^\|?/])
  .addRep('md_table_cells', ['md_table_cell'])
  .addSeq('md_table_cell', [/^[ \t]*/, 'md_inline', /^[ \t]*\|/])

  // ── Link reference definition ──
  .addSeq('md_link_def', [
    /^\[/, 'md_link_label', /^\]:[ \t]*/, 'md_link_dest', 'md_link_title_opt'
  ])

  // ── HTML block ──
  .addSeq('md_html_block', [/^(<[a-zA-Z\/][^\n]*(?:\n(?![ \t]*\n)[^\n]*)*)$/m])

  // ── Paragraph ──
  .addRep('md_paragraph', ['md_para_line'])
  .addOr('md_para_line', ['md_para_cont', 'md_inline'])
  .addSeq('md_para_cont', [
    /^\n(?![ \t]*\n|#{1,6} |```|~~~|>|[ \t]*[*+\-] |[ \t]*\d+[.)] |\|)/,
    'md_inline'
  ])

  // ══════════════════════════════════════════════════════
  // ── Inline-level rules ──
  // ══════════════════════════════════════════════════════

  .addRep('md_inline', ['md_inline_element'])
  .addOr('md_inline_element', [
    'md_escape', 'md_code_span',
    'md_image', 'md_link', 'md_autolink',
    'md_html_inline', 'md_hard_break',
    'md_emph_marker',
    'md_text'
  ])

  .addSeq('md_escape', [/^\\([\\`*_{}[\]()#+\-.!|~>])/])
  .addSeq('md_code_span', [/^(`+)([\s\S]*?[^`])\1(?!`)/])

  .addSeq('md_image', [/^!\[/, 'md_inline', /^\]/, 'md_link_tail'])

  .addSeq('md_link', [/^\[/, 'md_inline', /^\]/, 'md_link_tail'])
  .addOr('md_link_tail', ['md_link_inline', 'md_link_ref', 'md_link_collapsed'])
  .addSeq('md_link_inline', [
    /^\(\s*/, 'md_link_dest', 'md_link_title_opt', /^\s*\)/
  ])
  .addSeq('md_link_ref', [/^\[/, 'md_link_label', /^\]/])
  .addSeq('md_link_collapsed', [/^(\[\])?/])

  .addSeq('md_link_dest', [/^((?:<[^>]*>|[^\s()\[\]])+)/])
  .addSeq('md_link_label', [/^([^\]]+)/])
  .addOr('md_link_title_opt', ['md_link_title', /^/])
  .addSeq('md_link_title', [
    /^\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^)\\]|\\.)*\))/
  ])

  .addSeq('md_autolink', [/^<([a-zA-Z][a-zA-Z+.\-]*:[^\s>]+)>/])
  .addSeq('md_html_inline', [/^(<[a-zA-Z\/][^>]*>)/])
  .addSeq('md_hard_break', [/^(  +|\\)\n/])
  .addSeq('md_emph_marker', [/^(\*{1,3}|_{1,3}|~{2})/])
  .addSeq('md_text', [/^([^\n\\`*_~\[!<&]+|[&](?!#?\w+;)|.)/])