/**
 * Rule: no_repeated_instantiation
 * 
 * Detects expensive class instantiation inside loops. Classes like Client,
 * Session, Connection should be instantiated once and reused.
 * 
 * @param {Object} context - Rule context
 * @param {string} context.fileContent - The file content to analyze
 * @param {string} context.filePath - Path to the file being analyzed
 * @param {Object} context.params - Rule parameters
 * @param {string[]} context.params.expensive_classes - Class names to check for
 * @returns {Object} Result with passed boolean and violations array
 */

const acorn = require('acorn');
const walk = require('acorn-walk');

module.exports = function checkNoRepeatedInstantiation({ fileContent, filePath, params }) {
  const expensiveClasses = params.expensive_classes || [
    'Client',
    'Session',
    'Connection',
    'Pool',
    'Engine',
    'AsyncClient',
    'AsyncSession',
    'HTTPClient',
    'Connector'
  ];

  const violations = [];

  try {
    const ast = acorn.parse(fileContent, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true
    });

    // Track loop contexts
    const loopStack = [];

    // Custom walker to track loop context
    const visitors = {
      ForStatement(node) {
        loopStack.push({ type: 'for', node });
      },
      ForInStatement(node) {
        loopStack.push({ type: 'for-in', node });
      },
      ForOfStatement(node) {
        loopStack.push({ type: 'for-of', node });
      },
      WhileStatement(node) {
        loopStack.push({ type: 'while', node });
      },
      DoWhileStatement(node) {
        loopStack.push({ type: 'do-while', node });
      },
      NewExpression(node) {
        // Check if we're inside a loop
        if (loopStack.length > 0) {
          // Get the class name being instantiated
          let className = null;
          if (node.callee.type === 'Identifier') {
            className = node.callee.name;
          } else if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
            className = node.callee.property.name;
          }

          if (className && expensiveClasses.includes(className)) {
            const loopInfo = loopStack[loopStack.length - 1];
            violations.push({
              line: node.loc.start.line,
              column: node.loc.start.column,
              message: `Expensive class '${className}' instantiated inside ${loopInfo.type} loop`,
              severity: 'error',
              rule: 'no_repeated_instantiation',
              filePath,
              suggestion: `Move 'new ${className}(...)' outside the loop and reuse the instance`
            });
          }
        }
      }
    };

    // Walk the AST with loop tracking
    walk.ancestor(ast, {
      ForStatement(node, ancestors) {
        checkNewExpressions(node.body, 'for', node, expensiveClasses, violations, filePath);
      },
      ForInStatement(node, ancestors) {
        checkNewExpressions(node.body, 'for-in', node, expensiveClasses, violations, filePath);
      },
      ForOfStatement(node, ancestors) {
        checkNewExpressions(node.body, 'for-of', node, expensiveClasses, violations, filePath);
      },
      WhileStatement(node, ancestors) {
        checkNewExpressions(node.body, 'while', node, expensiveClasses, violations, filePath);
      },
      DoWhileStatement(node, ancestors) {
        checkNewExpressions(node.body, 'do-while', node, expensiveClasses, violations, filePath);
      }
    });

  } catch (parseError) {
    violations.push({
      line: 1,
      column: 0,
      message: `Failed to parse file: ${parseError.message}`,
      severity: 'error',
      rule: 'no_repeated_instantiation',
      filePath
    });
  }

  return {
    passed: violations.length === 0,
    violations,
    metadata: {
      rule: 'no_repeated_instantiation',
      filePath,
      checkedClasses: expensiveClasses
    }
  };
};

/**
 * Recursively check for NewExpression nodes within a loop body
 */
function checkNewExpressions(node, loopType, loopNode, expensiveClasses, violations, filePath) {
  if (!node) return;

  walk.simple(node, {
    NewExpression(newNode) {
      let className = null;
      if (newNode.callee.type === 'Identifier') {
        className = newNode.callee.name;
      } else if (newNode.callee.type === 'MemberExpression' && newNode.callee.property.type === 'Identifier') {
        className = newNode.callee.property.name;
      }

      if (className && expensiveClasses.includes(className)) {
        violations.push({
          line: newNode.loc.start.line,
          column: newNode.loc.start.column,
          message: `Expensive class '${className}' instantiated inside ${loopType} loop`,
          severity: 'error',
          rule: 'no_repeated_instantiation',
          filePath,
          suggestion: `Move 'new ${className}(...)' outside the loop and reuse the instance`
        });
      }
    }
  });
}