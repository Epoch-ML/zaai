/**
 * Stage: setup-environment
 * 
 * Initialize test fixtures and environment.
 * This stage runs first to ensure the testing environment is properly configured.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function setupEnvironment() {
  console.log('=== Setting Up Test Environment ===\n');
  
  const results = {
    nodeVersion: null,
    packageJson: null,
    directoriesCreated: [],
    dependenciesInstalled: false
  };
  
  // Check Node.js version
  results.nodeVersion = process.version;
  const majorVersion = parseInt(results.nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion < 16) {
    throw new Error(`Node.js version ${results.nodeVersion} is too old. Requires v16+`);
  }
  console.log(`✓ Node.js version: ${results.nodeVersion}`);
  
  // Check for package.json
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found in current directory');
  }
  
  results.packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  console.log(`✓ Package: ${results.packageJson.name}@${results.packageJson.version}`);
  
  // Create required directories
  const requiredDirs = [
    'test/fixtures',
    'test/output',
    'logs'
  ];
  
  for (const dir of requiredDirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      results.directoriesCreated.push(dir);
      console.log(`✓ Created directory: ${dir}`);
    } else {
      console.log(`✓ Directory exists: ${dir}`);
    }
  }
  
  // Check if node_modules exists, install if not
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('\n⚠ node_modules not found. Running npm install...');
    try {
      execSync('npm install', { stdio: 'inherit', cwd: process.cwd() });
      results.dependenciesInstalled = true;
      console.log('✓ Dependencies installed');
    } catch (error) {
      console.warn('⚠ npm install failed, continuing anyway...');
    }
  } else {
    console.log('✓ node_modules exists');
  }
  
  // Verify critical dependencies
  console.log('\nVerifying dependencies...');
  const criticalDeps = ['lodash'];
  
  for (const dep of criticalDeps) {
    try {
      require.resolve(dep);
      console.log(`✓ ${dep} available`);
    } catch (e) {
      console.warn(`⚠ ${dep} not found (optional)`);
    }
  }
  
  console.log('\n=== Environment Setup Complete ===');
  
  return {
    success: true,
    ...results
  };
}

// Export for stage runner
module.exports = setupEnvironment;

// Run if executed directly
if (require.main === module) {
  setupEnvironment()
    .then(result => {
      console.log('\nResult:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('\nSetup failed:', error.message);
      process.exit(1);
    });
}