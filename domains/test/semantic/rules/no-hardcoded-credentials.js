/**
 * Rule: no_hardcoded_credentials
 * 
 * Scans for hardcoded passwords, API keys, tokens, and secrets.
 * Credentials should come from environment variables or secure vaults.
 * 
 * @param {Object} context - Rule context
 * @param {string} context.fileContent - The file content to analyze
 * @param {string} context.filePath - Path to the file being analyzed
 * @param {Object} context.params - Rule parameters
 * @param {string[]} context.params.suspicious_names - Variable/property names that suggest credentials
 * @returns {Object} Result with passed boolean and violations array
 */

const acorn = require('acorn');
const walk = require('acorn-walk');

module.exports = function checkNoHardcodedCredentials({ fileContent, filePath, params }) {
  const suspiciousNames = params.suspicious_names || [
    'password',
    'passwd',
    'secret',
    'apiKey',
    'api_key',
    'apikey',
    'token',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'credential',
    'credentials',
    'authToken',
    'auth_token',
    'privateKey',
    'private_key',
    'connectionString',
    'connection_string',
    'secretKey',
    'secret_key'
  ];

  // Patterns that look like actual secrets
  const secretPatterns = [
    /^[A-Za-z0-9+/]{40,}={0,2}$/,  // Base64 encoded (40+ chars)
    /^[a-f0-9]{32,}$/i,             // Hex strings (32+ chars, like API keys)
    /^sk_[a-zA-Z0-9]{20,}$/,        // Stripe-style keys
    /^pk_[a-zA-Z0-9]{20,}$/,        // Stripe public keys
    /^ghp_[a-zA-Z0-9]{36}$/,        // GitHub personal access tokens
    /^xox[baprs]-[a-zA-Z0-9-]+$/,   // Slack tokens
    /^AIza[a-zA-Z0-9_-]{35}$/,      // Google API keys
    /^AKIA[A-Z0-9]{16}$/,           // AWS access key IDs
  ];

  const violations = [];

  // Skip test fixture files
  if (/fixtures|mocks|__mocks__|\.test\.|\.spec\./.test(filePath)) {
    return {
      passed: true,
      violations: [],
      metadata: {
        rule: 'no_hardcoded_credentials',
        filePath,
        skipped: true,
        reason: 'Test/fixture file'
      }
    };
  }

  try {
    const ast = acorn.parse(fileContent, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true
    });

    walk.simple(ast, {
      // Check variable declarations: const password = "secret123"
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && node.init) {
          const varName = node.id.name.toLowerCase();
          const isSuspicious = suspiciousNames.some(name => 
            varName.includes(name.toLowerCase())
          );

          if (isSuspicious && isHardcodedString(node.init)) {
            const value = getStringValue(node.init);
            if (value && !isPlaceholder(value)) {
              violations.push({
                line: node.loc.start.line,
                column: node.loc.start.column,
                message: `Potential hardcoded credential in variable '${node.id.name}'`,
                severity: 'error',
                rule: 'no_hardcoded_credentials',
                filePath,
                suggestion: `Use environment variables: process.env.${node.id.name.toUpperCase()}`
              });
            }
          }
        }
      },

      // Check object properties: { password: "secret123" }
      Property(node) {
        const propName = node.key.type === 'Identifier' ? node.key.name :
                        node.key.type === 'Literal' ? String(node.key.value) : null;
        
        if (propName) {
          const isSuspicious = suspiciousNames.some(name =>
            propName.toLowerCase().includes(name.toLowerCase())
          );

          if (isSuspicious && isHardcodedString(node.value)) {
            const value = getStringValue(node.value);
            if (value && !isPlaceholder(value)) {
              violations.push({
                line: node.loc.start.line,
                column: node.loc.start.column,
                message: `Potential hardcoded credential in property '${propName}'`,
                severity: 'error',
                rule: 'no_hardcoded_credentials',
                filePath,
                suggestion: `Use environment variables: process.env.${propName.toUpperCase()}`
              });
            }
          }
        }
      },

      // Check assignment expressions: this.password = "secret"
      AssignmentExpression(node) {
        let propName = null;
        if (node.left.type === 'MemberExpression' && node.left.property.type === 'Identifier') {
          propName = node.left.property.name;
        } else if (node.left.type === 'Identifier') {
          propName = node.left.name;
        }

        if (propName) {
          const isSuspicious = suspiciousNames.some(name =>
            propName.toLowerCase().includes(name.toLowerCase())
          );

          if (isSuspicious && isHardcodedString(node.right)) {
            const value = getStringValue(node.right);
            if (value && !isPlaceholder(value)) {
              violations.push({
                line: node.loc.start.line,
                column: node.loc.start.column,
                message: `Potential hardcoded credential assigned to '${propName}'`,
                severity: 'error',
                rule: 'no_hardcoded_credentials',
                filePath,
                suggestion: `Use environment variables: process.env.${propName.toUpperCase()}`
              });
            }
          }
        }
      }
    });

    // Also check for string literals that look like secrets regardless of variable name
    walk.simple(ast, {
      Literal(node) {
        if (typeof node.value === 'string' && node.value.length > 15) {
          const matchesSecretPattern = secretPatterns.some(pattern => 
            pattern.test(node.value)
          );
          
          if (matchesSecretPattern) {
            violations.push({
              line: node.loc.start.line,
              column: node.loc.start.column,
              message: `String literal appears to be a hardcoded secret or API key`,
              severity: 'error',
              rule: 'no_hardcoded_credentials',
              filePath,
              suggestion: 'Move this value to environment variables or a secure vault'
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
      rule: 'no_hardcoded_credentials',
      filePath
    });
  }

  return {
    passed: violations.length === 0,
    violations,
    metadata: {
      rule: 'no_hardcoded_credentials',
      filePath,
      suspiciousNamesChecked: suspiciousNames.length
    }
  };
};

/**
 * Check if a node is a hardcoded string (Literal or TemplateLiteral without expressions)
 */
function isHardcodedString(node) {
  if (!node) return false;
  
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return true;
  }
  
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return true;
  }
  
  return false;
}

/**
 * Extract string value from a node
 */
function getStringValue(node) {
  if (node.type === 'Literal') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map(q => q.value.cooked).join('');
  }
  return null;
}

/**
 * Check if a value is likely a placeholder, not a real secret
 */
function isPlaceholder(value) {
  const placeholderPatterns = [
    /^<.*>$/,                    // <your-api-key>
    /^\[.*\]$/,                  // [API_KEY]
    /^\{.*\}$/,                  // {secret}
    /^your[_-]?/i,               // your_api_key, your-password
    /^xxx+$/i,                   // xxxx
    /^placeholder/i,            // placeholder
    /^example/i,                // example
    /^test/i,                   // test
    /^dummy/i,                  // dummy
    /^fake/i,                   // fake
    /^sample/i,                 // sample
    /^todo/i,                   // TODO
    /^changeme/i,               // changeme
    /^replace/i,                // replace_this
    /^insert/i,                 // insert_here
    /^process\.env\./,          // process.env reference in string
    /^\$\{/,                    // ${VAR} template
    '',                         // empty string
  ];
  
  return !value || value.length < 4 || placeholderPatterns.some(p => 
    typeof p === 'string' ? value === p : p.test(value)
  );
}