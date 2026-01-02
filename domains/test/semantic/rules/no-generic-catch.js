/**
 * Rule: no_generic_catch
 * 
 * Catch blocks should handle specific error types when possible,
 * not just catch everything and handle uniformly.
 * 
 * @param {Object} context - Rule context
 * @param {string} context.fileContent - The file content to analyze
 * @param {string} context.filePath - Path to the file being analyzed
 * @param {Object} context.params - Rule parameters
 * @param {number} context.params.min_catch_body_lines - Minimum lines in catch body to be considered non-trivial
 * @returns {Object} Result with passed boolean and violations array
 */

const acorn = require('acorn');
const walk = require('acorn-walk');

module.exports = function checkNoGenericCatch({ fileContent, filePath, params }) {
  const minCatchBodyLines = params.min_catch_body_lines || 2;
  const violations = [];

  try {
    const ast = acorn.parse(fileContent, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true
    });

    walk.simple(ast, {
      TryStatement(node) {
        if (!node.handler) return;
        
        const catchClause = node.handler;
        const catchBody = catchClause.body;
        
        // Calculate the number of meaningful lines in the catch body
        const bodyLines = catchBody.loc.end.line - catchBody.loc.start.line;
        const statementCount = catchBody.body.length;
        
        // Skip if catch body is substantial enough
        if (bodyLines >= minCatchBodyLines && statementCount >= minCatchBodyLines) {
          return;
        }
        
        // Check if the catch body examines the error type
        const checksErrorType = hasErrorTypeCheck(catchBody);
        
        // Check if it just rethrows
        const justRethrows = isJustRethrow(catchBody, catchClause.param);
        
        // Check if it just logs
        const justLogs = isJustLogging(catchBody);
        
        // Skip if it properly checks error types
        if (checksErrorType) return;
        
        // Skip if it just rethrows (that's fine for cleanup)
        if (justRethrows) return;
        
        // Flag if it's a trivial catch-all
        if (justLogs || statementCount <= 1) {
          violations.push({
            line: catchClause.loc.start.line,
            column: catchClause.loc.start.column,
            message: 'Generic catch block without error type checking',
            severity: 'info',
            rule: 'no_generic_catch',
            filePath,
            suggestion: 'Consider checking error types: if (err instanceof SpecificError) { ... }'
          });
        }
      }
    });

  } catch (parseError) {
    violations.push({
      line: 1,
      column: 0,
      message: `Failed to parse file: ${parseError.message}`,
      severity: 'warning',
      rule: 'no_generic_catch',
      filePath
    });
  }

  return {
    passed: violations.filter(v => v.severity === 'error' || v.severity === 'warning').length === 0,
    violations,
    metadata: {
      rule: 'no_generic_catch',
      filePath,
      minCatchBodyLines
    }
  };
};

/**
 * Check if the catch body examines error types (instanceof, constructor, name, code, etc.)
 */
function hasErrorTypeCheck(catchBody) {
  let hasCheck = false;
  
  walk.simple(catchBody, {
    // Check for instanceof
    BinaryExpression(node) {
      if (node.operator === 'instanceof') {
        hasCheck = true;
      }
    },
    
    // Check for error.constructor, error.name, error.code comparisons
    MemberExpression(node) {
      if (node.property.type === 'Identifier') {
        const propName = node.property.name;
        if (['constructor', 'name', 'code', 'type', 'errno', 'syscall'].includes(propName)) {
          hasCheck = true;
        }
      }
    },
    
    // Check for switch statements on error properties
    SwitchStatement(node) {
      if (node.discriminant.type === 'MemberExpression') {
        hasCheck = true;
      }
    },
    
    // Check for if statements that might be checking error properties
    IfStatement(node) {
      // Recursively check the test condition
      walk.simple(node.test, {
        MemberExpression(testNode) {
          if (testNode.property.type === 'Identifier') {
            const propName = testNode.property.name;
            if (['constructor', 'name', 'code', 'type', 'message', 'errno'].includes(propName)) {
              hasCheck = true;
            }
          }
        },
        BinaryExpression(testNode) {
          if (testNode.operator === 'instanceof') {
            hasCheck = true;
          }
        }
      });
    }
  });
  
  return hasCheck;
}

/**
 * Check if catch body just rethrows the error
 */
function isJustRethrow(catchBody, param) {
  if (catchBody.body.length !== 1) return false;
  
  const stmt = catchBody.body[0];
  
  // throw err;
  if (stmt.type === 'ThrowStatement') {
    if (
      stmt.argument.type === 'Identifier' &&
      param &&
      param.type === 'Identifier' &&
      stmt.argument.name === param.name
    ) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if catch body just logs the error
 */
function isJustLogging(catchBody) {
  if (catchBody.body.length !== 1) return false;
  
  const stmt = catchBody.body[0];
  
  if (stmt.type !== 'ExpressionStatement') return false;
  
  const expr = stmt.expression;
  
  // console.log/error/warn(err)
  if (expr.type === 'CallExpression') {
    const callee = expr.callee;
    
    if (
      callee.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      callee.object.name === 'console'
    ) {
      return true;
    }
    
    // logger.error(err) or similar
    if (
      callee.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      ['logger', 'log', 'Logger', 'Log'].includes(callee.object.name)
    ) {
      return true;
    }
  }
  
  return false;
}