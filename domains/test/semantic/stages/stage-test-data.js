/**
 * Stage: stage-test-data
 * 
 * Create test data fixtures for specs.
 * Sets up sample CSV, JSON, and configuration files for testing.
 */

const fs = require('fs');
const path = require('path');

async function stageTestData() {
  console.log('=== Staging Test Data ===\n');
  
  const fixturesDir = path.join(process.cwd(), 'test', 'fixtures');
  const results = {
    fixturesDir,
    filesCreated: []
  };
  
  // Ensure fixtures directory exists
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
    console.log(`✓ Created fixtures directory: ${fixturesDir}`);
  }
  
  // 1. Create sample CSV data
  const csvData = `id,name,value,category,timestamp
1,Alpha,100,A,2024-01-01T00:00:00Z
2,Beta,250,B,2024-01-02T00:00:00Z
3,Gamma,175,A,2024-01-03T00:00:00Z
4,Delta,300,C,2024-01-04T00:00:00Z
5,Epsilon,125,B,2024-01-05T00:00:00Z`;
  
  const csvPath = path.join(fixturesDir, 'sample-data.csv');
  fs.writeFileSync(csvPath, csvData);
  results.filesCreated.push('sample-data.csv');
  console.log('✓ Created sample-data.csv');
  
  // 2. Create larger CSV for performance testing
  const largeCsvLines = ['id,name,value,category,timestamp'];
  const categories = ['A', 'B', 'C', 'D', 'E'];
  const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa'];
  
  for (let i = 1; i <= 1000; i++) {
    const name = names[i % names.length];
    const value = Math.floor(Math.random() * 1000);
    const category = categories[i % categories.length];
    const date = new Date(2024, 0, 1 + (i % 365));
    largeCsvLines.push(`${i},${name}-${i},${value},${category},${date.toISOString()}`);
  }
  
  const largeCsvPath = path.join(fixturesDir, 'large-data.csv');
  fs.writeFileSync(largeCsvPath, largeCsvLines.join('\n'));
  results.filesCreated.push('large-data.csv');
  console.log('✓ Created large-data.csv (1000 records)');
  
  // 3. Create sample JSON data
  const jsonData = {
    metadata: {
      source: 'test-fixture',
      version: '1.0.0',
      createdAt: new Date().toISOString()
    },
    records: [
      { id: 1, name: 'Record One', metrics: { views: 100, clicks: 25, conversions: 5 } },
      { id: 2, name: 'Record Two', metrics: { views: 200, clicks: 50, conversions: 10 } },
      { id: 3, name: 'Record Three', metrics: { views: 150, clicks: 30, conversions: 8 } },
      { id: 4, name: 'Record Four', metrics: { views: 300, clicks: 75, conversions: 15 } },
      { id: 5, name: 'Record Five', metrics: { views: 250, clicks: 60, conversions: 12 } }
    ],
    aggregations: {
      totalViews: 1000,
      totalClicks: 240,
      averageConversionRate: 0.05
    }
  };
  
  const jsonPath = path.join(fixturesDir, 'sample-data.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
  results.filesCreated.push('sample-data.json');
  console.log('✓ Created sample-data.json');
  
  // 4. Create test configuration
  const configData = {
    platform: {
      name: 'Analytics Platform JS',
      environment: 'test',
      debug: true
    },
    processing: {
      maxWorkers: 2,
      batchSize: 100,
      cacheEnabled: false,
      timeout: 5000
    },
    visualization: {
      defaultTheme: 'test',
      exportFormats: ['json'],
      maxDataPoints: 1000
    },
    logging: {
      level: 'debug',
      format: 'json',
      destination: 'console'
    }
  };
  
  const configPath = path.join(fixturesDir, 'test-config.json');
  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
  results.filesCreated.push('test-config.json');
  console.log('✓ Created test-config.json');
  
  // 5. Create malformed CSV for error handling tests
  const malformedCsv = `id,name,value
1,Valid,100
2,Missing value
3,"Unclosed quote,200
4,Extra,field,here,500
5,Normal,300`;
  
  const malformedPath = path.join(fixturesDir, 'malformed-data.csv');
  fs.writeFileSync(malformedPath, malformedCsv);
  results.filesCreated.push('malformed-data.csv');
  console.log('✓ Created malformed-data.csv (for error testing)');
  
  // 6. Create empty file for edge case testing
  const emptyPath = path.join(fixturesDir, 'empty-data.csv');
  fs.writeFileSync(emptyPath, '');
  results.filesCreated.push('empty-data.csv');
  console.log('✓ Created empty-data.csv (for edge case testing)');
  
  // 7. Create headers-only CSV
  const headersOnlyPath = path.join(fixturesDir, 'headers-only.csv');
  fs.writeFileSync(headersOnlyPath, 'id,name,value,category\n');
  results.filesCreated.push('headers-only.csv');
  console.log('✓ Created headers-only.csv');
  
  console.log('\n=== Test Data Staging Complete ===');
  console.log(`Total files created: ${results.filesCreated.length}`);
  
  return {
    success: true,
    ...results
  };
}

// Export for stage runner
module.exports = stageTestData;

// Run if executed directly
if (require.main === module) {
  stageTestData()
    .then(result => {
      console.log('\nResult:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('\nStaging failed:', error.message);
      process.exit(1);
    });
}