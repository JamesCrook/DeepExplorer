import {Parser} from './parser.js'
//import { createHandlerRegistry, AstNode } from '../utilities2/ast-manager.js'

// ── FEN (Forsyth-Edwards Notation) ──────────────────────
// #chesse/fen/spec/grammar
Parser
  .addSeq('FEN', [
    'fen_placement', /^ /,
    'fen_active',    /^ /,
    'fen_castling',  /^ /,
    'fen_enpassant', /^ /,
    'fen_halfmove',  /^ /,
    'fen_fullmove'
  ])
  .addRep('fen_placement', ['fen_rank', /^\//])
  .addSeq('fen_rank',      [/^([1-8pnbrqkPNBRQK]+)/])
  .addSeq('fen_active',    [/^([wb])/])
  .addSeq('fen_castling',  [/^([KQkq]+|-)/])
  .addSeq('fen_enpassant', [/^([a-h][36]|-)/])
  .addSeq('fen_halfmove',  [/^(\d+)/])
  .addSeq('fen_fullmove',  [/^(\d+)/])


// ── PGN (Portable Game Notation) ────────────────────────
// #chesse/pgn/spec/grammar
Parser
  .addRep('PGN', ['pgn_game', /^\s*/])

  .addSeq('pgn_game', ['pgn_tags', /^\s*/, 'pgn_movetext'])

  // Tag pairs: [Event "Zurich 1953"]
  .addRep('pgn_tags',      ['pgn_tag', /^\s*/])
  .addSeq('pgn_tag',       [/^\[/, 'pgn_tag_name', /^ /, 'pgn_tag_value', /^\]\s*/])
  .addSeq('pgn_tag_name',  [/^([A-Za-z_]\w*)/])
  .addSeq('pgn_tag_value', [/^"([^"]*)"/])

  // Movetext: flat stream of elements, structure imposed later
  .addRep('pgn_movetext',  ['pgn_element', /^\s*/])
  .addOr('pgn_element', [
    'pgn_result', 'pgn_movenum', 'pgn_comment',
    'pgn_variation', 'pgn_nag', 'pgn_move'
  ])

  .addSeq('pgn_result',    [/^(1-0|0-1|1\/2-1\/2|\*)/])
  .addSeq('pgn_movenum',   [/^(\d+)\.+\s*/])
  .addSeq('pgn_comment',   [/^\{([^}]*)\}/])
  .addSeq('pgn_variation',  [/^\(\s*/, 'pgn_movetext', /^\s*\)/])
  .addSeq('pgn_nag',       [/^(\$\d+)/])
  .addSeq('pgn_move', [
    /^([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?[+#]?)/,
    /^([!?]{1,2})?/
  ])