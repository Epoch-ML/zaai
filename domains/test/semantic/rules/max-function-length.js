/**
 * Rule: max_function_length
 * 
 * Functions should not exceed a maximum line count. Long functions
 * should be broken into smaller, focused units.
 * 
 * @param {Object} context - Rule context
 * @param {string} context.fileContent - The file content to analyze
 * @param {string} context.filePath - Path to the file being analyzed
 * @param {Object} context.params - Rule parameters
 * @param {number} context.params.max_lines - Maximum allowed lines per function
 * @param {string[]} context.params.exclude_patterns - Function name patterns to exclude
 * @returns {Object} Result with passed boolean and violations array
 */

const acorn = require('acorn');
const walk = require('acorn-walk');

module.exports = function checkMaxFunctionLength({ fileContent, filePath, params }) {
  const maxLines = params.max_lines || 50;
  const excludePatterns = (params.exclude_patterns || []).map(p => new RegExp(p));
  
  const violations = [];

  try {
    const ast = acorn.parse(fileContent, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true
    });

    // Check all function types
    walk.simple(ast, {
      FunctionDeclaration(node) {
        checkFunction(node, node.id ? node.id.name : '<anonymous>', maxLines, excludePatterns, violations, filePath);
      },
      
      FunctionExpression(node) {
        const name = node.id ? node.id.name : getFunctionContextName(node);
        checkFunction(node, name, maxLines, excludePatterns, violations, filePath);
      },
      
      ArrowFunctionExpression(node) {
        const name = getFunctionContextName(node);
        checkFunction(node, name, maxLines, excludePatterns, violations, filePath);
      },
      
      // Class methods
      MethodDefinition(node) {
        const methodName = node.key.type === 'Identifier' ? node.key.name : '<computed>';
        checkFunction(node.value, methodName, maxLines, excludePatterns, violations, filePath);
      }
    });

  } catch (parseError) {
    violations.push({
      line: 1,
      column: 0,
      message: `Failed to parse file: ${parseError.message}`,
      severity: 'warning',
      rule: 'max_function_length',
      filePath
    });
  }

  return {
    passed: violations.length === 0,
    violations,
    metadata: {
      rule: 'max_function_length',
      filePath,
      maxLines,
      excludePatterns: params.exclude_patterns || []
    }
  };
};

/**
 * Check a single function for line length
 */
function checkFunction(node, name, maxLines, excludePatterns, violations, filePath) {
  // Check if function name matches exclude pattern
  if (name && excludePatterns.some(p => p.test(name))) {
    return;
  }
  
  // Calculate function length
  const startLine = node.loc.start.line;
  const endLine = node.loc.end.line;
  const functionLines = endLine - startLine + 1;
  
  if (functionLines > maxLines) {
    const severity = functionLines > maxLines * 2 ? 'error' : 'warning';
    
    violations.push({
      line: startLine,
      column: node.loc.start.column,
      message: `Function '${name}' is ${functionLines} lines long (max: ${maxLines})`,
      severity,
      rule: 'max_function_length',
      filePath,
      suggestion: suggestRefactoring(functionLines, maxLines),
      details: {
        functionName: name,
        actualLines: functionLines,
        maxLines,
        exceededBy: functionLines - maxLines
      }
    });
  }
}

/**
 * Try to determine function name from context (parent assignment, etc.)
 */
function getFunctionContextName(node) {
  // This is a simplified version - a full implementation would need
  // to track parent nodes through the walk
  return '<anonymous>';
}

/**
 * Generate refactoring suggestions based on how much the limit is exceeded
 */
function suggestRefactoring(actualLines, maxLines) {
  const ratio = actualLines / maxLines;
  
  if (ratio > 3) {
    return 'This function is significantly too long. Consider breaking it into multiple smaller functions with single responsibilities.';
  } else if (ratio > 2) {
    return 'Consider extracting logical sections into separate helper functions.';
  } else if (ratio > 1.5) {
    return 'Look for opportunities to extract repeated logic or distinct operations into separate functions.';
  } else {
    return 'Consider if any sections could be extracted into a helper function.';
  }
}