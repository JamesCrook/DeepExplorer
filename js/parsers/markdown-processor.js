/**
 * @fileoverview Provides processors for Markdown and Markdown-style tables.
 * The main `MarkdownProcessor` handles standard Markdown syntax and includes
 * special support for "islands" of code (JSON or JavaScript), which can be
 * processed separately. A `TableProcessor` is also included for converting
 * pipe-based tables into HTML.
 */

import {Parser} from './parser.js'
import { createHandlerRegistry, AstNode } from '../utilities2/ast-manager.js'

/**
 * Creates a processor for Markdown text, with special support for code islands.
 * It uses a PEG parser to generate an AST and then renders it as HTML.
 * Code islands (e.g., ```json ... ```) can be processed and their data
 * extracted for later use.
 * @returns {{
 *   astOf: function(string): object,
 *   htmlOf: function(string): {text: string, fns: Array<object>},
 *   pretty: function(object): string,
 *   jsToJSON: function(string): object
 * }} An object with methods for parsing and rendering Markdown.
 *   - `htmlOf` returns an object containing the HTML string and an array of `delayedFns`
 *     which are the parsed data from any code islands.
 */
function MarkdownProcessor() {
  // State variables for processing
  let islandsAs = null;
  let delayedFns = [];

  const parser = Parser.createParserFromRule('Markdown');
  const registry = createHandlerRegistry();

  function makeHandlers() {
    let result = {}
    result.print = {
      '/*': (ast, c) => {
        return wrap('#3b3', c.val);
      },
      '#': (ast, c) => {
        let n = c.val[1].length;
        return wrap(`<h${n}>`, c.val[2], `</h${n}>`);
      },
      '---': (ast, c) => {
        return '<hr>';
      },
      'img': (ast, c) => {
        return wrap('<img>', c.val, '</img>');
      },
      // [label](http://example.com).
      'url': (ast, c) => {
        const match = c.val[1].match(/\[([^\]]+)\]\((.+?)\)/);
        if(match)
          return `<a href="${match[2]}">${match[1]}</a>`;
        return wrap('<a href="#">', c.val, '</a>');
      },
      'jexp2': (ast, c) => {
        let v = c.val[1];
        return wrap(
          '<span class="code" style="color:#04d;background:#ddf;">', v,
          '</span>');
      },
      'directive': (ast, c) => {
        islandsAs = 'control'
        return `<!--${c.val[1]}-->`
      },
      'code': (ast, c) => {
        let v = c.val[1];
        return wrap('<span class="code">', v, '</span>');
      },
      'italic': (ast, c) => {
        let v = c.val[1] ?? c.val[2];
        return wrap('<em>', v, '</em>');
      },
      'bold': (ast, c) => {
        let v = c.val[1] ?? c.val[2];
        return wrap('<strong>', v, '</strong>');
      },
      'bull': (ast, c) => {
        let l = c.val.length;
        return cat('<br><span>&bull;', c.val.slice(2), '</span>');
      },
      'island': (ast, c) => {
        if(islandsAs) {
          let counter = delayedFns.length
          delayedFns.push(dataOfIsland(c.val[1]));
          islandsAs = null;
          return `<div id='auto_${counter}'>empty div</div>`;
        }
        let match = jsonIsland(c.val[1]);
        if(match)
          return wrap('', match, '');
        return wrap('<pre>', c.val[1], '</pre>');
      },
      'br': (ast, c) => {
        return '<br>\n';
      },
      'md_text': (ast, c) => {
        return c.val[1];
      },
      'default': (ast, c) => {
        let result = '';
        for(let node of ast.subtree) {
          result += pretty(node);
        }
        if(result)
          return result;
        return c.val;
      }
    }
    return result;
  }
  registry.registerGroup(makeHandlers);

  function safeString(str) {
    return str;
  }

  function wrap(pre, value, post) {
    return value ? pre + value + post : '';
  }

  function cat(pre, value, post) {
    return pre + value + post;
  }

  function parseJsonWithErrorHighlight(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      // Extract position information from error message
      const positionMatch = error.message.match(/position (\d+)/);

      if(positionMatch && positionMatch[1]) {
        const errorPosition = parseInt(positionMatch[1], 10);

        // Create a display of the error location
        const start = Math.max(0, errorPosition - 20);
        const end = Math.min(jsonString.length, errorPosition + 20);

        // Create the highlighted error string
        const errorContext = jsonString.substring(start, errorPosition) +
          '👉' +
          jsonString.substring(errorPosition, errorPosition + 1) +
          '👈' +
          jsonString.substring(errorPosition + 1, end);

        // Return useful error information
        console.error("Parsing failed:", error);
        console.error("At", errorContext);
      } else {
        // If we can't extract position, return the original error
        console.error("Parsing failed:", error);
      }
    }
  }

  /**
   * Converts a JavaScript-like object string (with comments, unquoted keys, etc.)
   * into a valid JSON object. This is a robust function that attempts to clean up
   * common non-JSON features.
   * @private
   * @param {string} jsString - The JavaScript-like object string.
   * @returns {object} The parsed JSON object.
   * @throws {Error} If parsing fails even after cleaning.
   */
  function jsToJSON(jsString) {
    // Remove comments (both line and block comments)
    let cleaned = jsString
      // Remove block comments first
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Remove line comments, but only if not inside quotes
      .replace(
        /\/\/(?=(?:[^"'\\]*(\\.|"([^"\\]|\\.)*"|'([^'\\]|\\.)*'))*[^"']*$).*$/gm,
        '');

    // Add quotes to unquoted keys
    cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_$][\w$]*)(\s*):/g,
      '$1"$2"$3:');

    // Replace single quotes with double quotes (handling escaped quotes)
    cleaned = cleaned.replace(/'((?:\\.|[^'\\])*)'/g, '"$1"');

    // Remove trailing commas in objects
    cleaned = cleaned.replace(/,(\s*})/g, '$1');

    // Remove trailing commas in arrays
    cleaned = cleaned.replace(/,(\s*\])/g, '$1');

    // Handle multiple consecutive commas in arrays (e.g., [1,,2] -> [1,null,2])
    cleaned = cleaned.replace(/\[(\s*)(,+)/g, (match, space, commas) => {
      // Replace each extra comma with "null,"
      return '[' + space + 'null,'.repeat(commas.length);
    });

    // Handle multiple consecutive commas in middle of arrays
    cleaned = cleaned.replace(/,(\s*)(,+)/g, (match, space, commas) => {
      // Replace each extra comma with ",null"
      return ',' + space + 'null,'.repeat(commas.length);
    });

    try {
      // Now it should be valid JSON
      return JSON.parse(cleaned);
    } catch (error) {
      parseJsonWithErrorHighlight(cleaned);
      console.error("Generated JSON string:", cleaned);
      throw new Error(`Failed to parse JS object: ${error.message}`);
    }
  }

  /**
   * Extracts and parses the content of a code island.
   * @private
   * @param {string} island - The full island string, including the ```.
   * @returns {object|string} The parsed data from the island, or an error message.
   */
  function dataOfIsland(island) {
    let foo = '';
    let match = island.match(/```(json|javascript)([\s\S]*?)```/);
    if(!match)
      return "Bad Island"
    try {
      if(match[1] == 'json')
        foo = JSON.parse(match[2]);
      else
        foo = jsToJSON(match[2]);
    } catch (error) {
      foo = {
        title: "Parsing Error",
        controls: [{
          id: "parseError",
          type: "button",
          label: "JSON parse failed",
        }, ]
      }
    }
    return foo;
  }

  function jsonIsland(island) {
    let foo = '';
    let match = island.match(/```(json|javascript)([\s\S]*?)```/);
    if(!match)
      return '';
    let source = match[2];
    source = source[0] == '\n' ? source.slice(1) : source;
    source = source.replace(/\n/g, '\r\n')
    //return "<div class='raw' style='color:white'>" + source + '</div>';
    return "<div class='raw' style='color:white'>" + jsProcessor.htmlOf(
      source) + '</div>';
  }

  function pretty(ast) {
    let val = safeString(ast.value || '');
    let c = {
      val: val
    };
    return registry.print(ast, c);
  }

  /**
   * Cleans up the AST before rendering, for example by removing redundant line breaks.
   * @private
   * @param {object} ast - The AST to process.
   * @returns {object} The modified AST.
   */
  function massageAst(ast) {
    if(!ast?.subtree?.length) return ast;

    // Filter out <br> nodes that follow heading nodes
    for(let i = 1; i < ast.subtree.length; i++) {
      let t1 = ast.subtree[i].token;
      let t0 = ast.subtree[i - 1].token;

      if(t1 === 'br' &&
        ((t0 === '#') || (t0 === 'island') || (t0 === '---'))) {
        ast.subtree.splice(i, 1);
        i--; // Adjust index after removal
      }
    }
    ast.subtree.forEach(node => massageAst(node));
    return ast;
  }

  function initParsing() {
    islandsAs = null;
    delayedFns = [];
  }

  return {
    astOf: (text) => parser.parse(text),
    htmlOf: (text) => {
      let ast = parser.parse(text);
      ast = massageAst(ast);
      initParsing();
      let result = pretty(ast);
      return {
        text: result,
        fns: delayedFns
      };
    },
    pretty: pretty,
    jsToJSON: jsToJSON // Expose for external use
  };
}

const markdownProcessor = MarkdownProcessor();

/*
const markdown = `
- *Clarity*: Makes the architecture understandable at a glance
- **Communication**: Facilitates discussion about system design
- **Planning**: Supports identification of dependencies and interfaces
- **Modifiability Analysis**: Makes it easier to assess the impact of changes
- **Documentation**: Serves as a quick reference for the system structure
`
console.log("Markdown Ast:", JSON.stringify(markdownProcessor.astOf(markdown), null, 2));
console.log("Markdown Html:", markdownProcessor.htmlOf(markdown));
*/

export {markdownProcessor}

// Auto-generated exports
if (typeof window !== 'undefined') window.MarkdownProcessor = MarkdownProcessor;
export { MarkdownProcessor };
//if (typeof window !== 'undefined') window.markdown = markdown;
//export { markdown };
