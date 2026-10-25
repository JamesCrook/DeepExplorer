import {Parser} from './parser.js'
import { createHandlerRegistry, AstNode } from '../utilities2/ast-manager.js'


/**
 * Creates a parser for Markdown-style tables.
 * It processes pipe-delimited text and converts it into an HTML table.
 * @returns {Object} Parser with `astOf`, `htmlOf`, and `pretty` methods.
 */
function TableProcessor() {
  const parser = new Parser([]);

  // closure variables...
  let row = 0;

  const registry = createHandlerRegistry();

  function makeHandlers() {
    let result = {}
    result.print = {
      'row': (ast, c) => {
        let l = c.val.length;
        row++
        if(row == 1)
          return '\n<tr>';
        if(row == 2)
          return '';
        return '</tr>\n<tr>';
      },
      'cell': (ast, c) => {
        let l = c.val.length;
        let v = c.val.slice(0, c.val.length - 1)
        // Note: chapterVerseLink function was referenced but not defined in original
        // v = chapterVerseLink( v );

        if(row == 1)
          return wrap('<th>', v, '</th>');
        if(row == 2)
          return '';
        return wrap('<td>', v, '</td>');
      },
      'citation': (ast, c) => {
        let l = c.val.length;
        return wrap('<em>', c.val, '</em>');
      },
      'default': (ast, c) => {
        let result = '';
        for(let node of ast.subtree) {
          result += pretty(node);
        }
        if(result)
          return '<table class="md_table">' + result + '</tr>\n</table>';
        return c.val;
      }
    }
    return result;
  }
  registry.registerGroup(makeHandlers);

  function safeString(str) {
    return str.replace(/</g, '&lt;');
  }

  function wrap(pre, value, post) {
    return value ? pre + value + post : '';
  }

  function pretty(ast) {
    row = 0;
    let val = safeString(ast.value || '');
    let c = {
      val: val
    };
    return registry.prettyPrint(ast, c);
  }

  return {
    astOf: (text) => parser.parse(text),
    htmlOf: (text) => {
      let ast = parser.parse(text);
      row = 0;
      return pretty(ast);
    },
    pretty: pretty
  };
}

//const tableProcessor = TableProcessor();
/*
const tabularmd = `
| Parable | Matthew | Mark | Luke |
| --- | --- | --- | --- |
| Sower | (Matthew 13:3-9) | (Mark 4:3-9) | (Luke 8:5-8) |
| Good Samaritan | | | (Luke 10:25-37) |
`;

console.log("Table Html:", tableProcessor.htmlOf(tabularmd));
*/

export { TableProcessor }

// Auto-generated exports
//if (typeof window !== 'undefined') window.tabularmd = tabularmd;
//export { tabularmd };
