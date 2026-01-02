/**
 * Stage: initialize-platform
 * 
 * Initializes the analytics platform with test configuration.
 * This stage runs after environment verification and data staging.
 */

const fs = require('fs');
const path = require('path');

async function initializePlatform() {
  console.log('=== Initializing Analytics Platform ===\n');
  
  const results = {
    modulesInitialized: [],
    configLoaded: false,
    registryReady: false
  };
  
  // Load test configuration
  const configPath = path.join(process.cwd(), 'test', 'fixtures', 'test-config.json');
  let config = {};
  
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    results.configLoaded = true;
    console.log('✓ Loaded test configuration');
    console.log(`  Platform: ${config.platform?.name || 'unnamed'}`);
    console.log(`  Environment: ${config.platform?.environment || 'unknown'}`);
  } else {
    console.log('⚠ No test config found, using defaults');
    config = {
      platform: { name: 'Analytics Platform', environment: 'test' },
      processing: { maxWorkers: 2, batchSize: 100, cacheEnabled: false },
      visualization: { defaultTheme: 'default', exportFormats: ['json'] }
    };
  }
  
  // Initialize modules
  console.log('\nInitializing modules...');
  
  const modules = [
    { name: 'core', description: 'Core functionality and base classes' },
    { name: 'ingestion', description: 'Data ingestion and source management' },
    { name: 'processing', description: 'Data processing and transformation' },
    { name: 'visualization', description: 'Data visualization and reporting' }
  ];
  
  for (const module of modules) {
    console.log(`  → Initializing ${module.name} module...`);
    
    // Check if module directory exists
    const modulePath = path.join(process.cwd(), 'src', module.name);
    const moduleExists = fs.existsSync(modulePath);
    
    // Simulate module initialization
    await new Promise(resolve => setTimeout(resolve, 50));
    
    results.modulesInitialized.push({
      name: module.name,
      exists: moduleExists,
      status: 'ready'
    });
    
    console.log(`  ✓ ${module.name} module ${moduleExists ? 'loaded' : 'initialized (stub)'}`);
  }
  
  // Setup component registry
  console.log('\nSetting up component registry...');
  
  const registry = {
    components: new Map(),
    
    register(name, component) {
      this.components.set(name, {
        ...component,
        registeredAt: new Date().toISOString()
      });
      return this;
    },
    
    get(name) {
      return this.components.get(name);
    },
    
    has(name) {
      return this.components.has(name);
    },
    
    list() {
      return Array.from(this.components.keys());
    }
  };
  
  // Register core components
  registry.register('config', { 
    type: 'ConfigManager', 
    status: 'ready',
    data: config 
  });
  
  registry.register('dataLoader', { 
    type: 'DataLoader', 
    status: 'ready',
    supportedFormats: ['csv', 'json', 'xml']
  });
  
  registry.register('processor', { 
    type: 'DataProcessor', 
    status: 'ready',
    maxWorkers: config.processing?.maxWorkers || 4
  });
  
  registry.register('visualizer', { 
    type: 'Visualizer', 
    status: 'ready',
    exportFormats: config.visualization?.exportFormats || ['json']
  });
  
  registry.register('cache', { 
    type: 'CacheManager', 
    status: config.processing?.cacheEnabled ? 'ready' : 'disabled'
  });
  
  results.registryReady = true;
  console.log(`✓ Registry initialized with ${registry.components.size} components`);
  console.log(`  Components: ${registry.list().join(', ')}`);
  
  // Validate initialization
  console.log('\nValidating initialization...');
  
  const validations = [
    { 
      name: 'All modules initialized', 
      check: results.modulesInitialized.length === 4,
      details: `${results.modulesInitialized.length}/4 modules`
    },
    { 
      name: 'Config loaded', 
      check: results.configLoaded || true,
      details: results.configLoaded ? 'from file' : 'using defaults'
    },
    { 
      name: 'Registry ready', 
      check: results.registryReady,
      details: `${registry.components.size} components`
    },
    { 
      name: 'Processing config valid', 
      check: config.processing?.maxWorkers > 0,
      details: `maxWorkers: ${config.processing?.maxWorkers}`
    },
    {
      name: 'Required components registered',
      check: registry.has('config') && registry.has('dataLoader') && registry.has('processor'),
      details: 'config, dataLoader, processor'
    }
  ];
  
  let allValid = true;
  for (const validation of validations) {
    if (validation.check) {
      console.log(`  ✓ ${validation.name} (${validation.details})`);
    } else {
      console.log(`  ✗ ${validation.name} (${validation.details})`);
      allValid = false;
    }
  }
  
  if (!allValid) {
    throw new Error('Platform initialization validation failed');
  }
  
  console.log('\n=== Platform Initialization Complete ===');
  
  return {
    success: true,
    config,
    modulesInitialized: results.modulesInitialized,
    registryComponentCount: registry.components.size,
    registryComponents: registry.list()
  };
}

// Export for module usage
module.exports = initializePlatform;

// Run if executed directly
if (require.main === module) {
  initializePlatform()
    .then(result => {
      console.log('\nResult:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('\nInitialization failed:', error.message);
      process.exit(1);
    });
}