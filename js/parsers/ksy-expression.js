/**
 * @fileoverview A parser for KaiTai Struct (.ksy) expression language.
 * KSY expressions appear in conditionals (if:), size calculations, computed instances,
 * and other dynamic values. The language is similar to JavaScript but with some
 * specific constructs like _parent, _root, _io references.
 * The parser generates an Abstract Syntax Tree (AST) that can be evaluated separately.
 */

import {Parser} from './parser.js'
import { createHandlerRegistry, AstNode } from '../utilities2/ast-manager.js'
import { SyntaxProcessor } from "./syntax-processor.js"


/**
 * Creates a parser for KSY expression syntax.
 * KSY expressions are used in .ksy files for:
 * - Conditionals: if: some_flag == 1
 * - Sizes: size: name_length + 4
 * - Computed values: value: (offset + 31) & ~31
 * - Switch cases: switch-on: value_type
 * @returns {Parser} An instance of a Parser, configured with patterns for KSY expressions.
 * Note: The `Parser` class is expected to be defined elsewhere.
 */
function createKsyExpressionParser() {
  const patterns = [
    // Parentheses
    {
      name: '(',
      pattern: /^\(/,
      callback: callbacks.opening('(')
    },
    {
      name: ')',
      pattern: /^\)/,
      callback: callbacks.closing('(')
    },
    
    // Brackets for array access
    {
      name: '[',
      pattern: /^\[/,
      callback: callbacks.opening('[')
    },
    {
      name: ']',
      pattern: /^\]/,
      callback: callbacks.closing('[')
    },
    
    // Special identifiers (underscore-prefixed)
    {
      name: 'special-ident',
      pattern: /^_(?:parent|root|io|index|sizeof|on|is_le|is_be)\b/
    },
    
    // Method/property access marker (dot)
    {
      name: 'dot',
      pattern: /^\./
    },
    
    // Numbers - hex, binary, octal, decimal (including scientific notation)
    {
      name: 'number-hex',
      pattern: /^0x[0-9a-fA-F]+/
    },
    {
      name: 'number-binary',
      pattern: /^0b[01]+/
    },
    {
      name: 'number-octal',
      pattern: /^0o[0-7]+/
    },
    {
      name: 'number',
      pattern: /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/
    },
    
    // Strings (single and double quoted)
    {
      name: 'string-double',
      pattern: /^"/,
      endPattern: /(?<!\\)(?:\\{2})*"/
    },
    {
      name: 'string-single',
      pattern: /^'/,
      endPattern: /(?<!\\)(?:\\{2})*'/
    },
    
    // Ternary operator
    {
      name: 'question',
      pattern: /^\?/
    },
    {
      name: 'colon',
      pattern: /^:/
    },
    
    // Comparison operators (must come before single-char operators)
    {
      name: 'operator-compare',
      pattern: /^(?:==|!=|<=|>=|<|>)/
    },
    
    // Logical operators
    {
      name: 'operator-logical',
      pattern: /^(?:&&|\|\||and|or|not\b)/
    },
    
    // Bitwise operators (including shift)
    {
      name: 'operator-bitwise',
      pattern: /^(?:<<|>>|&|\||~|\^)/
    },
    
    // Arithmetic operators
    {
      name: 'operator-arithmetic',
      pattern: /^[+\-*/%]/
    },
    
    // Assignment/equality (just for completeness, rarely used in expressions)
    {
      name: 'operator-assign',
      pattern: /^=/
    },
    
    // Bang (not operator)
    {
      name: 'operator-not',
      pattern: /^!/
    },
    
    // Comma (for method arguments)
    {
      name: 'comma',
      pattern: /^,/
    },
    
    // Identifiers (field names, method names)
    // Must come after keywords and special-ident
    {
      name: 'identifier',
      pattern: /^[a-zA-Z_][a-zA-Z0-9_]*/
    },
    
    // Whitespace (space and tab only - no newlines in expressions)
    {
      name: 'whitespace',
      pattern: /^[ \t]+/
    }
  ];

  const ksyExprParser = new Parser(patterns);
  
  return ksyExprParser;
}

/**
 * Creates a KSY expression processor.
 * This processor uses the KSY expression parser to generate an AST and can render it
 * as colored HTML for debugging/display purposes.
 * @returns {{astOf: function(string): AstNode, htmlOf: function(string): string, pretty: function(AstNode): string}}
 *          An object with methods to get the AST (`astOf`), get the full HTML representation (`htmlOf`),
 *          and pretty-print a single AST node (`pretty`).
 */
function KsyExpressionProcessor() {
  const parser = createKsyExpressionParser();
  const registry = createHandlerRegistry();

  /**
   * Creates the handler functions for printing different AST nodes.
   * These handlers define how each token type is styled in the final HTML.
   * @private
   * @returns {object} An object containing the print handlers for the registry.
   */
  function makeHandlers() {
    let result = {};
    result.print = {
      'special-ident': (ast, c) => wrap('#f3f', c.val),        // _parent, _root - magenta
      'identifier': (ast, c) => wrap('#fff', c.val),           // field names - white
      'dot': (ast, c) => wrap('#fd3', c.val),                  // . - yellow
      'number-hex': (ast, c) => wrap('#3ef', c.val),           // 0xFF - cyan
      'number-binary': (ast, c) => wrap('#3ef', c.val),        // 0b1010 - cyan
      'number-octal': (ast, c) => wrap('#3ef', c.val),         // 0o755 - cyan
      'number': (ast, c) => wrap('#3ef', c.val),               // 42 - cyan
      'string-double': (ast, c) => wrap('#df3', c.val),        // "string" - light green
      'string-single': (ast, c) => wrap('#df3', c.val),        // 'string' - light green
      'operator-compare': (ast, c) => wrap('#f93', c.val),     // ==, != - orange
      'operator-logical': (ast, c) => wrap('#f93', c.val),     // &&, || - orange
      'operator-bitwise': (ast, c) => wrap('#9cf', c.val),     // &, | - light blue
      'operator-arithmetic': (ast, c) => wrap('#fd3', c.val),  // +, -, * - yellow
      'operator-assign': (ast, c) => wrap('#fd3', c.val),      // = - yellow
      'operator-not': (ast, c) => wrap('#f93', c.val),         // ! - orange
      'question': (ast, c) => wrap('#f93', c.val),             // ? - orange
      'colon': (ast, c) => wrap('#fd3', c.val),                // : - yellow
      'comma': (ast, c) => wrap('#fd3', c.val),                // , - yellow
      'whitespace': (ast, c) => c.val,                         // Preserve whitespace
      'default': (ast, c) => {
        let result = '';
        let pre, post;
        [pre, post] = prePost(ast.token);
        result += wrap('#fd3', pre);
        for (let node of ast.subtree) {
          result += pretty(node);
        }
        result += wrap('#fd3', post);
        if (result)
          return result;
        return c.val;
      }
    };
    return result;
  }

  registry.registerGroup(makeHandlers);

  /**
   * Escapes HTML special characters in a string.
   * @private
   * @param {string} str - The input string.
   * @returns {string} The HTML-safe string.
   */
  function safeString(str) {
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Returns the corresponding opening and closing characters for bracket tokens.
   * @private
   * @param {string} tok - The token (e.g., '(', '[').
   * @returns {[string, string]} A pair of strings representing the opening and closing bracket.
   */
  function prePost(tok) {
    if (tok == '(')
      return ['(', ')'];
    if (tok == '[')
      return ['[', ']'];
    return ['', ''];
  }

  /**
   * Wraps a string value in a span with a specified text color.
   * @private
   * @param {string} color - The CSS color for the text.
   * @param {string} value - The text content to wrap.
   * @returns {string} The generated HTML string, or an empty string if value is falsy.
   */
  function wrap(color, value) {
    return value ? '<span style="color:' + color + '">' + safeString(value) + '</span>' : '';
  }

  /**
   * Pretty-prints a single AST node to an HTML string with syntax highlighting.
   * @private
   * @param {AstNode} ast - The AST node to print.
   * @returns {string} The resulting HTML string.
   */
  function pretty(ast) {
    let val = ast.value || '';
    let c = {
      val: val
    };
    return registry.prettyPrint(ast, c);
  }

  return {
    astOf: (text) => parser.parse(text),
    htmlOf: (text) => {
      let ast = parser.parse(text);
      return pretty(ast);
    },
    pretty: pretty
  };
}

// Create processor instance
// const ksyExprProcessor = KsyExpressionProcessor();

/*
// Example usage
const expressions = [
  // Simple field reference
  "name_length",
  
  // Parent/root references
  "_parent.version",
  "_root.header.magic",
  
  // Arithmetic
  "offset + 32",
  "(offset + 31) & ~31",
  
  // Comparisons
  "magic == 0x47475546",
  "value_type != 0",
  
  // Ternary
  "flag ? value1 : value2",
  
  // Method calls
  "dimensions.size",
  "name.length",
  
  // Array indexing
  "dimensions[0]",
  "items[_index + 1]",
  
  // Bitwise operations
  "flags & 0xFF",
  "(value << 4) | 0x0F",
  
  // Logical
  "enabled && (count > 0)",
  "flag1 || flag2",
  
  // Complex
  "_io.pos < _io.size ? data[_index] : 0",
  
  // Hex/binary numbers
  "0xFF00 & value",
  "0b1010 | flags"
];

// Test the parser
expressions.forEach(expr => {
  console.log("Expression:", expr);
  console.log("AST:", JSON.stringify(ksyExprProcessor.astOf(expr), null, 2));
  console.log("HTML:", ksyExprProcessor.htmlOf(expr));
  console.log("---");
});
*/

/*
// Parse the expression once
const exprAst = ksyExprProcessor.astOf("(offset + 31) & ~31");

// Later, evaluate it with context
function evalKsyExpr(ast, context) {
  // context = { offset: 45230, _parent: {...}, _root: {...}, _io: {...} }
  
  // Your iterator walks the tree
  return evaluateNode(ast, context);
}

function evaluateNode(node, context) {
  switch(node.token) {
    case 'identifier':
      return context[node.value];  // Look up field value
    
    case 'special-ident':
      return context[node.value];  // _parent, _root, etc.
    
    case 'number':
      return parseFloat(node.value);
    
    case 'operator-arithmetic':
      const left = evaluateNode(node.subtree[0], context);
      const right = evaluateNode(node.subtree[2], context);  // [1] is the operator
      if (node.value === '+') return left + right;
      if (node.value === '-') return left - right;
      // ... etc
    
    case 'operator-bitwise':
      // Handle &, |, ^, ~, <<, >>
      
    case '(':
      // Evaluate contents of parentheses
      return evaluateNode(node.subtree[0], context);
    
    case '[':
      // Array access
      const array = evaluateNode(node.subtree[0], context);
      const index = evaluateNode(node.subtree[1], context);
      return array[index];
    
    case 'dot':
      // Property/method access
      const obj = evaluateNode(node.subtree[0], context);
      const prop = node.subtree[1].value;
      if (prop === 'size' || prop === 'length') return obj.length;
      return obj[prop];
    
    case 'question':
      // Ternary: condition ? true_val : false_val
      const condition = evaluateNode(node.subtree[0], context);
      return condition ? 
        evaluateNode(node.subtree[1], context) : 
        evaluateNode(node.subtree[2], context);
  }
}
*/

/*
{
  // Current field values
  name_length: 42,
  offset: 45230,
  value_type: 8,
  
  // Special references
  _parent: { }, // parent AstNode
  _root: { }, // root AstNode 
  _io: {
    pos: 45230,      // Current read position
    size: 50000000   // Total file size
  },
  _index: 0,         // Current array index (if in array)
  
  // Helper functions
  _sizeof: (type) => { } // return size of type 
}
*/

/*
function evalKsyExpr(ast, context) {
  if (!ast) return null;
  
  switch(ast.token) {
    case 'identifier':
      return context[ast.value];
    
    case 'special-ident':
      return context[ast.value];  // _parent, _root, _io
    
    case 'number':
    case 'number-hex':
    case 'number-binary':
    case 'number-octal':
      return parseNumber(ast.value);
    
    case 'string-double':
    case 'string-single':
      return ast.value.slice(1, -1);  // Remove quotes
    
    case 'operator-arithmetic':
      return evalArithmetic(ast, context);
    
    case 'operator-compare':
      return evalCompare(ast, context);
    
    case 'operator-bitwise':
      return evalBitwise(ast, context);
    
    case 'operator-logical':
      return evalLogical(ast, context);
    
    case 'operator-not':
      return !evalKsyExpr(ast.subtree[0], context);
    
    case 'question':  // Ternary
      return evalKsyExpr(ast.subtree[0], context) 
        ? evalKsyExpr(ast.subtree[1], context)
        : evalKsyExpr(ast.subtree[2], context);
    
    case 'dot':  // Property access
      const obj = evalKsyExpr(ast.subtree[0], context);
      const prop = ast.subtree[1].value;
      return obj[prop];
    
    case '[':  // Array indexing
      const arr = evalKsyExpr(ast.subtree[0], context);
      const idx = evalKsyExpr(ast.subtree[1], context);
      return arr[idx];
    
    case '(':  // Grouping
      return evalKsyExpr(ast.subtree[0], context);
    
    default:
      return ast.value;
  }
}
*/
// Auto-generated exports
if (typeof window !== 'undefined') window.KsyExpressionProcessor = KsyExpressionProcessor;
export { KsyExpressionProcessor };
if (typeof window !== 'undefined') window.createKsyExpressionParser = createKsyExpressionParser;
export { createKsyExpressionParser };
if (typeof window !== 'undefined') window.evalKsyExpr = evalKsyExpr;
export { evalKsyExpr };
if (typeof window !== 'undefined') window.evaluateNode = evaluateNode;
export { evaluateNode };
if (typeof window !== 'undefined') window.exprAst = exprAst;
export { exprAst };
if (typeof window !== 'undefined') window.expressions = expressions;
export { expressions };
