'use strict';

/**
 * Manages an Abstract Syntax Tree (AST) for a given text.
 * It provides methods to convert between character positions and line/column numbers,
 * and to extract text corresponding to AST nodes.
 * @constructor
 * @param {string} text - The source text to manage.
 */
function ASTManager(text) {
  this.text = text;
  this.lines = text.split('\n');
  this.line_endings = [];
  var total = 0;
  for(var i = 0; i < this.lines.length; i++) {
    total += this.lines[i].length + 1;
    this.line_endings.push(total);
  }
}

/**
 * Returns the original text.
 * @returns {string} The text managed by this instance.
 */
ASTManager.prototype.get_text = function() {
  return this.text;
}

/**
 * Returns the lines of the text.
 * @returns {Array<string>} An array of strings, where each string is a line from the original text.
 */
ASTManager.prototype.get_lines = function() {
  return this.lines;
}

/**
 * Converts a character position to a [row, column] pair.
 * @param {number} pos - The character position (0-indexed).
 * @returns {[number, number]} An array containing the line number (0-indexed) and column number (0-indexed).
 * @throws {Error} If the position is out of bounds.
 */
ASTManager.prototype.pos_to_row_col = function(pos) {
  var line_no = -1;
  var last_ending = -1;
  for(var i = 0; i < this.line_endings.length; i++) {
    var line_ending = this.line_endings[i];
    if(pos < line_ending) {
      line_no = i;
      break;
    }
    last_ending = line_ending;
  }
  if(line_no === -1) {
    throw new Error("pos > text.length");
  }
  var col = pos - last_ending - 1;
  return [line_no, col];
}

/**
 * Converts a [row, column] pair to a character position.
 * @param {number} row - The line number (0-indexed).
 * @param {number} col - The column number (0-indexed).
 * @returns {number} The character position (0-indexed).
 */
ASTManager.prototype.row_col_to_pos = function(row, col) {
  var pos = 0;
  for(var i = 0; i < row; i++) {
    pos += this.lines[i].length + 1;
  }
  pos += col;
  return pos;
}

/**
 * Gets a substring of the text.
 * @param {number} start - The starting character position.
 * @param {number} end - The ending character position.
 * @returns {string} The selected substring.
 */
ASTManager.prototype.get_selection = function(start, end) {
  return this.text.substring(start, end);
}

/**
 * Gets the text corresponding to an AST node.
 * The node must have a `loc` property with `start` and `end` objects,
 * each having `line` and `column` properties.
 * @param {object} node - The AST node.
 * @returns {string|null} The text of the node, or null if the node has no location information.
 */
ASTManager.prototype.get_node_text = function(node) {
  if(!node.loc) return null;
  var s = this.row_col_to_pos(node.loc.start.line - 1, node.loc.start.column);
  var e = this.row_col_to_pos(node.loc.end.line - 1, node.loc.end.column);
  return this.text.substring(s, e);
}

try {
  module.exports = ASTManager;
} catch (e) {
  //
}

class AstNode {
  constructor(token, rule = null, subtree = [], value = null, jref = 0, jend =
    null) {
    this.token = token;
    this.type = token; // for compatibility with emerging code.
    this.rule = rule;
    this.subtree = subtree;
    this.value = value;
    // jref is 'where this node started and ended, in input string'.
    // useful for when we interact with the AST and want to update the
    // original string.
    this.jref = jref;
    this.jend = jend || (jref + (value ? value.length : 0));
  }
}

// The handler registry is the foundation for our double dispatch.
// We dispatch on action, e.g. print, draw, measure position
// ..and then we dispatch on production name which is ast.token, 
// (it is used as an index in an array)
//
// The registry functions make setting this up more concise.
//   We create the registry
//   We then pass a factory function that defines all the final handlers
// These are dynamically added in to the registry, reusing actions if
// they exist and creating them if they have not been seen before.
// The creation process also ensures default is used, for unrecognised tokens.
function createHandlerRegistry() {
  const handlers = {};

  const instance = {
    // We're registering groups of action handlers.
    // rather than take an array of structs, we take a factory.
    // The process of building up is additive, and what is more
    // the actions get to see the full list of functions added, so that they
    // can build up more complex actions from the simpler subroutines
    registerGroup(handlerGroupFactory) {
      const group = handlerGroupFactory(handlers);
      // group may have multiple different actions, each with per-token functions.
      // in registering them, we merge them in with what exists already.
      for(const [action, actionHandlers] of Object.entries(group)) {
        // If handler doesn't exist, create it and add the action to instance
        if(!handlers[action]) {
          handlers[action] = {};
          instance[action] = function(ast, c) {
            const handlerKind = handlers[action];
            const handler = handlerKind[ast.token] || handlerKind[
              'default'];
            if(!handler) debugger;
            return handler(ast, c);
          };
          // Give it a name to help with debugging.
          Object.defineProperty(instance[action], 'name', {
            value: 'dispatch_' + action
          });
        }
        Object.assign(handlers[action], actionHandlers);
      }
    }
  };

  return instance;
}

export { createHandlerRegistry };
export { AstNode };

// Auto-generated exports
if (typeof window !== 'undefined') window.ASTManager = ASTManager;
export { ASTManager };
