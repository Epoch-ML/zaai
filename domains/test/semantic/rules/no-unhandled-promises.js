/**
 * Rule: no_unhandled_promises
 * 
 * Ensures all promises have proper error handling via .catch() or try/catch
 * in async functions. Unhandled rejections crash Node.js.
 * 
 * @param {Object} context - Rule context
 * @param {string} context.fileContent - The file content to analyze
 * @param {string} context.filePath - Path to the file being analyzed
 * @param {Object} context.params - Rule parameters
 * @param {boolean} context.params.check_async_functions - Check for try/catch in async functions
 * @param {boolean} context.params.check_then_chains - Check for .catch() in .then() chains
 * @returns {Object} Result with passed boolean and violations array
 */

const acorn = require('acorn');
const walk = require('acorn-walk');

module.exports = function checkNoUnhandledPromises({ fileContent, filePath, params }) {
  const checkAsyncFunctions = params.check_async_functions !== false;
  const checkThenChains = params.check_then_chains !== false;
  
  const violations = [];

  try {
    const ast = acorn.parse(fileContent, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true
    });

    // Track which expressions have error handling
    const handledExpressions = new Set();

    // First pass: find all .catch() calls and mark their callee as handled
    walk.simple(ast, {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'catch'
        ) {
          // Mark the entire chain as handled
          let current = node.callee.object;
          while (current) {
            handledExpressions.add(current.start);
            if (current.type === 'CallExpression' && current.callee.type === 'MemberExpression') {
              current = current.callee.object;
            } else {
              break;
            }
          }
        }
      }
    });

    // Check .then() chains for missing .catch()
    if (checkThenChains) {
      walk.simple(ast, {
        CallExpression(node) {
          if (
            node.callee.type === 'MemberExpression' &&
            node.callee.property.type === 'Identifier' &&
            node.callee.property.name === 'then'
          ) {
            // Check if this .then() chain has a .catch()
            if (!hasCatchInChain(node, handledExpressions)) {
              violations.push({
                line: node.loc.start.line,
                column: node.loc.start.column,
                message: 'Promise .then() chain without .catch() error handler',
                severity: 'warning',
                rule: 'no_unhandled_promises',
                filePath,
                suggestion: 'Add .catch(err => { /* handle error */ }) to the promise chain'
              });
            }
          }
        }
      });
    }

    // Check async functions for proper try/catch around await
    if (checkAsyncFunctions) {
      walk.ancestor(ast, {
        FunctionDeclaration(node, ancestors) {
          if (node.async) {
            checkAsyncFunctionBody(node, violations, filePath);
          }
        },
        FunctionExpression(node, ancestors) {
          if (node.async) {
            checkAsyncFunctionBody(node, violations, filePath);
          }
        },
        ArrowFunctionExpression(node, ancestors) {
          if (node.async) {
            checkAsyncFunctionBody(node, violations, filePath);
          }
        }
      });
    }

    // Check for floating promises (promise-returning calls not awaited or .then'd)
    walk.ancestor(ast, {
      ExpressionStatement(node, ancestors) {
        const expr = node.expression;
        
        // Check if it's a call that likely returns a promise but isn't handled
        if (expr.type === 'CallExpression') {
          const callee = expr.callee;
          
          // Skip if it's already a .then/.catch/.finally call
          if (
            callee.type === 'MemberExpression' &&
            callee.property.type === 'Identifier' &&
            ['then', 'catch', 'finally'].includes(callee.property.name)
          ) {
            return;
          }
          
          // Check for common async patterns that might be floating
          const funcName = getFunctionName(callee);
          const asyncPatterns = [
            /^fetch/i,
            /^get[A-Z]/,
            /^post[A-Z]/,
            /^put[A-Z]/,
            /^delete[A-Z]/,
            /^load/i,
            /^save/i,
            /^send/i,
            /^request/i,
            /Async$/
          ];
          
          if (funcName && asyncPatterns.some(p => p.test(funcName))) {
            // Check if we're inside a try block or if parent handles the promise
            const isInTryBlock = ancestors.some(a => a.type === 'TryStatement');
            
            if (!isInTryBlock) {
              violations.push({
                line: node.loc.start.line,
                column: node.loc.start.column,
                message: `Potential floating promise: '${funcName}()' result not awaited or handled`,
                severity: 'info',
                rule: 'no_unhandled_promises',
                filePath,
                suggestion: `Use 'await ${funcName}()' or add '.catch()' / '.then()'`
              });
            }
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
      rule: 'no_unhandled_promises',
      filePath
    });
  }

  return {
    passed: violations.filter(v => v.severity === 'error' || v.severity === 'warning').length === 0,
    violations,
    metadata: {
      rule: 'no_unhandled_promises',
      filePath,
      checksPerformed: {
        asyncFunctions: checkAsyncFunctions,
        thenChains: checkThenChains
      }
    }
  };
};

/**
 * Check if a .then() call eventually has a .catch() in its chain
 */
function hasCatchInChain(node, handledExpressions) {
  if (handledExpressions.has(node.start)) {
    return true;
  }
  
  // Check if this node is part of a chain that ends with .catch()
  // This is a simplified check - could be enhanced for complex chains
  return false;
}

/**
 * Check an async function body for unhandled await expressions
 */
function checkAsyncFunctionBody(funcNode, violations, filePath) {
  const body = funcNode.body;
  if (!body) return;
  
  // Find all await expressions
  const awaitExpressions = [];
  
  walk.simple(body, {
    AwaitExpression(node) {
      awaitExpressions.push(node);
    }
  });
  
  if (awaitExpressions.length === 0) return;
  
  // Check if the function has any try/catch
  let hasTryCatch = false;
  const tryBlocks = [];
  
  walk.simple(body, {
    TryStatement(node) {
      hasTryCatch = true;
      tryBlocks.push({
        start: node.block.start,
        end: node.block.end
      });
    }
  });
  
  // Check each await expression
  for (const awaitExpr of awaitExpressions) {
    const isInTryBlock = tryBlocks.some(
      block => awaitExpr.start >= block.start && awaitExpr.end <= block.end
    );
    
    if (!isInTryBlock && !hasTryCatch) {
      // Only warn if no try/catch exists at all
      // (could be more sophisticated to check specific awaits)
    }
  }
  
  // If function has awaits but no try/catch at all, issue one warning
  if (awaitExpressions.length > 0 && !hasTryCatch) {
    const funcName = funcNode.id ? funcNode.id.name : '<anonymous>';
    violations.push({
      line: funcNode.loc.start.line,
      column: funcNode.loc.start.column,
      message: `Async function '${funcName}' has await expressions without try/catch`,
      severity: 'info',
      rule: 'no_unhandled_promises',
      filePath,
      suggestion: 'Wrap await expressions in try/catch blocks to handle rejections'
    });
  }
}

/**
 * Get the name of a function from its callee node
 */
function getFunctionName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return callee.property.name;
  }
  return null;
}