/**
 * Rule: no_console_in_production
 * 
 * Ensures console.log/warn/error calls are not left in production code.
 * Debug logging should use a proper logging framework.
 * 
 * @param {Object} context - Rule context
 * @param {string} context.fileContent - The file content to analyze
 * @param {string} context.filePath - Path to the file being analyzed
 * @param {Object} context.params - Rule parameters
 * @param {boolean} context.params.allowed_in_tests - Whether to allow console in test files
 * @returns {Object} Result with passed boolean and violations array
 */

const acorn = require('acorn');
const walk = require('acorn-walk');

module.exports = function checkNoConsoleInProduction({ fileContent, filePath, params }) {
  const allowedInTests = params.allowed_in_tests !== false; // Default true
  const violations = [];

  // Skip test files if allowed
  const isTestFile = /\.(test|spec)\.js$|\/tests?\/|__tests__/.test(filePath);
  if (isTestFile && allowedInTests) {
    return {
      passed: true,
      violations: [],
      metadata: {
        rule: 'no_console_in_production',
        filePath,
        skipped: true,
        reason: 'Test file - console allowed'
      }
    };
  }

  // Console methods to check
  const consoleMethods = ['log', 'warn', 'error', 'debug', 'info', 'trace', 'dir', 'table'];

  try {
    const ast = acorn.parse(fileContent, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true
    });

    walk.simple(ast, {
      CallExpression(node) {
        // Check for console.method() calls
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'console' &&
          node.callee.property.type === 'Identifier' &&
          consoleMethods.includes(node.callee.property.name)
        ) {
          const method = node.callee.property.name;
          violations.push({
            line: node.loc.start.line,
            column: node.loc.start.column,
            message: `console.${method}() found in production code`,
            severity: method === 'error' ? 'warning' : 'info',
            rule: 'no_console_in_production',
            filePath,
            suggestion: `Replace console.${method}() with a proper logging framework (e.g., winston, pino, bunyan)`
          });
        }
      }
    });

  } catch (parseError) {
    // Fallback to regex-based detection if AST parsing fails
    const consolePattern = /console\.(log|warn|error|debug|info|trace|dir|table)\s*\(/g;
    const lines = fileContent.split('\n');
    
    lines.forEach((line, index) => {
      let match;
      while ((match = consolePattern.exec(line)) !== null) {
        violations.push({
          line: index + 1,
          column: match.index,
          message: `console.${match[1]}() found in production code`,
          severity: match[1] === 'error' ? 'warning' : 'info',
          rule: 'no_console_in_production',
          filePath,
          suggestion: `Replace console.${match[1]}() with a proper logging framework`
        });
      }
    });
  }

  return {
    passed: violations.length === 0,
    violations,
    metadata: {
      rule: 'no_console_in_production',
      filePath,
      consoleCallsFound: violations.length
    }
  };
};