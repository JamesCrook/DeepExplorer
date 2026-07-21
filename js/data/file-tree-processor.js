/**
 * @fileoverview File Tree Processor
 * Builds an AST from directory entries using the same AstNode structure as the parser.
 * Supports YAML files as sub-parsed content.
 */

import { createHandlerRegistry, AstNode } from '../utilities2/ast-manager.js'


/**
 * Creates a processor for file tree structures.
 * Builds AST from directory entries and generates ASCII output via handlers.
 * @param {object} [yamlProcessor] - Optional YamlProcessor instance for parsing YAML files
 * @returns {object} Processor with methods for building and rendering file tree AST
 */
function FileTreeProcessor(yamlProcessor = null) {
  const registry = createHandlerRegistry();
  
  // Notional grammar rules for file tree traversal
  // These match Parser's rule format: { type: 'seq'|'or'|'rep', data: [...] }
  const RULES = {
    root: { type: 'seq', data: ['directory'] },
    directory: { type: 'rep', data: ['item'] },
    item: { type: 'or', data: ['file', 'directory'] },
    file: { type: 'seq', data: ['name'] },
    // When a file contains YAML, it becomes a container
    yamlFile: { type: 'seq', data: ['name', 'yamlContent'] }
  };
  
  // File patterns to identify YAML files
  const YAML_EXTENSIONS = ['.yaml', '.yml', '.ksy'];
  
  /**
   * Creates an AstNode for a directory.
   * @param {string} name - Directory name
   * @param {Array<AstNode>} children - Child nodes (files and directories)
   * @returns {AstNode}
   */
  function createDirectoryNode(name, children = []) {
    return new AstNode('directory', RULES.directory, children, name, 0, null);
  }
  
  /**
   * Creates an AstNode for a file.
   * @param {string} name - File name
   * @param {AstNode|null} contentAst - Optional parsed content AST (e.g., YAML)
   * @returns {AstNode}
   */
  function createFileNode(name, contentAst = null) {
    const subtree = contentAst ? [contentAst] : [];
    const rule = contentAst ? RULES.yamlFile : RULES.file;
    return new AstNode('file', rule, subtree, name, 0, null);
  }
  
  /**
   * Checks if a filename has a YAML extension.
   * @param {string} name - Filename to check
   * @returns {boolean}
   */
  function isYamlFile(name) {
    const lower = name.toLowerCase();
    return YAML_EXTENSIONS.some(ext => lower.endsWith(ext));
  }
  
  /**
   * Converts a plain object tree to AST.
   * Used for sample data.
   * @param {object} obj - Object representing tree structure
   * @param {string} name - Name for the root node
   * @returns {AstNode}
   */
  function objectToAst(obj, name) {
    const children = [];
    
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        // Folder with file children
        const folderChildren = value.map(item => createFileNode(String(item)));
        children.push(createDirectoryNode(key, folderChildren));
      } else if (typeof value === 'object' && value !== null) {
        // Nested folder
        children.push(objectToAst(value, key));
      } else {
        // File
        children.push(createFileNode(String(key)));
      }
    }
    
    return createDirectoryNode(name, children);
  }
  
  /**
   * Reads all entries from a directory reader.
   * Handles batched reading required by the FileSystem API.
   * @private
   * @param {DirectoryReader} dirReader
   * @returns {Promise<Array<FileSystemEntry>>}
   */
  async function readAllEntries(dirReader) {
    return new Promise((resolve) => {
      const results = [];
      const readBatch = () => {
        dirReader.readEntries((entries) => {
          if (entries.length === 0) {
            resolve(results);
          } else {
            results.push(...entries);
            readBatch();
          }
        });
      };
      readBatch();
    });
  }
  
  /**
   * Reads file content as text.
   * @private
   * @param {FileSystemFileEntry} fileEntry
   * @returns {Promise<string>}
   */
  function readFileContent(fileEntry) {
    return new Promise((resolve, reject) => {
      fileEntry.file((file) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      }, reject);
    });
  }
  
  /**
   * Checks if a name matches any skip pattern.
   * @private
   * @param {string} name
   * @param {Array<string>} patterns
   * @returns {boolean}
   */
  function shouldSkip(name, patterns) {
    return patterns.some(p => name === p || name.startsWith(p + '/'));
  }
  
  /**
   * Sorts children: directories first, then alphabetically by name.
   * @private
   * @param {Array<AstNode>} children
   */
  function sortChildren(children) {
    children.sort((a, b) => {
      if (a.token !== b.token) return a.token === 'directory' ? -1 : 1;
      return a.value.localeCompare(b.value);
    });
  }
  
  /**
   * Recursively sorts all nodes in the tree.
   * @private
   * @param {AstNode} node
   */
  function sortTree(node) {
    if (node.subtree && node.subtree.length > 0) {
      // Only sort direct children that are file/directory nodes
      const fileTreeChildren = node.subtree.filter(
        c => c.token === 'file' || c.token === 'directory'
      );
      if (fileTreeChildren.length > 0) {
        sortChildren(node.subtree);
      }
      node.subtree.forEach(sortTree);
    }
  }
  
  /**
   * Process a FileSystemEntry (from drag-drop) into AST.
   * @param {FileSystemEntry} entry
   * @param {Array<string>} [skipPatterns=[]] - Names to skip (e.g., ['.git', '.DS_Store'])
   * @param {boolean} [parseYaml=false] - Whether to parse YAML file contents
   * @returns {Promise<AstNode>}
   */
  async function processEntry(entry, skipPatterns = [], parseYaml = false) {
    if (entry.isFile) {
      let contentAst = null;
      
      // Parse YAML files if enabled and processor available
      if (parseYaml && yamlProcessor && isYamlFile(entry.name)) {
        try {
          const content = await readFileContent(entry);
          contentAst = yamlProcessor.astOf(content);
        } catch (e) {
          console.warn(`Failed to parse YAML file ${entry.name}:`, e);
        }
      }
      
      return createFileNode(entry.name, contentAst);
    }
    
    if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const entries = await readAllEntries(dirReader);
      
      const children = [];
      for (const child of entries) {
        if (shouldSkip(child.name, skipPatterns)) continue;
        children.push(await processEntry(child, skipPatterns, parseYaml));
      }
      
      sortChildren(children);
      return createDirectoryNode(entry.name, children);
    }
    
    // Unknown entry type
    return createFileNode(entry.name);
  }
  
  /**
   * Process File objects (from click-to-browse) into AST.
   * @param {Array<File>} files
   * @param {Array<string>} [skipPatterns=[]] - Names to skip
   * @param {boolean} [parseYaml=false] - Whether to parse YAML file contents
   * @returns {Promise<AstNode>}
   */
  async function processFiles(files, skipPatterns = [], parseYaml = false) {
    if (files.length === 0) return null;
    
    const rootName = files[0].webkitRelativePath.split('/')[0];
    const root = createDirectoryNode(rootName, []);
    
    for (const file of files) {
      const parts = file.webkitRelativePath.split('/');
      
      // Check if any part matches skip patterns
      const shouldSkipFile = parts.some(part => shouldSkip(part, skipPatterns));
      if (shouldSkipFile) continue;
      
      let current = root;
      
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        
        if (isLast) {
          // It's a file
          let contentAst = null;
          
          if (parseYaml && yamlProcessor && isYamlFile(part)) {
            try {
              const content = await file.text();
              contentAst = yamlProcessor.astOf(content);
            } catch (e) {
              console.warn(`Failed to parse YAML file ${part}:`, e);
            }
          }
          
          current.subtree.push(createFileNode(part, contentAst));
        } else {
          // It's a directory - find or create
          let dir = current.subtree.find(
            c => c.token === 'directory' && c.value === part
          );
          if (!dir) {
            dir = createDirectoryNode(part, []);
            current.subtree.push(dir);
          }
          current = dir;
        }
      }
    }
    
    sortTree(root);
    return root;
  }
  
  /**
   * Counts files and directories in the tree.
   * @param {AstNode} ast
   * @returns {{files: number, directories: number}}
   */
  function countNodes(ast) {
    let files = 0;
    let directories = 0;
    
    function traverse(node) {
      if (node.token === 'file') {
        files++;
      } else if (node.token === 'directory') {
        directories++;
      }
      if (node.subtree) {
        node.subtree.forEach(traverse);
      }
    }
    
    traverse(ast);
    return { files, directories };
  }
  
  // ============================================================
  // Handlers for ASCII output
  // ============================================================
  
  function makeAsciiHandlers() {
    return {
      ascii: {
        'directory': (ast, c) => {
          const name = ast.value;
          const prefix = c.prefix || '';
          const isLast = c.isLast !== false;
          const isRoot = c.isRoot !== false;
          
          let result = '';
          
          if (isRoot) {
            result += name + '/\n';
          } else {
            const connector = isLast ? '└─ ' : '├─ ';
            result += prefix + connector + name + '/\n';
          }
          
          // Calculate prefix for children
          const childPrefix = prefix + (isRoot ? '' : (isLast ? '   ' : '│  '));
          
          // Only process file/directory children (not YAML content)
          const children = ast.subtree.filter(
            child => child.token === 'file' || child.token === 'directory'
          );
          
          for (let i = 0; i < children.length; i++) {
            const childIsLast = i === children.length - 1;
            result += registry.ascii(children[i], {
              prefix: childPrefix,
              isLast: childIsLast,
              isRoot: false
            });
          }
          
          return result;
        },
        
        'file': (ast, c) => {
          const name = ast.value;
          const prefix = c.prefix || '';
          const isLast = c.isLast !== false;
          const connector = isLast ? '└─ ' : '├─ ';
          return prefix + connector + name + '\n';
        },
        
        'default': (ast, c) => {
          // For other nodes (e.g., YAML content), skip in ASCII output
          return '';
        }
      }
    };
  }
  
  registry.registerGroup(makeAsciiHandlers);
  
  /**
   * Generates ASCII tree representation.
   * @param {AstNode} ast - Root node of the tree
   * @param {boolean} [addComments=false] - Whether to add # at end of lines
   * @returns {string}
   */
  function toAscii(ast, addComments = false) {
    if (!ast) return '';
    
    const text = registry.ascii(ast, { isRoot: true });
    
    if (addComments) {
      const lines = text.split('\n').filter(l => l.length > 0);
      const maxLen = Math.max(...lines.map(l => l.length));
      const padTo = maxLen + 4;
      return lines.map(l => l.padEnd(padTo) + '#').join('\n');
    }
    
    return text.trimEnd();
  }
  
  // ============================================================
  // Public API
  // ============================================================
  
  return {
    // AST creation
    createDirectoryNode,
    createFileNode,
    objectToAst,
    processEntry,
    processFiles,
    
    // Tree operations
    countNodes,
    sortTree,
    
    // Output generation
    toAscii,
    
    // Access to rules (for extension)
    RULES,
    
    // Access to registry (for adding custom handlers)
    registry
  };
}

export { FileTreeProcessor }