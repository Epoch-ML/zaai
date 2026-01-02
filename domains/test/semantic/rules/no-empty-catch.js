/**
 * Rule: no_empty_catch
 * 
 * Catches must not be empty - at minimum log the error or rethrow.
 * Empty catches hide bugs and make debugging impossible.
 * 
 * @param {Object} context - Rule context
 * @param {string} context.fileContent - The file content to analyze
 * @param {string} context.filePath - Path to the file being analyzed
 * @param {Object} context.params - Rule parameters (none for this rule)
 * @returns {Object} Result with passed boolean and violations array
 */

const acorn = require('acorn');
const walk = require('acorn-walk');

module.exports = function checkNoEmptyCatch({ fileContent, filePath, params }) {
  const violations = [];

  try {
    const ast = acorn.parse(fileContent, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true
    });

    walk.simple(ast, {
      TryStatement(node) {
        // Check the catch clause
        if (node.handler) {
          const catchBody = node.handler.body;
          
          if (isCatchBodyEmpty(catchBody, fileContent)) {
            violations.push({
              line: node.handler.loc.start.line,
              column: node.handler.loc.start.column,
              message: 'Empty catch block - errors are being silently swallowed',
              severity: 'error',
              rule: 'no_empty_catch',
              filePath,
              suggestion: 'At minimum, log the error: catch (err) { console.error(err); } or rethrow it'
            });
          }
        }
      }
    });

    // Also check Promise .catch() handlers
    walk.simple(ast, {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'catch' &&
          node.arguments.length > 0
        ) {
          const handler = node.arguments[0];
          
          if (isEmptyFunction(handler, fileContent)) {
            violations.push({
              line: node.loc.start.line,
              column: node.loc.start.column,
              message: 'Empty .catch() handler - promise rejections are being silently swallowed',
              severity: 'error',
              rule: 'no_empty_catch',
              filePath,
              suggestion: 'Handle the error: .catch(err => { console.error(err); })'
            });
          }
        }
      }
    });

  } catch (parseError) {
    violations.push({
      line: 1,
      column: 0,
      message: `Failed to parse file: ${parseError.message}`,
      severity: 'warning',
      rule: 'no_empty_catch',
      filePath
    });
  }

  return {
    passed: violations.length === 0,
    violations,
    metadata: {
      rule: 'no_empty_catch',
      filePath
    }
  };
};

/**
 * Check if a catch block body is empty or only contains comments
 */
function isCatchBodyEmpty(bodyNode, fileContent) {
  if (!bodyNode || bodyNode.type !== 'BlockStatement') {
    return false;
  }
  
  // No statements in the block
  if (bodyNode.body.length === 0) {
    // Check if there's a comment inside
    const blockSource = fileContent.slice(bodyNode.start, bodyNode.end);
    const hasComment = /\/\/.*|\/\*[\s\S]*?\*\//.test(blockSource.slice(1, -1).trim());
    
    // Even with a comment, an empty catch that doesn't do anything is problematic
    // But we'll be lenient if there's a deliberate comment explaining why
    const hasIntentionalComment = /\/[/*]\s*(intentional|ignore|expected|noop|no-op|suppress)/i.test(blockSource);
    
    return !hasIntentionalComment;
  }
  
  // Check if all statements are empty or just comments
  const meaningfulStatements = bodyNode.body.filter(stmt => {
    // Empty statement
    if (stmt.type === 'EmptyStatement') return false;
    
    // Expression statement that's just a string literal (like 'use strict' or a comment-like string)
    if (
      stmt.type === 'ExpressionStatement' &&
      stmt.expression.type === 'Literal' &&
      typeof stmt.expression.value === 'string'
    ) {
      return false;
    }
    
    return true;
  });
  
  return meaningfulStatements.length === 0;
}

/**
 * Check if a function/arrow function is empty
 */
function isEmptyFunction(node, fileContent) {
  // Arrow function with empty body
  if (node.type === 'ArrowFunctionExpression') {
    if (node.body.type === 'BlockStatement') {
      return isCatchBodyEmpty(node.body, fileContent);
    }
    // Arrow function with expression body () => undefined or () => {}
    if (
      node.body.type === 'Identifier' && node.body.name === 'undefined' ||
      node.body.type === 'ObjectExpression' && node.body.properties.length === 0
    ) {
      return true;
    }
    return false;
  }
  
  // Regular function expression
  if (node.type === 'FunctionExpression') {
    return isCatchBodyEmpty(node.body, fileContent);
  }
  
  // Identifier referencing a function (can't easily check)
  return false;
}