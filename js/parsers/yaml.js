/**
 * @fileoverview A parser and syntax highlighter for YAML.
 * It handles standard YAML syntax including nested structures, lists, mappings,
 * multi-line strings, anchors, and aliases.
 * The parser generates an Abstract Syntax Tree (AST), and the processor
 * converts this AST into syntax-highlighted HTML.
 */

import {Parser} from './parser.js'
import { createHandlerRegistry, AstNode } from '../utilities2/ast-manager.js'


/**
 * Creates a parser for YAML syntax.
 * This parser handles indentation-based nesting, various value types,
 * and YAML-specific features like anchors and multi-line strings.
 * @returns {Parser} An instance of a Parser, configured with patterns for YAML syntax.
 * Note: The `Parser` class is expected to be defined elsewhere.
 */
function createYAMLParser() {
  const callbacks = {
    opening:  ()=> { },
    closing:  ()=> { },
    island:  ()=> { },

  }
  const patterns = [
    // Comments - must come before other # uses
    {
      name: '#',
      pattern: /^#/,
      endPattern: /.*/
    },
    
    // Document separators
    {
      name: '---',
      pattern: /^---/
    },
    {
      name: '...',
      pattern: /^\.\.\./
    },
    
    // Multi-line string indicators (must be followed by newline)
    {
      name: 'multiline-literal',
      pattern: /^\|[-+]?(?=\s|$)/,
      callback: callbacks.island(/\n(?!\s)/, 'literal-content')
    },
    {
      name: 'multiline-folded',
      pattern: /^>[-+]?(?=\s|$)/,
      callback: callbacks.island(/\n(?!\s)/, 'folded-content')
    },
    
    // Anchors and aliases
    {
      name: 'anchor',
      pattern: /^&[a-zA-Z_][\w-]*/
    },
    {
      name: 'alias',
      pattern: /^\*[a-zA-Z_][\w-]*/
    },
    
    // Tags
    {
      name: 'tag',
      pattern: /^!<?[a-zA-Z_][\w-]*>?/
    },
    
    // Inline collections
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
    {
      name: '{',
      pattern: /^\{/,
      callback: callbacks.opening('{')
    },
    {
      name: '}',
      pattern: /^\}/,
      callback: callbacks.closing('{')
    },
    
    // List items (dash followed by space)
    {
      name: 'list-item',
      pattern: /^-(?=\s)/
    },
    
    // Key-value separator (colon followed by space or end)
    {
      name: 'key-separator',
      pattern: /^:(?=\s|$)/
    },
    
    // Strings - quoted (single and double)
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
    
    // Boolean values
    {
      name: 'boolean',
      pattern: /^(?:true|false|yes|no|on|off|True|False|Yes|No|On|Off|TRUE|FALSE|YES|NO|ON|OFF)(?=\s|$|[,\]}])/
    },
    
    // Null values
    {
      name: 'null',
      pattern: /^(?:null|~|Null|NULL)(?=\s|$|[,\]}])/
    },
    
    // Numbers (including scientific notation, hex, octal)
    {
      name: 'number',
      pattern: /^(?:[-+]?(?:0x[0-9a-fA-F]+|0o[0-7]+|0b[01]+|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?))(?=\s|$|[,\]}])/
    },
    
    // Comma separator (for inline collections)
    {
      name: 'comma',
      pattern: /^,/
    },
    
    // Indentation (newline + spaces)
    {
      name: 'indent',
      pattern: /^\r?\n[ ]*/
    },
    
    // Whitespace
    {
      name: 'whitespace',
      pattern: /^[ \t]+/
    },
    
    // Unquoted strings / keys (tokens)
    // Must come last to avoid matching keywords
    {
      name: 'token',
      pattern: /^[a-zA-Z_][\w.-]*/
    },
    
    // Any other unquoted value
    {
      name: 'value',
      pattern: /^[^\s:#\[\]{},"']+/
    }
  ];

  class ypProxy {
    constructor(){

    }
    parse() {
      return ['This is a fake result']
    }
  }

  const yamlParser = new ypProxy()//Parser(patterns);
  return yamlParser;

  // Parser for literal block content (|)
  const literalPatterns = [
    {
      name: 'literal-line',
      pattern: /^[^\n]*/
    },
    {
      name: 'newline',
      pattern: /^\n/
    }
  ];

  const literalParser = new Parser(literalPatterns);

  // Parser for folded block content (>)
  const foldedPatterns = [
    {
      name: 'folded-line',
      pattern: /^[^\n]*/
    },
    {
      name: 'newline',
      pattern: /^\n/
    }
  ];

  const foldedParser = new Parser(foldedPatterns);

  yamlParser.registerSubParser('literal-content', literalParser);
  yamlParser.registerSubParser('folded-content', foldedParser);

  return yamlParser;
}

/**
 * Creates a YAML syntax highlighter processor.
 * This processor uses the YAML parser to generate an AST and then renders it as colored HTML.
 * @returns {{astOf: function(string): AstNode, htmlOf: function(string): string, pretty: function(AstNode): string}}
 *          An object with methods to get the AST (`astOf`), get the full HTML representation (`htmlOf`),
 *          and pretty-print a single AST node (`pretty`).
 */
function YamlProcessor() {
  const parser = createYAMLParser();
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
      '#': (ast, c) => wrap('#3b3', c.val),                    // Comments - green
      '---': (ast, c) => wrap('#f93', c.val),                  // Document separator - orange
      '...': (ast, c) => wrap('#f93', c.val),                  // Document end - orange
      'multiline-literal': (ast, c) => wrap('#f93', c.val),    // | indicator - orange
      'multiline-folded': (ast, c) => wrap('#f93', c.val),     // > indicator - orange
      'literal-line': (ast, c) => wrap('#df3', c.val),         // Literal content - light green
      'folded-line': (ast, c) => wrap('#df3', c.val),          // Folded content - light green
      'anchor': (ast, c) => wrap('#f3f', c.val),               // &anchor - magenta
      'alias': (ast, c) => wrap('#f3f', c.val),                // *alias - magenta
      'tag': (ast, c) => wrap('#f93', c.val),                  // !tag - orange
      'list-item': (ast, c) => wrap('#fd3', c.val),            // - (dash) - yellow
      'key-separator': (ast, c) => wrap('#fd3', c.val),        // : (colon) - yellow
      'string-double': (ast, c) => wrap('#df3', c.val),        // "string" - light green
      'string-single': (ast, c) => wrap('#df3', c.val),        // 'string' - light green
      'boolean': (ast, c) => wrap('#9cf', c.val),              // true/false - light blue
      'null': (ast, c) => wrap('#999', c.val),                 // null - gray
      'number': (ast, c) => wrap('#3ef', c.val),               // 123 - cyan
      'comma': (ast, c) => wrap('#fd3', c.val),                // , - yellow
      'indent': (ast, c) => bwrap('#f932', c.val),             // Indentation - faint background
      'token': (ast, c) => wrap('#fff', c.val),                // Keys/identifiers - white
      'value': (ast, c) => wrap('#ddd', c.val),                // Unquoted values - light gray
      'whitespace': (ast, c) => c.val,                         // Preserve whitespace
      'newline': (ast, c) => c.val,                            // Preserve newlines
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
   * Escapes HTML special characters in a string to prevent them from being interpreted as HTML tags.
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
   * @param {string} tok - The token (e.g., '[', '{').
   * @returns {[string, string]} A pair of strings representing the opening and closing bracket.
   */
  function prePost(tok) {
    if (tok == '[')
      return ['[', ']'];
    if (tok == '{')
      return ['{', '}'];
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
   * Wraps a string value in a span with a specified background color.
   * @private
   * @param {string} color - The CSS color for the background.
   * @param {string} value - The text content to wrap.
   * @returns {string} The generated HTML string, or an empty string if value is falsy.
   */
  function bwrap(color, value) {
    return value ? '<span style="background-color:' + color + '">' + safeString(value) + '</span>' : '';
  }

  /**
   * Pretty-prints a single AST node to an HTML string with syntax highlighting.
   * It uses the handler registry to determine the correct styling for the node.
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
// const yamlProcessor = YamlProcessor();

/*
// Example usage
const yamlCode = `
---
# YAML Configuration Example
general:
  architecture: llama
  name: "My Model"
  file_type: 1
  quantization_version: 2

# Nested structure
llama:
  context_length: 2048
  embedding_length: 4096
  block_count: 32
  attention:
    head_count: 32
    head_count_kv: 8
  
# Arrays
layers: [1, 2, 3, 4, 5]
features:
  - transformer
  - attention
  - feedforward

# Multi-line string
description: |
  This is a multi-line
  literal block string
  that preserves newlines

# Anchors and aliases
defaults: &default_settings
  enabled: true
  timeout: 30

service1:
  <<: *default_settings
  name: "Service One"

# Boolean and null
active: yes
disabled: false
nothing: null
...
`;

// Test the parser
console.log("YAML AST:", JSON.stringify(yamlProcessor.astOf(yamlCode), null, 2));
console.log("YAML HTML:", yamlProcessor.htmlOf(yamlCode));
*/
// Auto-generated exports
if (typeof window !== 'undefined') window.YamlProcessor = YamlProcessor;
export { YamlProcessor };
if (typeof window !== 'undefined') window.createYAMLParser = createYAMLParser;
export { createYAMLParser };
if (typeof window !== 'undefined') window.yamlCode = yamlCode;
export { yamlCode };
