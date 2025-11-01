#!/usr/bin/env node

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  file: string;
  status: 'success' | 'error';
  errors: string[];
  timestamp: string;
}

interface ValidationReport {
  totalFiles: number;
  successCount: number;
  errorCount: number;
  results: ValidationResult[];
  generatedAt: string;
}

// List of files that were fixed according to the tasks
const fixedFiles = [
  'lib/alerting-notification-stack.ts',
  'lib/auto-scaling-stack.ts',
  'lib/cache-monitoring-stack.ts',
  'lib/cache-monitoring-alarms-stack.ts',
  'lib/compliance-monitoring-stack.ts',
  'lib/comprehensive-monitoring-stack.ts',
  'lib/cost-monitoring-stack.ts',
  'lib/database-performance-stack.ts',
  'lib/encryption-key-management-stack.ts',
  'lib/lambda-monitoring-stack.ts',
  'lib/performance-testing-stack.ts',
  'lib/security-audit-stack.ts',
  'lib/sqs-batch-stack.ts',
  'lib/step-functions-stack.ts',
  'lib/waf-security-stack.ts',
  'scripts/migrate-database.ts',
  'scripts/setup-rds-proxy.ts',
  'lambda-functions/cache-monitoring/index.ts',
  'lambda-functions/common/logger.ts',
  'lambda-functions/file-processor/index.ts',
  '../src/lib/logging/structuredLogger.ts'
];

function validateFile(filePath: string): ValidationResult {
  const result: ValidationResult = {
    file: filePath,
    status: 'success',
    errors: [],
    timestamp: new Date().toISOString()
  };

  try {
    // Check if file exists
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      result.status = 'error';
      result.errors.push(`File does not exist: ${fullPath}`);
      return result;
    }

    // Run TypeScript compilation on individual file
    const command = `npx tsc --noEmit --skipLibCheck "${filePath}"`;
    execSync(command, { 
      cwd: process.cwd(),
      stdio: 'pipe',
      encoding: 'utf8'
    });

    console.log(`✅ ${filePath} - No compilation errors`);
  } catch (error: any) {
    result.status = 'error';
    const errorOutput = error.stdout || error.stderr || error.message;
    result.errors = errorOutput.split('\n').filter((line: string) => line.trim().length > 0);
    console.log(`❌ ${filePath} - Compilation errors found`);
  }

  return result;
}

function generateReport(results: ValidationResult[]): ValidationReport {
  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  return {
    totalFiles: results.length,
    successCount,
    errorCount,
    results,
    generatedAt: new Date().toISOString()
  };
}

function main() {
  console.log('🔍 Starting incremental TypeScript compilation validation...\n');

  const results: ValidationResult[] = [];

  for (const file of fixedFiles) {
    console.log(`Validating: ${file}`);
    const result = validateFile(file);
    results.push(result);
  }

  const report = generateReport(results);

  // Save report to file
  const reportPath = 'scripts/incremental-validation-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log('\n📊 Validation Summary:');
  console.log(`Total files validated: ${report.totalFiles}`);
  console.log(`✅ Successful: ${report.successCount}`);
  console.log(`❌ With errors: ${report.errorCount}`);
  console.log(`📄 Report saved to: ${reportPath}`);

  if (report.errorCount > 0) {
    console.log('\n🚨 Files with errors:');
    report.results
      .filter(r => r.status === 'error')
      .forEach(r => {
        console.log(`  - ${r.file}`);
        r.errors.slice(0, 3).forEach(error => console.log(`    ${error}`));
        if (r.errors.length > 3) {
          console.log(`    ... and ${r.errors.length - 3} more errors`);
        }
      });
  }

  process.exit(report.errorCount > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}