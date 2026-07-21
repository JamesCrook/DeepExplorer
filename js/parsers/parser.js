// This is a PEG parser
// Ordered Choice; Backtracking not Look-Ahead; Greedy Repetition;
// However we do get some semblance of look-ahead since our atoms are RegExp, and they can look
// ahead.

// The ast nodes are either for a rule or for a (terminal) RegExp
// If for a rule, ast.token is the name of the rule, and value is null
// For a terminal, ast.token is the full string matched and value is the match struct
// nodes have a subtree, so the actions can be and usually are recursive

/*
# ESSENTIALS

A grammar is a flat dictionary of named rules. Each rule has exactly one of three types:

seq(name, [A, B, C, ...]) — Match A then B then C in order. All must succeed or the entire rule backtracks. Produces one AST node whose children are whatever A, B, C contributed.

or(name, [A, B, C, ...]) — Try A; if it fails, try B; if that fails, try C. First success wins (PEG ordered choice). Produces one AST node containing whichever alternative matched.

rep(name, [A, B, ...]) — Cycle through A, B, A, B, ... greedily, collecting matches into a flat array of children. Must match at least one full cycle or it backtracks. Stops when a cycle fails to advance position (preventing infinite loops on zero-width matches).

Each item in a rule's array is either a string (the name of another rule) or a RegExp (a terminal). A RegExp with a capture group records a value on the AST node; without a capture group it consumes silently (delimiters, whitespace).

That's the entire combinator vocabulary. Three verbs, two atom types.

---

Repetition is flat, not recursive. A traditional grammar encodes list → item list | item, which builds a right-nested linked list. rep('list', ['item']) builds a single node with N children in an array. Downstream code iterates arrays rather than chasing recursive structure.

Grammars don't encode policy. Operator precedence, associativity, statement-vs-expression boundaries — traditional parsers bake these into the grammar. The grammar does text-to-tree faithfully and pushes those decisions into a later pass over the AST. The grammar stays small and legible.

RegExp terminals do local lookahead. Since atoms are regexes, we get anchored pattern matching at the current position. The regex engine handles character-class logic, optional parts, and local greediness within a single terminal.

*/

import { AstNode } from '../utilities2/ast-manager.js'

/**
 * @module Parser
 * @description A singleton PEG (Parsing Expression Grammar) parser.
 * It uses an ordered choice, backtracking, and greedy repetition strategy.
 * The parser is implemented as an Immediately Invoked Function Expression (IIFE)
 * to create a single instance. It can be extended with different grammars.
 */
const Parser = (() => {
  const productions = {}
  let input = "";
  let position = 0;
  let ast = null;
  let stack = [];
  let parser = {};

  /**
   * Adds a production rule to the parser.
   * @private
   * @param {string} type - The type of the rule ('seq', 'or', 'rep').
   * @param {string} name - The name of the rule.
   * @param {Array<string|RegExp>} data - The components of the rule, which can be rule names or regular expressions.
   * @returns {object} The parser instance, for chaining.
   */
  function addRule(type, name, data) {
    productions[name] = {
      type: type,
      data: data
    };
    return parser;
  }

  /**
   * Adds a sequence rule. All components in the sequence must match in order.
   * @param {string} name - The name of the rule.
   * @param {Array<string|RegExp>} sequence - The sequence of components to match.
   * @returns {object} The parser instance, for chaining.
   */
  function addSeq(name, sequence) {
    return addRule('seq', name, sequence)
  }

  /**
   * Adds a choice (OR) rule. The first matching component is chosen.
   * @param {string} name - The name of the rule.
   * @param {Array<string|RegExp>} or - The components to choose from.
   * @returns {object} The parser instance, for chaining.
   */
  function addOr(name, or) {
    return addRule('or', name, or)
  }

  /**
   * Adds a repetition rule. The component(s) must match at least once.
   * @param {string} name - The name of the rule.
   * @param {Array<string|RegExp>} rep - The component(s) to repeat.
   * @returns {object} The parser instance, for chaining.
   */
  function addRep(name, rep) {
    return addRule('rep', name, rep)
  }

  function debug(message) {
  //  console.log( message )
  }

  /**
   * Tries to match a single item, which can be a rule name or a RegExp.
   * @private
   * @param {string|RegExp} item - The item to match.
   * @returns {boolean} - True if the item matched, false otherwise.
   */
  function matchItem(item) {
    // If item is a regex, we do not need to descend because we match or fail immediately.
    if(item instanceof RegExp) {
      const tail = input.slice(position);
      const match = item.exec(tail);
      if(!match) {
        debug(`failed to match ${item}`);
        return false;
      }
      // We matched! Update position.
      let length = match[0].length
      position += length;
      ast.jend = position;
      // If there was no capture group in the RegExp, we do not need to record what was in it.
      // Happens, for example, for a delimitter
      if(!match[1])
        return true;
      // If we are the first capturing item, we don't need to make a new node.
      // This is a very common case, because we often name a regex with a seq rule with one item.
      if(ast.value == null) {
        ast.value = match;
        debug(`matched ${match[0]} and updated ${ast.token} value`);
        return true;
      }
      // We so far choose to make grammars that have at most one capturing anonymous RegExp in any
      // production. It is pretty rare to want more than one. We call the later ones 'anonymous'
      // because the first one already 'used' the production's name.
      // We could allow such a RegExp to make a new node. We don't use this yet.
      debugger; // Do you really want this regexp to capture??
      let node = new AstNode('anonymous_regexp', null, [], match, position -
        length, position)
      ast.subtree.push(node);
      debug(`matched ${match[0]} and pushed a new node onto ${ast.token}`);
      return true;
    }
    // item is a rule, look it up and do it.
    let name = item;
    let prod = productions[name];
    if(!prod)
      debugger;
    descend(name, prod);
    return ruleHandlers[prod.type](name, prod.data);
  }

  /**
   * "Descends" into a new rule, creating a new node in the AST and pushing the current state onto the stack.
   * @private
   * @param {string} name - The name of the rule to descend into.
   * @param {object} prod - The production rule object.
   */
  function descend(name, prod) {
    let node = new AstNode(name, prod, [], null, position, position)
    stack.push({
      position,
      ast
    })
    ast?.subtree.push(node);
    ast = node;
    debug(
      `descended to ${name} stack length ${stack.length} pos ${position}`);
  }

  /**
   * "Backtracks" on a failed match, restoring the previous parser state from the stack.
   * @private
   * @returns {boolean} Always returns false to indicate failure.
   */
  function backtrack() {
    if(stack.length < 1) {
      debug(`finished (backtrack)`);
      return false;
    }
    let p = stack.pop();
    position = p.position;
    ast = p.ast;
    if(!ast)
      debugger;
    ast.subtree.pop();
    debug(
      `backtracked to ${ast.token} stack length ${stack.length} pos ${position}`
    );
    return false;
  }

  /**
   * "Reduces" on a successful rule match, finalizing the current AST node and popping from the stack.
   * @private
   * @returns {boolean} Always returns true to indicate success.
   */
  function reduce() {
    ast.jend = position; // Set jend for the node we're ABOUT TO reduce
    
    if(stack.length < 1) {
      debug(`finished (reduce) covering ${ast.jref}-${ast.jend}`);
      return true;
    }
    
    debug(
      `reduced to ${ast.token} covering ${ast.jref}-${ast.jend} with ${ast.subtree.length} children stack length ${stack.length} pos ${position}`
    );
    
    let p = stack.pop();
    ast = p.ast;
    if(!ast)
      debugger;
    
    return true;
  }

  /**
   * @private
   * @namespace ruleHandlers
   * @description Handlers for the different types of production rules.
   */
  const ruleHandlers = {
    /**
     * Handles a sequence rule.
     * @param {string} name - The rule name.
     * @param {Array<string|RegExp>} data - The sequence of components.
     * @returns {boolean} The result of the match.
     */
    seq: function(name, data) {
      debug('in seq')
      for(let i = 0; i < data.length; i++) {
        let rule = data[i];
        debug(`seq testing ${i} ${rule}`);
        if(!matchItem(rule, name))
          return backtrack();
      }
      return reduce();
    },

    /**
     * Handles a choice (OR) rule.
     * @param {string} name - The rule name.
     * @param {Array<string|RegExp>} data - The components to choose from.
     * @returns {boolean} The result of the match.
     */
    or: function(name, data) {
      debug('in or')
      for(let i = 0; i < data.length; i++) {
        let rule = data[i];
        debug(`or testing ${i} ${rule}`);
        if(!matchItem(rule))
          continue;
        return reduce();
      }
      return backtrack();
    },

    /**
     * Handles a repetition rule.
     * @param {string} name - The rule name.
     * @param {Array<string|RegExp>} data - The component(s) to repeat.
     * @returns {boolean} The result of the match.
     */
    rep: function(name, data) {
      debug('in rep')
      // cyclestart stops infinite looping with nothing consumed
      let cycleStart = position;
      for(let i = 0;; i++) {
        if(i % data.length === 0) {
          if(i > 0 && position === cycleStart)
            break;
          cycleStart = position;
        }
        let rule = data[i % data.length];
        debug(`rep testing ${i} ${rule}`);
        if(!matchItem(rule)) {
          if(i < 1)
            return backtrack();
          break;
        }
      }
      return reduce();
    },


    repOld: function(name, data) {
      debug('in rep')
      for(let i = 0;; i++) {
        let rule = data[i % data.length];
        debug(`rep testing ${i} ${rule}`);
        if(!matchItem(rule)) {
          if(i < 1)
            return backtrack();
          break;
        }
      }
      return reduce();
    },
  }

  /**
   * Creates a dedicated parser object for a specific starting rule.
   * @param {string} rule - The name of the starting rule for this parser.
   * @returns {{parse: function(string): AstNode, rule: string}} A parser object with a `parse` method.
   */
  function createParserFromRule(rule) {
    const result = {
      parse: function(text) {
        return parse(rule, text);
      },
      rule: rule
    }
    return result;
  }

  /**
   * Parses the input text starting from a given rule.
   * @param {string} rule - The name of the top-level rule to start parsing with.
   * @param {string} text - The input text to parse.
   * @returns {AstNode} The root of the generated Abstract Syntax Tree.
   */
  function parse(rule, text) {
    input = text;
    position = 0;
    stack = [];
    ast = null;
    //We don't need a root node since the rule itself creates a node using descend
    descend('root');
    let result = matchItem(rule);
    ast.jend = position;
    return ast;
  }
  parser.listRules = () => Object.keys(productions);
  parser.createParserFromRule = createParserFromRule;
  parser.addSeq = addSeq;
  parser.addOr = addOr;
  parser.addRep = addRep;
  parser.parse = parse;

  return parser;
})()

//for chemical SMILES syntax
Parser
  .addOr('Smiles', ['atom', 'ring', 'bond'])
  .addSeq('atom', [/^[BCNOFPS]/])
  .addSeq('ring', [/^\d/])
  .addSeq('bond', [/^[=\-#]/])

Parser
  // minimal test of JaTeX
  .addRep('Jatex', ['jterm'])
  .addOr('jterm', ['jexp', 'frac', 'jsymbol', 'blanks'])
  .addSeq('blanks', [/^( +)/])
  .addSeq('jsymbol', [/^\\([a-zA-Z0-9_]+)/])
  .addSeq('frac', [/^\\frac/, 'numerator', 'denominator'])
  .addSeq('numerator', ['jexp'])
  .addSeq('denominator', ['jexp'])
  .addSeq('jexp', [/^{/, 'Jatex', /^}/])

/**
 * @description Grammar for parsing a subset of Markdown.
 */
Parser
  .addRep('Markdown', ['mterm'])
  .addOr('mterm', ['#', '---', 'island', 'bull', 'br', 'directive', 'img',
    'url', 'code', 'italic', 'bold', 'md_text', 'jexp2'
  ])
  .addSeq('#', [/^\r?\n(#+) (.*)/])
  .addSeq('---', [/^\r?\n---*/])
  .addSeq('island', [/^\r?\n(```.*\r?\n([\s\S]*?)```)/])
  .addSeq('bull', [/^\r?\n[\-*]/])
  .addSeq('br', [/^\r?\n/])
  .addSeq('directive', [/^#([a-zA-Z0-9\-]+)/])
  .addSeq('img', [/^!(\[.*\]\(?.*\))/])
  .addSeq('url', [/^(\[.*\]\(?.*\))/])
  .addSeq('code', [/^`([^`\n]+)\`/])
  .addSeq('italic', [/^\*([^*\n]+)\*|^_([^_\n]+)_/])
  .addSeq('bold', [/^\*\*(.+?)\*\*|^__(.+?)__/])
  .addSeq('md_text', [/^([^*_`!\[\r\n\$\\]+)/])
  // These next two rules are currently terminal rules
  // The first parses inline JaTeX, which is latex-like
  // The second parses GeSHi island content
  // Later they will be connected up 'properly'.
  .addSeq('jexp2', [/^\$([^\$]+)\$/])
  .addSeq('island_content', [/^.*?(?=\r?\n```)/s])

/**
 * @description Grammar for parsing a simple table structure.
 * Note: This is not yet integrated into the main Markdown grammar.
 */
Parser.addOr('Table', ['cell', 'row', 'table_text'])
  // Table in markdown, not yet connected up into the markdown grammar
  .addSeq('cell', [/^(.*?)\|/])
  .addSeq('row', [/^\r?\n\|/])
  .addSeq('table_text', [/^([^\n|]+)/])

Parser
  .addRep('JSON', ['json_elt'])
  .addRep('JSONX', ['json_elt2'])
  .addOr('json_elt', ['json_assign', 'json_object', 'json_comment', 'expression'])
  .addOr('json_elt2', ['token', 'json_comment'])

  //.addSeq('json_assign', ['token', 'equals', 'expression'])
  .addSeq('json_assign', ['assign_lhs', 'equals', 'expression'])
  .addRep('assign_lhs', ['token'])
  .addSeq('equals', [/^\s*/, /^(=)/])
  .addOr('json_value', ['json_object', 'json_array', 'quotedString', 'number', 'token'])
  .addOr('expression', ['json_object', 'json_array', 'paren_group', 'operator', 'quotedString', 'number', 'token'])
  
  .addSeq('paren_group', [/^(\()/, 'paren_inner', /^(\))/])
  .addRep('paren_inner', [/^\s*/, 'paren_atom'])
  .addOr('paren_atom', [/^(,)/, 'atomic_expression'])

  .addSeq('json_object', ['open_brace', 'json_fields', 'close_brace'])
  .addSeq('open_brace', [/^\s*/, /^(\{)/])
  .addSeq('close_brace', [/^\s*/, /^(\})/])
  .addRep('json_fields', [/^\s*/,'json_field_or_comment', 'maybe_comma'])
  .addOr('json_field_or_comment', ['json_field', 'json_comment'])
  .addSeq('json_field', ['json_key', 'colon', 'expression'])
  .addSeq('colon', [/^\s*/, /^(:)/])
  .addOr('json_key', ['quotedString', 'token'])
  .addSeq('json_array', ['open_bracket', 'json_expressions','close_bracket'])
  .addSeq('open_bracket', [/^\s*/, /^(\[)/])
  .addSeq('close_bracket', [/^\s*/, /^(\])/])
  .addRep('json_expressions', [/^\s*/, 'expression', 'maybe_comma'])



  .addSeq('maybe_comma', [/^\s*/, /^(,?)/])
  .addOr('quotedString', ['doubleQuoted', 'singleQuoted'])
  .addSeq('doubleQuoted', [/^\s*/, /^("[^"\\]*(?:\\.[^"\\]*)*")/])
  .addSeq('singleQuoted', [/^\s*/, /^('[^'\\]*(?:\\.[^'\\]*)*')/])
  .addSeq('number', [/^\s*/, /^(-?\d+(?:\.\d+)?)/])
  .addSeq('token', [/^\s*/, /^([a-zA-Z_][a-zA-Z0-9_]*)/])
  .addSeq('operator', [/^\s*/, /^([+\-*/=<>!&|:?]+)/])
  .addSeq('json_comment', [/^\s*/, /^(\/\/[^\n]*\n?)/])

//console.log("Rules:", Parser.listRules());

Parser
  // Top-level
  .addRep('JavaScript', ['js_statement'])
  
  // Statements
  .addOr('js_statement', ['js_function', 'js_const', 'js_let', 'js_var', 
                          'js_if', 'js_return', 'js_block', 'js_expr_stmt'])
  
  // Variable declarations
  .addSeq('js_const', [/^const\s+/, 'js_binding', /^\s*=\s*/, 'js_expr', /^\s*;?/])
  .addSeq('js_let', [/^let\s+/, 'js_binding', /^\s*=\s*/, 'js_expr', /^\s*;?/])
  .addSeq('js_var', [/^var\s+/, 'js_binding', /^\s*=\s*/, 'js_expr', /^\s*;?/])
  .addOr('js_binding', ['js_destruct_obj', 'js_destruct_arr', 'js_ident'])
  .addSeq('js_destruct_obj', [/^\{\s*/, 'js_ident_list', /^\s*\}/])
  .addSeq('js_destruct_arr', [/^\[\s*/, 'js_ident_list', /^\s*\]/])
  .addRep('js_ident_list', ['js_ident', /^\s*,?\s*/])
  
  // Functions
  .addOr('js_function', ['js_func_decl', 'js_arrow', 'js_func_expr'])
  .addSeq('js_func_decl', [/^function\s+/, 'js_ident', 'js_params', /^\s*/, 'js_block'])
  .addSeq('js_func_expr', [/^function\s*/, 'js_params', /^\s*/, 'js_block'])
  .addSeq('js_arrow', ['js_arrow_params', /^\s*=>\s*/, 'js_arrow_body'])
  .addOr('js_arrow_params', ['js_params', 'js_ident'])
  .addOr('js_arrow_body', ['js_block', 'js_expr'])
  .addSeq('js_params', [/^\(\s*/, 'js_param_list', /^\s*\)/])
  .addRep('js_param_list', ['js_ident', /^\s*,?\s*/])
  
  // Control flow
  .addSeq('js_if', [/^if\s*\(\s*/, 'js_expr', /^\s*\)\s*/, 'js_statement', 'js_else_opt'])
  .addOr('js_else_opt', ['js_else', /^/])  // optional via empty match
  .addSeq('js_else', [/^\s*else\s*/, 'js_statement'])
  .addSeq('js_return', [/^return\s*/, 'js_expr', /^\s*;?/])
  
  // Blocks
  .addSeq('js_block', [/^\{\s*/, 'js_block_body', /^\s*\}/])
  .addRep('js_block_body', ['js_statement', /^\s*/])
  
  // Expressions (simplified, precedence would need more work)
  .addOr('js_expr', ['js_ternary', 'js_binary', 'js_unary', 'js_call', 
                     'js_member', 'js_primary'])
  .addSeq('js_ternary', ['js_binary', /^\s*\?\s*/, 'js_expr', /^\s*:\s*/, 'js_expr'])
  .addSeq('js_binary', ['js_unary', /^\s*(===?|!==?|<=?|>=?|&&|\|\||\+|\-|\*|\/|%)\s*/, 'js_expr'])
  .addSeq('js_unary', [/^(!|~|\-|\+)/, 'js_primary'])
  .addSeq('js_call', ['js_primary', /^\s*\(\s*/, 'js_arg_list', /^\s*\)/])
  .addRep('js_arg_list', ['js_expr', /^\s*,?\s*/])
  .addSeq('js_member', ['js_primary', /^\s*\.\s*/, 'js_ident'])
  
  // Primary expressions
  .addOr('js_primary', ['js_paren', 'js_object', 'js_array', 'js_string', 
                        'js_number', 'js_bool', 'js_null', 'js_ident'])
  .addSeq('js_paren', [/^\(\s*/, 'js_expr', /^\s*\)/])
  .addSeq('js_object', [/^\{\s*/, 'js_obj_members', /^\s*\}/])
  .addRep('js_obj_members', ['js_obj_member', /^\s*,?\s*/])
  .addSeq('js_obj_member', ['js_obj_key', /^\s*:\s*/, 'js_expr'])
  .addOr('js_obj_key', ['js_string', 'js_ident'])
  .addSeq('js_array', [/^\[\s*/, 'js_arg_list', /^\s*\]/])
  
  // Terminals
  .addSeq('js_string', [/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/])
  .addSeq('js_number', [/^(\d+\.?\d*(?:[eE][+-]?\d+)?)/])
  .addSeq('js_bool', [/^(true|false)/])
  .addSeq('js_null', [/^(null|undefined)/])
  .addSeq('js_ident', [/^([a-zA-Z_$][a-zA-Z0-9_$]*)/])
  .addSeq('js_expr_stmt', ['js_expr', /^\s*;?/])




const smilesParser = Parser.createParserFromRule('Smiles');
const jatexParser = Parser.createParserFromRule('Jatex');
//const markdownParser = Parser.createParserFromRule('Markdown');

function jTest(text) {
  let ast = jatexParser.parse(text);
  console.log(`testing "${text}"`, ast)
}

//jTest( '\\1234' );
//jTest( '{\\1234}' );
//jTest( '\\frac{\\1234}{\\5678}' );
//jTest( '\\foo+\\bar+\\baz' );

/*
function mdTest( text ){
  let ast = markdownParser.parse( text );
  console.log( `testing "${text}"`, ast )
}

mdTest( `
# Title
* Item *one* of my **bold** list
* Item two
`)
*/

window.Parser = Parser;
window.smileParser = smilesParser;
window.jatexParser = jatexParser;

export { Parser }
export { smilesParser }
export { jatexParser }

// Auto-generated exports
//if (typeof window !== 'undefined') window.jTest = jTest;
//export { jTest };
//if (typeof window !== 'undefined') window.mdTest = mdTest;
//export { mdTest };
