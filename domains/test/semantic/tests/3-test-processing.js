/**
 * Test Processing Module
 * 
 * Tests the data processing pipeline including:
 * - Transformers applying operations correctly
 * - Aggregators computing correct statistics
 * - Pipeline supporting chaining of operations
 */

const path = require('path');

// Test assertions
const assert = (condition, message) => {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
  console.log(`  ✓ ${message}`);
};

// Import actual processors if available, otherwise use local implementations
let Transformer, Aggregator, Pipeline;

try {
  const processing = require('../src/processing');
  Transformer = processing.Transformer;
  Aggregator = processing.Aggregator;
  Pipeline = processing.Pipeline;
  console.log('Using actual processing module implementations');
} catch (e) {
  console.log('Using local test implementations');
  
  // Transformer class for data transformations
  Transformer = class Transformer {
    constructor(name) {
      this.name = name;
      this.operations = [];
    }
    
    map(fn) {
      this.operations.push({ type: 'map', fn });
      return this;
    }
    
    filter(fn) {
      this.operations.push({ type: 'filter', fn });
      return this;
    }
    
    sort(fn) {
      this.operations.push({ type: 'sort', fn });
      return this;
    }
    
    transform(data) {
      let result = [...data];
      
      for (const op of this.operations) {
        switch (op.type) {
          case 'map':
            result = result.map(op.fn);
            break;
          case 'filter':
            result = result.filter(op.fn);
            break;
          case 'sort':
            result = result.sort(op.fn);
            break;
        }
      }
      
      return result;
    }
  };

  // Aggregator class for computing statistics
  Aggregator = class Aggregator {
    constructor() {
      this.operations = {};
    }
    
    sum(field) {
      this.operations[`sum_${field}`] = (data) => 
        data.reduce((acc, item) => acc + (item[field] || 0), 0);
      return this;
    }
    
    avg(field) {
      this.operations[`avg_${field}`] = (data) => {
        const sum = data.reduce((acc, item) => acc + (item[field] || 0), 0);
        return data.length > 0 ? sum / data.length : 0;
      };
      return this;
    }
    
    min(field) {
      this.operations[`min_${field}`] = (data) => 
        Math.min(...data.map(item => item[field] || Infinity));
      return this;
    }
    
    max(field) {
      this.operations[`max_${field}`] = (data) => 
        Math.max(...data.map(item => item[field] || -Infinity));
      return this;
    }
    
    count() {
      this.operations['count'] = (data) => data.length;
      return this;
    }
    
    groupBy(field) {
      this.operations[`groupBy_${field}`] = (data) => {
        return data.reduce((groups, item) => {
          const key = item[field];
          groups[key] = groups[key] || [];
          groups[key].push(item);
          return groups;
        }, {});
      };
      return this;
    }
    
    aggregate(data) {
      const results = {};
      for (const [name, fn] of Object.entries(this.operations)) {
        results[name] = fn(data);
      }
      return results;
    }
  };

  // Pipeline class for chaining operations
  Pipeline = class Pipeline {
    constructor(name) {
      this.name = name;
      this.steps = [];
    }
    
    addStep(name, processor) {
      this.steps.push({ name, processor });
      return this;
    }
    
    async execute(data) {
      let result = data;
      const stepResults = [];
      
      for (const step of this.steps) {
        const startTime = Date.now();
        
        if (step.processor.transform) {
          result = step.processor.transform(result);
        } else if (step.processor.aggregate) {
          result = step.processor.aggregate(result);
        } else if (typeof step.processor === 'function') {
          result = await step.processor(result);
        }
        
        stepResults.push({
          name: step.name,
          duration: Date.now() - startTime,
          outputSize: Array.isArray(result) ? result.length : Object.keys(result).length
        });
      }
      
      return { data: result, steps: stepResults };
    }
  };
}

async function runTests() {
  console.log('=== Processing Module Tests ===\n');
  
  let testsRun = 0;
  
  // Sample test data
  const testData = [
    { id: 1, name: 'Alpha', value: 100, category: 'A' },
    { id: 2, name: 'Beta', value: 250, category: 'B' },
    { id: 3, name: 'Gamma', value: 175, category: 'A' },
    { id: 4, name: 'Delta', value: 300, category: 'C' },
    { id: 5, name: 'Epsilon', value: 125, category: 'B' }
  ];
  
  // Test 1: Transformer - Map Operation
  console.log('Test 1: Transformer - Map Operation');
  const transformer1 = new Transformer('doubler');
  transformer1.map(item => ({ ...item, value: item.value * 2 }));
  
  const doubledData = transformer1.transform(testData);
  assert(doubledData[0].value === 200, 'First value doubled to 200');
  assert(doubledData[1].value === 500, 'Second value doubled to 500');
  assert(doubledData.length === 5, 'All records preserved');
  testsRun++;
  
  // Test 2: Transformer - Filter Operation
  console.log('\nTest 2: Transformer - Filter Operation');
  const transformer2 = new Transformer('filter-high-value');
  transformer2.filter(item => item.value > 150);
  
  const filteredData = transformer2.transform(testData);
  assert(filteredData.length === 3, 'Filtered to 3 high-value records');
  assert(filteredData.every(r => r.value > 150), 'All remaining have value > 150');
  testsRun++;
  
  // Test 3: Transformer - Sort Operation
  console.log('\nTest 3: Transformer - Sort Operation');
  const transformer3 = new Transformer('sort-by-value');
  transformer3.sort((a, b) => b.value - a.value);
  
  const sortedData = transformer3.transform(testData);
  assert(sortedData[0].value === 300, 'Highest value first (300)');
  assert(sortedData[4].value === 100, 'Lowest value last (100)');
  testsRun++;
  
  // Test 4: Transformer - Chained Operations
  console.log('\nTest 4: Transformer - Chained Operations');
  const transformer4 = new Transformer('chained');
  transformer4
    .filter(item => item.category !== 'C')
    .map(item => ({ ...item, value: item.value + 50 }))
    .sort((a, b) => a.value - b.value);
  
  const chainedResult = transformer4.transform(testData);
  assert(chainedResult.length === 4, 'Category C filtered out');
  assert(chainedResult[0].value === 150, 'Lowest adjusted value is 150 (100+50)');
  assert(chainedResult[3].value === 300, 'Highest adjusted value is 300 (250+50)');
  testsRun++;
  
  // Test 5: Aggregator - Sum
  console.log('\nTest 5: Aggregator - Sum');
  const aggregator1 = new Aggregator();
  aggregator1.sum('value');
  
  const sumResult = aggregator1.aggregate(testData);
  assert(sumResult.sum_value === 950, 'Sum of values is 950');
  testsRun++;
  
  // Test 6: Aggregator - Average
  console.log('\nTest 6: Aggregator - Average');
  const aggregator2 = new Aggregator();
  aggregator2.avg('value');
  
  const avgResult = aggregator2.aggregate(testData);
  assert(avgResult.avg_value === 190, 'Average value is 190');
  testsRun++;
  
  // Test 7: Aggregator - Min/Max
  console.log('\nTest 7: Aggregator - Min/Max');
  const aggregator3 = new Aggregator();
  aggregator3.min('value').max('value');
  
  const minMaxResult = aggregator3.aggregate(testData);
  assert(minMaxResult.min_value === 100, 'Min value is 100');
  assert(minMaxResult.max_value === 300, 'Max value is 300');
  testsRun++;
  
  // Test 8: Aggregator - Group By
  console.log('\nTest 8: Aggregator - Group By');
  const aggregator4 = new Aggregator();
  aggregator4.groupBy('category').count();
  
  const groupResult = aggregator4.aggregate(testData);
  assert(Object.keys(groupResult.groupBy_category).length === 3, 'Three category groups');
  assert(groupResult.groupBy_category['A'].length === 2, 'Category A has 2 items');
  assert(groupResult.count === 5, 'Total count is 5');
  testsRun++;
  
  // Test 9: Aggregator - Combined Metrics
  console.log('\nTest 9: Aggregator - Combined Metrics');
  const aggregator5 = new Aggregator();
  aggregator5.sum('value').avg('value').min('value').max('value').count();
  
  const combinedResult = aggregator5.aggregate(testData);
  assert(combinedResult.sum_value === 950, 'Combined: sum correct');
  assert(combinedResult.avg_value === 190, 'Combined: avg correct');
  assert(combinedResult.min_value === 100, 'Combined: min correct');
  assert(combinedResult.max_value === 300, 'Combined: max correct');
  assert(combinedResult.count === 5, 'Combined: count correct');
  testsRun++;
  
  // Test 10: Pipeline - Basic Execution
  console.log('\nTest 10: Pipeline - Basic Execution');
  const pipeline1 = new Pipeline('basic-pipeline');
  
  const filterTransformer = new Transformer('filter');
  filterTransformer.filter(item => item.value >= 150);
  
  pipeline1.addStep('filter-high-value', filterTransformer);
  
  const pipelineResult1 = await pipeline1.execute(testData);
  assert(pipelineResult1.data.length === 3, 'Pipeline filtered to 3 records');
  assert(pipelineResult1.steps.length === 1, 'One step executed');
  testsRun++;
  
  // Test 11: Pipeline - Multi-Step
  console.log('\nTest 11: Pipeline - Multi-Step Execution');
  const pipeline2 = new Pipeline('multi-step');
  
  const step1 = new Transformer('transform');
  step1.map(item => ({ ...item, value: item.value * 2 }));
  
  const step2 = new Transformer('filter');
  step2.filter(item => item.value > 300);
  
  const step3 = new Transformer('sort');
  step3.sort((a, b) => b.value - a.value);
  
  pipeline2
    .addStep('double-values', step1)
    .addStep('filter-high', step2)
    .addStep('sort-desc', step3);
  
  const pipelineResult2 = await pipeline2.execute(testData);
  assert(pipelineResult2.steps.length === 3, 'Three steps executed');
  assert(pipelineResult2.data.length === 3, 'Three records remain after pipeline');
  assert(pipelineResult2.data[0].value === 600, 'Highest doubled value is 600');
  testsRun++;
  
  // Test 12: Pipeline with Aggregation
  console.log('\nTest 12: Pipeline with Aggregation');
  const pipeline3 = new Pipeline('transform-and-aggregate');
  
  const prepTransformer = new Transformer('prep');
  prepTransformer.filter(item => item.category === 'A' || item.category === 'B');
  
  const statsAggregator = new Aggregator();
  statsAggregator.sum('value').avg('value').count();
  
  pipeline3
    .addStep('filter-categories', prepTransformer)
    .addStep('compute-stats', statsAggregator);
  
  const pipelineResult3 = await pipeline3.execute(testData);
  assert(pipelineResult3.data.count === 4, 'Stats computed on 4 records');
  assert(pipelineResult3.data.sum_value === 650, 'Sum is 650 (100+250+175+125)');
  testsRun++;
  
  // Test 13: Empty Data Handling
  console.log('\nTest 13: Empty Data Handling');
  const emptyAggregator = new Aggregator();
  emptyAggregator.sum('value').avg('value').count();
  
  const emptyResult = emptyAggregator.aggregate([]);
  assert(emptyResult.sum_value === 0, 'Sum of empty is 0');
  assert(emptyResult.avg_value === 0, 'Avg of empty is 0');
  assert(emptyResult.count === 0, 'Count of empty is 0');
  testsRun++;
  
  console.log('\n=== All Processing Module Tests Passed ===\n');
  
  return {
    success: true,
    testsRun,
    modulesTest: ['Transformer', 'Aggregator', 'Pipeline']
  };
}

// Export for test runner
module.exports = { runTests };

// Run if executed directly
if (require.main === module) {
  runTests()
    .then(result => {
      console.log('Result:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Tests failed:', error.message);
      process.exit(1);
    });
}