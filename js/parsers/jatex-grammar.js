import {Parser} from './parser.js'

// #jatex/grammar

Parser
  .addRep('Jatex', [/^\s*/, 'jterm'])
  .addOr('jterm', [
    'j_comment', 'j_mathmode', 'j_command', 'j_group',
    'j_super', 'j_sub', 'j_alignment', 'j_text'
  ])

  // ── Superscript and subscript ──
  .addSeq('j_super', [/^\^/, 'j_script_arg'])
  .addSeq('j_sub',   [/^_/,  'j_script_arg'])
  // Argument: either a brace group or a single token/command
  .addOr('j_script_arg', ['j_group', 'j_command', 'j_single_char'])
  .addSeq('j_single_char', [/^([^{}\\$&\s])/])

  // ── Brace groups (genuine recursion) ──
  .addSeq('j_group', [/^\{/, 'Jatex', /^\}/])

  // ── Commands ──
  // Try known-arity commands first, then generic
  .addOr('j_command', [
    'j_cmd2', 'j_cmd1', 'j_cmd_begin_end', 'j_cmd_sqrt', 'j_cmd_generic'
  ])

  // Two-argument commands: \frac, \binom, \overset, \underset, \stackrel
  .addSeq('j_cmd2', [/^\\(frac|binom|overset|underset|stackrel)\b/,
    'j_script_arg', 'j_script_arg'])

  // One-argument commands: \hat, \bar, \vec, \dot, \tilde, \mathbb, \mathrm,
  // \text, \sqrt is separate (optional arg), \left, \right
  .addSeq('j_cmd1', [
    /^\\(hat|bar|vec|dot|ddot|tilde|widetilde|mathbb|mathcal|mathfrak|mathrm|mathbf|mathit|mathsf|text|textbf|textit|operatorname|overline|underline|overbrace|underbrace|boxed|cancel|phantom|hspace|vspace|kern|mbox|quad|qquad)\b/,
    'j_script_arg'
  ])

  // \begin{env}...\end{env}
  .addSeq('j_cmd_begin_end', [
    /^\\begin\{/, 'j_env_name', /^\}/,
    'Jatex',
    /^\\end\{/, 'j_env_name', /^\}/
  ])
  .addSeq('j_env_name', [/^([a-zA-Z*]+)/])

  // \sqrt[optional]{arg}
  .addSeq('j_cmd_sqrt', [/^\\(sqrt)/, 'j_optional_arg', 'j_script_arg'])
  .addOr('j_optional_arg', ['j_bracket_arg', /^/])
  .addSeq('j_bracket_arg', [/^\[/, 'Jatex', /^\]/])

  // Generic: \epsilon, \alpha, \to, \infty, \, \; \! \\ etc.
  // Captures the name. Does NOT validate it. Downstream decides
  // if \fiduciarial is real.
  .addSeq('j_cmd_generic', [/^\\([a-zA-Z]+|[^a-zA-Z\s])/])

  // ── Math mode delimiters ──
  .addOr('j_mathmode', ['j_display_math', 'j_inline_math'])
  .addSeq('j_display_math', [/^\$\$/, 'Jatex', /^\$\$/])
  .addSeq('j_inline_math', [/^\$/, 'Jatex', /^\$/])

  // ── Table/matrix alignment ──
  .addSeq('j_alignment', [/^(&)/])

  // ── Comments ──
  .addSeq('j_comment', [/^(%[^\n]*)/])

  // ── Plain text (everything that isn't special) ──
  .addSeq('j_text', [/^([^{}\\$_^%&\s]+)/])


const jatexExprConfig = {
  // LaTeX math: subscript and superscript bind tightest,
  // then juxtaposition (implicit multiplication), then explicit ops.
  // Relational operators are loosest.
  precedence: {
    '\\lor': 1, '\\vee': 1,
    '\\land': 2, '\\wedge': 2,
    '\\implies': 3, '\\Rightarrow': 3, '\\Leftarrow': 3, '\\iff': 3,
    '=': 4, '\\neq': 4, '\\ne': 4, '<': 4, '>': 4,
    '\\leq': 4, '\\geq': 4, '\\le': 4, '\\ge': 4,
    '\\in': 4, '\\notin': 4, '\\subset': 4, '\\subseteq': 4,
    '\\approx': 4, '\\equiv': 4, '\\sim': 4, '\\propto': 4,
    '\\to': 5, '\\rightarrow': 5, '\\leftarrow': 5, '\\mapsto': 5,
    '+': 6, '-': 6, '\\pm': 6, '\\mp': 6, '\\oplus': 6,
    '\\cup': 6, '\\cap': 7,
    '*': 8, '\\cdot': 8, '\\times': 8, '\\div': 8,
    '\\otimes': 8, '\\circ': 8, '/': 8,
    '^': 10,
    '_': 10,
  },
  rightAssoc: ['^', '_'],
  prefix: ['-', '+', '\\neg', '\\lnot', '\\sqrt', '\\nabla', '\\partial'],
  postfix: ['!', "'", '\\dagger', '\\prime'],
  operatorTypes: ['j_cmd_generic', 'j_text', 'j_super', 'j_sub'],
  opText: node => {
    if (node.type === 'j_super') return '^';
    if (node.type === 'j_sub') return '_';
    return node.value?.[1] || node.value || '';
  },
  pairs: {},
};
export { jatexExprConfig } 


const smilesExprConfig = {
  // SMILES: bonds between atoms. "Precedence" is really
  // just bond order — higher = tighter bond in the graph.
  // This isn't about parsing order (the grammar already
  // captured the flat sequence), it's about annotating
  // bond strength for downstream graph construction.
  //
  // In practice the rebuilder's main job here is to pair
  // up adjacent atoms with implicit single bonds when no
  // explicit bond token appears. The diagnostic system
  // catches orphaned bonds like "=C=" with nothing on one side.
  precedence: {
    '.': 0,    // disconnection (dot between components)
    '-': 1,    // single
    ':': 1.5,  // aromatic
    '=': 2,    // double
    '#': 3,    // triple
    '$': 4,    // quadruple
    '/': 1,    // up stereo (still single bond)
    '\\': 1,   // down stereo (still single bond)
  },
  rightAssoc: [],
  prefix: [],
  postfix: [],
  operatorTypes: ['smi_bond'],
  opText: node => node.value?.[1] || node.value || '',
  pairs: {},
};  
export { smilesExprConfig } 