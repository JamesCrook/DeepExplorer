import {Parser} from './parser.js'

// #mol/smiles/grammar

// ── SMILES (OpenSMILES-complete) ────────────────────────
Parser
  // Top level: one or more dot-separated components
  .addRep('Smiles', ['smi_component', /^(\.)?/])

  // A component is a chain of atoms with bonds, branches, ring closures
  .addRep('smi_component', ['smi_unit'])
  .addOr('smi_unit', [
    'smi_branch', 'smi_ring', 'smi_bond', 'smi_atom'
  ])

  // ── Atoms ──

  // Try bracket atom first (it starts with [, unambiguous),
  // then organic subset, then aromatic subset.
  .addOr('smi_atom', ['smi_bracket_atom', 'smi_organic', 'smi_aromatic', 'smi_wildcard'])

  // Organic subset: two-letter symbols before one-letter to prevent
  // Cl matching as C + l. No capture group needed on the rejectors.
  .addSeq('smi_organic', [/^(Cl|Br|[BCNOPSFIn])/])

  // Aromatic subset (lowercase)
  .addSeq('smi_aromatic', [/^([bcnops])/])

  // Wildcard
  .addSeq('smi_wildcard', [/^(\*)/])

  // ── Bracket atoms: [isotope? symbol stereo? hcount? charge? class?] ──

  .addSeq('smi_bracket_atom', [
    /^\[/,
    'smi_isotope', 'smi_bracket_symbol', 'smi_stereo',
    'smi_hcount', 'smi_charge', 'smi_atomclass',
    /^\]/
  ])

  // Each interior field is optional via empty-match fallback
  .addOr('smi_isotope', ['smi_isotope_num', /^/])
  .addSeq('smi_isotope_num', [/^(\d+)/])

  // Bracket symbol: element (He, Fe, se, ...) or wildcard
  // Two-letter before one-letter; lowercase pairs for aromatics
  .addSeq('smi_bracket_symbol', [/^([A-Z][a-z]?|[a-z]|\*)/])

  .addOr('smi_stereo', ['smi_stereo_mark', /^/])
  .addSeq('smi_stereo_mark', [/^(@@?)/])

  .addOr('smi_hcount', ['smi_hcount_val', /^/])
  .addSeq('smi_hcount_val', [/^(H)(\d?)/])

  .addOr('smi_charge', ['smi_charge_val', /^/])
  .addSeq('smi_charge_val', [/^([+-]\d*|[+-]{2,})/])

  .addOr('smi_atomclass', ['smi_atomclass_val', /^/])
  .addSeq('smi_atomclass_val', [/^:(\d+)/])

  // ── Bonds ──
  // Single (-), double (=), triple (#), quadruple ($),
  // aromatic (:), up (/), down (\)
  .addSeq('smi_bond', [/^([=\-#$:\\/])/])

  // ── Ring closures ──
  // Single digit (0-9) or %nn for two-digit ring numbers
  .addOr('smi_ring', ['smi_ring_pct', 'smi_ring_digit'])
  .addSeq('smi_ring_digit', [/^(\d)/])
  .addSeq('smi_ring_pct', [/^%(\d{2})/])

  // ── Branches ──
  // Genuine recursion: a branch contains a chain
  .addSeq('smi_branch', [/^\(/, 'smi_branch_content', /^\)/])
  .addRep('smi_branch_content', ['smi_unit'])