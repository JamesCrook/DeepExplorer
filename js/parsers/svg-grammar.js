import {Parser} from './parser.js'


// ── SVG (common subset, emphasis on path data) ─────────
// #svg/grammar
Parser
  // ── Document level ──
  .addRep('SVG', [/^\s*/, 'svg_node'])
  .addOr('svg_node', [
    'svg_comment', 'svg_self_close', 'svg_element', 'svg_text'
  ])

  // ── XML structure ──
  .addSeq('svg_comment', [/^(<!--[\s\S]*?-->)/])
  .addSeq('svg_self_close', [
    /^</, 'svg_tag_name', 'svg_attrs', /^\s*\/>/
  ])
  .addSeq('svg_element', [
    'svg_open_tag', 'svg_children', 'svg_close_tag'
  ])
  .addSeq('svg_open_tag', [
    /^</, 'svg_tag_name', 'svg_attrs', /^\s*>/
  ])
  .addSeq('svg_close_tag', [/^<\//, 'svg_tag_name', /^\s*>/])
  .addRep('svg_children', [/^\s*/, 'svg_node'])
  .addSeq('svg_text', [/^([^<]+)/])
  .addSeq('svg_tag_name', [/^([a-zA-Z_][\w\-:.]*)/])

  // ── Attributes ──
  .addRep('svg_attrs', [/^\s*/, 'svg_attr'])
  .addSeq('svg_attr', ['svg_attr_name', /^\s*=\s*/, 'svg_attr_val'])
  .addSeq('svg_attr_name', [/^([a-zA-Z_][\w\-:.]*)/])
  .addOr('svg_attr_val', ['svg_attr_d', 'svg_attr_points', 'svg_attr_quoted'])
  .addSeq('svg_attr_quoted', [/^"([^"]*)"/])

  // ── Special attribute: d="..." (path data) ──
  // Only activates when the attribute value parses as path commands.
  // Otherwise falls through to svg_attr_quoted.
  .addSeq('svg_attr_d', [/^"/, 'svg_path_data', /^"/])
  .addRep('svg_path_data', [/^\s*/, 'svg_path_segment'])
  .addOr('svg_path_segment', [
    'svg_path_cmd', 'svg_path_arc_args', 'svg_path_coord'
  ])

  // Command letters: M L H V C S Q T A Z (upper=absolute, lower=relative)
  .addSeq('svg_path_cmd', [/^([MLHVCSQTAZmlhvcsqtaz])/])

  // Arc is special: 7 parameters where two are flags (0|1)
  // rx ry rotation large-arc-flag sweep-flag x y
  // Recognising the flag pair distinctly helps downstream rendering.
  .addSeq('svg_path_arc_args', [
    'svg_path_number', 'svg_path_number', 'svg_path_number',
    'svg_path_flag', 'svg_path_flag',
    'svg_path_number', 'svg_path_number'
  ])
  .addSeq('svg_path_flag', [/^\s*,?\s*([01])/])

  // Coordinates: number or comma-separated number pair
  .addOr('svg_path_coord', ['svg_path_pair', 'svg_path_number'])
  .addSeq('svg_path_pair', [
    'svg_path_number', /^\s*,?\s*/, 'svg_path_number'
  ])
  .addSeq('svg_path_number', [
    /^\s*,?\s*(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/
  ])

  // ── Special attribute: points="..." (polyline/polygon) ──
  .addSeq('svg_attr_points', [/^"/, 'svg_point_list', /^"/])
  .addRep('svg_point_list', ['svg_path_pair', /^\s*/])

Parser
  .addRep('svg_transforms', ['svg_transform_fn', /^\s*/])
  .addSeq('svg_transform_fn', [/^([a-zA-Z]+)\s*\(\s*/, 'svg_num_list', /^\s*\)/])
  .addRep('svg_num_list', [/^\s*,?\s*(-?[\d.]+)/, /^\s*/])

    