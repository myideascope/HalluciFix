#!/usr/bin/env node

/**
 * Test script for flaky test management system
 */

const FlakyTestManager = require('./flaky-test-manager.cjs');
const TestHistoryTracker = require('./test-history-tracker.cjs');

async function testFlakyManagement() {
  console.log('🧪 Testing Flaky Test Management System...\n');
  
  // Initialize managers
  const manager = new FlakyTestManager({
    historyFile: '.github/test-history-test.json',
    quarantineFile: '.github/quarantined-tests-test.json'
  });
  
  // Test 1: Analyze a flaky test failure
  console.log('1. Testing failure analysis...');
  const testResult = {
    name: 'should handle network timeout',
    suite: 'integration',
    file: 'src/test/integration/api.test.ts',
    success: false,
    error: 'ETIMEDOUT: network timeout after 5000ms'
  };
  
  const analysis = manager.analyzeFailure(testResult);
  console.log('   Analysis result:', JSON.stringify(analysis, null, 2));
  
  // Test 2: Record multiple executions to trigger flaky detection
  console.log('\n2. Testing flaky test detection...');
  
  const tracker = manager.historyTracker;
  
  // Simulate multiple test executions with mixed results
  for (let i = 0; i < 10; i++) {
    const success = Math.random() > 0.3; // 70% success rate (flaky)
    const executionData = {
      sha: `test-sha-${i}`,
      branch: 'test-branch',
      trigger: 'test',
      riskLevel: 'medium',
      testSuites: ['integration'],
      duration: 120 + Math.random() * 60,
      success,
      testResults: [{
        name: 'flaky network test',
        suite: 'integration',
        file: 'src/test/integration/network.test.ts',
        success,
        duration: 5000 + Math.random() * 2000,
        error: success ? null : 'Network timeout or connection reset'
      }]
    };
    
    tracker.recordExecution(executionData);
  }
  
  // Check flaky test detection
  const flakyReport = tracker.getFlakyTestsReport();
  console.log('   Flaky tests detected:', flakyReport.total);
  console.log('   Flaky test details:', JSON.stringify(flakyReport.tests, null, 2));
  
  // Test 3: Test quarantine functionality
  console.log('\n3. Testing quarantine system...');
  
  if (flakyReport.tests.length > 0) {
    const flakyTest = flakyReport.tests[0];
    await manager.quarantineTest(testResult, flakyTest);
    
    const quarantineReport = manager.getQuarantineReport();
    console.log('   Quarantined tests:', quarantineReport.total);
    console.log('   Quarantine details:', JSON.stringify(quarantineReport.tests, null, 2));
  }
  
  // Test 4: Generate recommendations
  console.log('\n4. Testing recommendations...');
  
  const fullReport = manager.generateAnalysisReport();
  console.log('   Recommendations:', JSON.stringify(fullReport.recommendations, null, 2));
  
  // Test 5: Test retry script generation
  console.log('\n5. Testing retry script generation...');
  
  const retryScript = manager.generateRetryScript('npm test', 'example-test');
  console.log('   Generated retry script length:', retryScript.length, 'characters');
  
  console.log('\n✅ All tests completed successfully!');
  
  // Cleanup test files
  const fs = require('fs');
  try {
    fs.unlinkSync('.github/test-history-test.json');
    fs.unlinkSync('.github/quarantined-tests-test.json');
    console.log('🧹 Cleaned up test files');
  } catch (error) {
    // Files might not exist, that's okay
  }
}

// Run tests
if (require.main === module) {
  testFlakyManagement().catch(error => {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  });
}

module.exports = testFlakyManagement;