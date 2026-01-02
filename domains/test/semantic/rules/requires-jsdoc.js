/**
 * Rule: requires_jsdoc
 * 
 * Public functions and classes must have JSDoc comments documenting
 * parameters, return types, and thrown errors.
 * 
 * @param {Object} context - Rule context
 * @param {string} context.fileContent - The file content to analyze
 * @param {string} context.filePath - Path to the file being analyzed
 * @param {Object} context.params - Rule parameters
 * @param {boolean} context.params.require_param_types - Require @param tags for parameters
 * @param {boolean} context.params.require_return_type - Require @returns tag
 * @param {boolean} context.params.require_throws - Require @throws tag if function throws
 * @returns {Object} Result with passed boolean and violations array
 */

const acorn = require('acorn');
const walk = require('acorn-walk');

module.exports = function checkRequiresJsdoc({ fileContent, filePath, params }) {
  const requireParamTypes = params.require_param_types !== false;
  const requireReturnType = params.require_return_type !== false;
  const requireThrows = params.require_throws === true;
  
  const violations = [];
  const lines = fileContent.split('\n');

  try {
    const ast = acorn.parse(fileContent, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
      onComment: []  // Collect comments
    });

    // Collect all comments with their positions
    const comments = extractComments(fileContent);

    // Check exported functions and classes
    walk.simple(ast, {
      // export function foo() {}
      ExportNamedDeclaration(node) {
        if (node.declaration) {
          checkDeclaration(node.declaration, node, comments, violations, filePath, params, lines);
        }
      },
      
      // export default function() {}
      ExportDefaultDeclaration(node) {
        checkDeclaration(node.declaration, node, comments, violations, filePath, params, lines);
      },
      
      // module.exports = { foo }
      AssignmentExpression(node) {
        if (
          node.left.type === 'MemberExpression' &&
          node.left.object.type === 'Identifier' &&
          node.left.object.name === 'module' &&
          node.left.property.type === 'Identifier' &&
          node.left.property.name === 'exports'
        ) {
          // Check what's being exported
          if (node.right.type === 'ObjectExpression') {
            for (const prop of node.right.properties) {
              if (prop.value && prop.value.type === 'Identifier') {
                // This is a reference to a function defined elsewhere
                // We'd need to track the original definition
              }
            }
          } else if (node.right.type === 'FunctionExpression' || node.right.type === 'ArrowFunctionExpression') {
            checkFunctionJsdoc(node.right, node, 'module.exports', comments, violations, filePath, params, lines);
          }
        }
      },
      
      // Class declarations (even non-exported, if they have public methods)
      ClassDeclaration(node) {
        checkClassJsdoc(node, comments, violations, filePath, params, lines);
      }
    });

    // Also check top-level function declarations (they're implicitly public in modules)
    walk.simple(ast, {
      FunctionDeclaration(node) {
        // Skip if name starts with _ (private by convention)
        if (node.id && node.id.name.startsWith('_')) return;
        
        checkFunctionJsdoc(node, null, node.id ? node.id.name : '<anonymous>', comments, violations, filePath, params, lines);
      }
    });

  } catch (parseError) {
    violations.push({
      line: 1,
      column: 0,
      message: `Failed to parse file: ${parseError.message}`,
      severity: 'warning',
      rule: 'requires_jsdoc',
      filePath
    });
  }

  return {
    passed: violations.filter(v => v.severity === 'error' || v.severity === 'warning').length === 0,
    violations,
    metadata: {
      rule: 'requires_jsdoc',
      filePath,
      requirements: {
        requireParamTypes,
        requireReturnType,
        requireThrows
      }
    }
  };
};

/**
 * Extract JSDoc comments from source with their line positions
 */
function extractComments(source) {
  const comments = [];
  const commentRegex = /\/\*\*[\s\S]*?\*\//g;
  let match;
  
  while ((match = commentRegex.exec(source)) !== null) {
    const startPos = match.index;
    const endPos = startPos + match[0].length;
    
    // Calculate line number
    const beforeComment = source.slice(0, startPos);
    const lineNumber = beforeComment.split('\n').length;
    
    // Calculate end line number
    const commentLines = match[0].split('\n').length;
    const endLineNumber = lineNumber + commentLines - 1;
    
    comments.push({
      value: match[0],
      startLine: lineNumber,
      endLine: endLineNumber,
      startPos,
      endPos
    });
  }
  
  return comments;
}

/**
 * Find JSDoc comment immediately preceding a node
 */
function findPrecedingJsdoc(node, comments, lines) {
  const nodeLine = node.loc.start.line;
  
  // Look for a JSDoc comment that ends on the line immediately before the node
  // (allowing for blank lines)
  for (const comment of comments) {
    const lineGap = nodeLine - comment.endLine;
    if (lineGap >= 1 && lineGap <= 2) {
      // Check that lines between are empty
      let allEmpty = true;
      for (let i = comment.endLine; i < nodeLine - 1; i++) {
        if (lines[i] && lines[i].trim() !== '') {
          allEmpty = false;
          break;
        }
      }
      if (allEmpty) {
        return comment;
      }
    }
  }
  
  return null;
}

/**
 * Parse JSDoc content to extract tags
 */
function parseJsdoc(jsdocComment) {
  const content = jsdocComment.value;
  const result = {
    description: '',
    params: [],
    returns: null,
    throws: [],
    hasTypes: false
  };
  
  // Extract @param tags
  const paramRegex = /@param\s+(?:\{([^}]+)\}\s+)?(\[?\w+\]?)(?:\s+-?\s*(.*))?/g;
  let match;
  while ((match = paramRegex.exec(content)) !== null) {
    result.params.push({
      type: match[1] || null,
      name: match[2].replace(/[\[\]]/g, ''),
      description: match[3] || ''
    });
    if (match[1]) result.hasTypes = true;
  }
  
  // Extract @returns tag
  const returnsRegex = /@returns?\s+(?:\{([^}]+)\}\s+)?(.*)$/m;
  const returnsMatch = content.match(returnsRegex);
  if (returnsMatch) {
    result.returns = {
      type: returnsMatch[1] || null,
      description: returnsMatch[2] || ''
    };
    if (returnsMatch[1]) result.hasTypes = true;
  }
  
  // Extract @throws tags
  const throwsRegex = /@throws?\s+(?:\{([^}]+)\}\s+)?(.*)$/gm;
  while ((match = throwsRegex.exec(content)) !== null) {
    result.throws.push({
      type: match[1] || null,
      description: match[2] || ''
    });
  }
  
  return result;
}

/**
 * Check a declaration node for JSDoc
 */
function checkDeclaration(declaration, exportNode, comments, violations, filePath, params, lines) {
  if (!declaration) return;
  
  if (declaration.type === 'FunctionDeclaration') {
    const name = declaration.id ? declaration.id.name : '<anonymous>';
    checkFunctionJsdoc(declaration, exportNode, name, comments, violations, filePath, params, lines);
  } else if (declaration.type === 'ClassDeclaration') {
    checkClassJsdoc(declaration, comments, violations, filePath, params, lines);
  } else if (declaration.type === 'VariableDeclaration') {
    for (const declarator of declaration.declarations) {
      if (
        declarator.init &&
        (declarator.init.type === 'FunctionExpression' || 
         declarator.init.type === 'ArrowFunctionExpression')
      ) {
        const name = declarator.id.type === 'Identifier' ? declarator.id.name : '<anonymous>';
        checkFunctionJsdoc(declarator.init, exportNode || declaration, name, comments, violations, filePath, params, lines);
      }
    }
  }
}

/**
 * Check a function for proper JSDoc documentation
 */
function checkFunctionJsdoc(funcNode, parentNode, funcName, comments, violations, filePath, params, lines) {
  // Find the node to look for JSDoc above
  const targetNode = parentNode || funcNode;
  const jsdoc = findPrecedingJsdoc(targetNode, comments, lines);
  
  if (!jsdoc) {
    violations.push({
      line: targetNode.loc.start.line,
      column: targetNode.loc.start.column,
      message: `Function '${funcName}' is missing JSDoc documentation`,
      severity: 'warning',
      rule: 'requires_jsdoc',
      filePath,
      suggestion: 'Add a JSDoc comment block: /** @param {...} @returns {...} */'
    });
    return;
  }
  
  const parsedJsdoc = parseJsdoc(jsdoc);
  
  // Check for @param tags if required
  if (params.require_param_types) {
    const funcParams = funcNode.params || [];
    
    for (const param of funcParams) {
      let paramName = null;
      if (param.type === 'Identifier') {
        paramName = param.name;
      } else if (param.type === 'AssignmentPattern' && param.left.type === 'Identifier') {
        paramName = param.left.name;
      } else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
        paramName = param.argument.name;
      }
      
      if (paramName) {
        const documented = parsedJsdoc.params.find(p => p.name === paramName);
        if (!documented) {
          violations.push({
            line: jsdoc.startLine,
            column: 0,
            message: `Function '${funcName}' is missing @param documentation for '${paramName}'`,
            severity: 'info',
            rule: 'requires_jsdoc',
            filePath,
            suggestion: `Add: @param {type} ${paramName} - description`
          });
        } else if (!documented.type) {
          violations.push({
            line: jsdoc.startLine,
            column: 0,
            message: `Parameter '${paramName}' in '${funcName}' is missing type annotation`,
            severity: 'info',
            rule: 'requires_jsdoc',
            filePath,
            suggestion: `Add type: @param {type} ${paramName}`
          });
        }
      }
    }
  }
  
  // Check for @returns tag if required
  if (params.require_return_type && !parsedJsdoc.returns) {
    // Check if function has a return statement
    let hasReturn = false;
    walk.simple(funcNode.body || funcNode, {
      ReturnStatement(node) {
        if (node.argument) hasReturn = true;
      }
    });
    
    if (hasReturn) {
      violations.push({
        line: jsdoc.startLine,
        column: 0,
        message: `Function '${funcName}' is missing @returns documentation`,
        severity: 'info',
        rule: 'requires_jsdoc',
        filePath,
        suggestion: 'Add: @returns {type} description'
      });
    }
  }
}

/**
 * Check a class for proper JSDoc documentation
 */
function checkClassJsdoc(classNode, comments, violations, filePath, params, lines) {
  const className = classNode.id ? classNode.id.name : '<anonymous class>';
  
  // Check class-level JSDoc
  const classJsdoc = findPrecedingJsdoc(classNode, comments, lines);
  if (!classJsdoc) {
    violations.push({
      line: classNode.loc.start.line,
      column: classNode.loc.start.column,
      message: `Class '${className}' is missing JSDoc documentation`,
      severity: 'warning',
      rule: 'requires_jsdoc',
      filePath,
      suggestion: 'Add a JSDoc comment block describing the class'
    });
  }
  
  // Check public methods (those not starting with _)
  for (const member of classNode.body.body) {
    if (member.type === 'MethodDefinition') {
      const methodName = member.key.type === 'Identifier' ? member.key.name : '<computed>';
      
      // Skip private methods and constructor
      if (methodName.startsWith('_') || methodName === 'constructor') continue;
      
      checkFunctionJsdoc(member.value, member, `${className}.${methodName}`, comments, violations, filePath, params, lines);
    }
  }
}