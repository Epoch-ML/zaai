/**
 * Rule: no_sync_in_async
 * 
 * Detects synchronous blocking calls inside async functions.
 * Use async alternatives (fs.promises, setTimeout, etc).
 * 
 * @param {Object} context - Rule context
 * @param {string} context.fileContent - The file content to analyze
 * @param {string} context.filePath - Path to the file being analyzed
 * @param {Object} context.params - Rule parameters
 * @param {string[]} context.params.sync_calls - Synchronous function calls to flag
 * @returns {Object} Result with passed boolean and violations array
 */

const acorn = require('acorn');
const walk = require('acorn-walk');

module.exports = function checkNoSyncInAsync({ fileContent, filePath, params }) {
  const syncCalls = params.sync_calls || [
    'fs.readFileSync',
    'fs.writeFileSync',
    'fs.appendFileSync',
    'fs.existsSync',
    'fs.mkdirSync',
    'fs.rmdirSync',
    'fs.unlinkSync',
    'fs.readdirSync',
    'fs.statSync',
    'fs.lstatSync',
    'fs.copyFileSync',
    'fs.renameSync',
    'fs.chmodSync',
    'fs.chownSync',
    'fs.accessSync',
    'fs.openSync',
    'fs.closeSync',
    'fs.readSync',
    'fs.writeSync',
    'execSync',
    'spawnSync',
    'execFileSync'
  ];

  // Build a lookup map for faster checking
  const syncCallsMap = new Map();
  for (const call of syncCalls) {
    const parts = call.split('.');
    if (parts.length === 2) {
      if (!syncCallsMap.has(parts[0])) {
        syncCallsMap.set(parts[0], new Set());
      }
      syncCallsMap.get(parts[0]).add(parts[1]);
    } else {
      // Single function name like 'execSync'
      syncCallsMap.set(call, new Set(['']));
    }
  }

  const violations = [];

  try {
    const ast = acorn.parse(fileContent, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true
    });

    // Track async function scopes
    const asyncScopes = [];

    walk.ancestor(ast, {
      // Track entering async functions
      FunctionDeclaration(node, ancestors) {
        if (node.async) {
          checkFunctionForSyncCalls(node, syncCallsMap, syncCalls, violations, filePath);
        }
      },
      FunctionExpression(node, ancestors) {
        if (node.async) {
          checkFunctionForSyncCalls(node, syncCallsMap, syncCalls, violations, filePath);
        }
      },
      ArrowFunctionExpression(node, ancestors) {
        if (node.async) {
          checkFunctionForSyncCalls(node, syncCallsMap, syncCalls, violations, filePath);
        }
      }
    });

  } catch (parseError) {
    violations.push({
      line: 1,
      column: 0,
      message: `Failed to parse file: ${parseError.message}`,
      severity: 'warning',
      rule: 'no_sync_in_async',
      filePath
    });
  }

  return {
    passed: violations.length === 0,
    violations,
    metadata: {
      rule: 'no_sync_in_async',
      filePath,
      syncCallsChecked: syncCalls
    }
  };
};

/**
 * Check an async function body for synchronous calls
 */
function checkFunctionForSyncCalls(funcNode, syncCallsMap, syncCalls, violations, filePath) {
  const body = funcNode.body;
  if (!body) return;

  const funcName = funcNode.id ? funcNode.id.name : '<anonymous async function>';

  walk.simple(body, {
    CallExpression(node) {
      const callInfo = getSyncCallInfo(node.callee, syncCallsMap);
      
      if (callInfo) {
        const { fullName, asyncAlternative } = callInfo;
        violations.push({
          line: node.loc.start.line,
          column: node.loc.start.column,
          message: `Synchronous call '${fullName}' inside async function '${funcName}'`,
          severity: 'warning',
          rule: 'no_sync_in_async',
          filePath,
          suggestion: asyncAlternative 
            ? `Use async alternative: ${asyncAlternative}`
            : `Consider using an async alternative to avoid blocking`
        });
      }
    }
  });
}

/**
 * Check if a callee node represents a synchronous call
 * Returns call info if it's a sync call, null otherwise
 */
function getSyncCallInfo(callee, syncCallsMap) {
  // Handle obj.method() pattern
  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.property.type === 'Identifier'
  ) {
    const objName = callee.object.name;
    const methodName = callee.property.name;
    
    if (syncCallsMap.has(objName)) {
      const methods = syncCallsMap.get(objName);
      if (methods.has(methodName)) {
        return {
          fullName: `${objName}.${methodName}`,
          asyncAlternative: getAsyncAlternative(objName, methodName)
        };
      }
    }
  }
  
  // Handle direct function call pattern like execSync()
  if (callee.type === 'Identifier') {
    const funcName = callee.name;
    if (syncCallsMap.has(funcName)) {
      return {
        fullName: funcName,
        asyncAlternative: getAsyncAlternative(null, funcName)
      };
    }
  }
  
  return null;
}

/**
 * Get the async alternative for a sync function
 */
function getAsyncAlternative(objName, methodName) {
  const alternatives = {
    'fs.readFileSync': 'await fs.promises.readFile()',
    'fs.writeFileSync': 'await fs.promises.writeFile()',
    'fs.appendFileSync': 'await fs.promises.appendFile()',
    'fs.existsSync': 'await fs.promises.access() with try/catch',
    'fs.mkdirSync': 'await fs.promises.mkdir()',
    'fs.rmdirSync': 'await fs.promises.rmdir()',
    'fs.unlinkSync': 'await fs.promises.unlink()',
    'fs.readdirSync': 'await fs.promises.readdir()',
    'fs.statSync': 'await fs.promises.stat()',
    'fs.lstatSync': 'await fs.promises.lstat()',
    'fs.copyFileSync': 'await fs.promises.copyFile()',
    'fs.renameSync': 'await fs.promises.rename()',
    'fs.chmodSync': 'await fs.promises.chmod()',
    'fs.chownSync': 'await fs.promises.chown()',
    'fs.accessSync': 'await fs.promises.access()',
    'fs.openSync': 'await fs.promises.open()',
    'execSync': 'await util.promisify(exec)()',
    'spawnSync': 'spawn() with event handlers or util.promisify',
    'execFileSync': 'await util.promisify(execFile)()'
  };

  const key = objName ? `${objName}.${methodName}` : methodName;
  return alternatives[key] || null;
}