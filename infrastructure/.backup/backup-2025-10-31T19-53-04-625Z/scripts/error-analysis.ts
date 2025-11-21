#!/usr/bin/env node

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { logger } from './logging';
interface CompilationError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  category: ErrorCategory;
  severity: 'high' | 'medium' | 'low';
  fullPath: string;
}

enum ErrorCategory {
  IMPORT_RESOLUTION = 'import_resolution',
  CDK_API_COMPATIBILITY = 'cdk_api_compatibility', 
  PROPERTY_ASSIGNMENT = 'property_assignment',
  TYPE_DEFINITION = 'type_definition',
  AWS_SDK_INTEGRATION = 'aws_sdk_integration',
  CONFIGURATION_PROPERTY = 'configuration_property'
}

interface ErrorReport {
  timestamp: string;
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<string, number>;
  errorsByFile: Record<string, number>;
  errors: CompilationError[];
}

class ErrorAnalyzer {
  private readonly infrastructureDir: string;
  private readonly backupDir: string;
  private readonly reportDir: string;

  constructor() {
    this.infrastructureDir = process.cwd();
    this.backupDir = path.join(this.infrastructureDir, '.backup');
    this.reportDir = path.join(this.infrastructureDir, '.error-reports');
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  /**
   * Create backup of all TypeScript files before modifications
   */
  public createBackup(): void {
    logger.debug("Creating backup of TypeScript files...");
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `backup-${timestamp}`);
    
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }

    // Backup all .ts files in lib, scripts, and lambda-functions directories
    const dirsToBackup = ['lib', 'scripts', 'lambda-functions'];
    
    dirsToBackup.forEach(dir => {
      const sourcePath = path.join(this.infrastructureDir, dir);
      const targetPath = path.join(backupPath, dir);
      
      if (fs.existsSync(sourcePath)) {
        this.copyDirectory(sourcePath, targetPath, '.ts');
      }
    });

    console.log(`Backup created at: ${backupPath}`);
    
    // Save backup info
    const backupInfo = {
      timestamp,
      path: backupPath,
      files: this.getBackupFileList(backupPath)
    };
    
    fs.writeFileSync(
      path.join(this.reportDir, `backup-info-${timestamp}.json`),
      JSON.stringify(backupInfo, null, 2)
    );
  }

  private copyDirectory(source: string, target: string, extension: string): void {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    const items = fs.readdirSync(source);
    
    items.forEach(item => {
      const sourcePath = path.join(source, item);
      const targetPath = path.join(target, item);
      
      if (fs.statSync(sourcePath).isDirectory()) {
        this.copyDirectory(sourcePath, targetPath, extension);
      } else if (item.endsWith(extension)) {
        fs.copyFileSync(sourcePath, targetPath);
      }
    });
  }

  private getBackupFileList(backupPath: string): string[] {
    const files: string[] = [];
    
    const scanDirectory = (dir: string): void => {
      const items = fs.readdirSync(dir);
      
      items.forEach(item => {
        const itemPath = path.join(dir, item);
        
        if (fs.statSync(itemPath).isDirectory()) {
          scanDirectory(itemPath);
        } else if (item.endsWith('.ts')) {
          files.push(path.relative(backupPath, itemPath));
        }
      });
    };
    
    scanDirectory(backupPath);
    return files;
  }

  /**
   * Run TypeScript compiler and capture errors
   */
  public runTypeScriptCompiler(): string {
    logger.debug("Running TypeScript compiler...");
    
    try {
      execSync('npx tsc --noEmit --pretty false', { 
        cwd: this.infrastructureDir,
        stdio: 'pipe'
      });
      return ''; // No errors
    } catch (error: any) {
      return error.stdout?.toString() || error.stderr?.toString() || '';
    }
  }

  /**
   * Parse TypeScript compiler output and categorize errors
   */
  public parseCompilerOutput(output: string): CompilationError[] {
    const errors: CompilationError[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const error = this.parseErrorLine(line.trim());
      if (error) {
        errors.push(error);
      }
    }
    
    return errors;
  }

  private parseErrorLine(line: string): CompilationError | null {
    // TypeScript error format: file(line,column): error TSxxxx: message
    const errorRegex = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/;
    const match = line.match(errorRegex);
    
    if (!match) {
      return null;
    }
    
    const [, file, lineStr, columnStr, code, message] = match;
    const fullPath = path.resolve(this.infrastructureDir, file);
    
    return {
      file: path.relative(this.infrastructureDir, file),
      line: parseInt(lineStr, 10),
      column: parseInt(columnStr, 10),
      code,
      message,
      category: this.categorizeError(code, message),
      severity: this.determineSeverity(code, message),
      fullPath
    };
  }

  private categorizeError(code: string, message: string): ErrorCategory {
    // Import resolution errors
    if (code === 'TS2307' || message.includes('Cannot find module')) {
      return ErrorCategory.IMPORT_RESOLUTION;
    }
    
    // Property assignment errors (readonly violations)
    if (code === 'TS2540' || message.includes('Cannot assign to') || message.includes('readonly')) {
      return ErrorCategory.PROPERTY_ASSIGNMENT;
    }
    
    // API compatibility errors (missing properties/methods)
    if (code === 'TS2339' || message.includes('Property') && message.includes('does not exist')) {
      return ErrorCategory.CDK_API_COMPATIBILITY;
    }
    
    // Type definition errors
    if (code === 'TS7006' || code === 'TS2345' || message.includes('implicitly has an \'any\' type')) {
      return ErrorCategory.TYPE_DEFINITION;
    }
    
    // AWS SDK integration errors
    if (message.includes('AWS') || message.includes('CreateDB') || message.includes('Command')) {
      return ErrorCategory.AWS_SDK_INTEGRATION;
    }
    
    // Configuration property errors
    if (message.includes('keyRotation') || message.includes('publicWriteAccess') || 
        message.includes('messageRetentionPeriod') || message.includes('managedRuleGroupStatement')) {
      return ErrorCategory.CONFIGURATION_PROPERTY;
    }
    
    // Default to API compatibility for unknown property errors
    return ErrorCategory.CDK_API_COMPATIBILITY;
  }

  private determineSeverity(code: string, message: string): 'high' | 'medium' | 'low' {
    // High severity: Blocking compilation
    const highSeverityCodes = ['TS2307', 'TS2345', 'TS2304'];
    if (highSeverityCodes.includes(code)) {
      return 'high';
    }
    
    // Medium severity: API compatibility issues
    const mediumSeverityCodes = ['TS2339', 'TS2540'];
    if (mediumSeverityCodes.includes(code)) {
      return 'medium';
    }
    
    // Low severity: Type annotations and code quality
    return 'low';
  }

  /**
   * Generate detailed error report
   */
  public generateErrorReport(errors: CompilationError[]): ErrorReport {
    const timestamp = new Date().toISOString();
    
    const errorsByCategory = Object.values(ErrorCategory).reduce((acc, category) => {
      acc[category] = errors.filter(e => e.category === category).length;
      return acc;
    }, {} as Record<ErrorCategory, number>);
    
    const errorsBySeverity = ['high', 'medium', 'low'].reduce((acc, severity) => {
      acc[severity] = errors.filter(e => e.severity === severity).length;
      return acc;
    }, {} as Record<string, number>);
    
    const errorsByFile = errors.reduce((acc, error) => {
      acc[error.file] = (acc[error.file] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      timestamp,
      totalErrors: errors.length,
      errorsByCategory,
      errorsBySeverity,
      errorsByFile,
      errors
    };
  }

  /**
   * Save error report to file
   */
  public saveErrorReport(report: ErrorReport): string {
    const timestamp = report.timestamp.replace(/[:.]/g, '-');
    const reportPath = path.join(this.reportDir, `error-report-${timestamp}.json`);
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    // Also create a human-readable summary
    const summaryPath = path.join(this.reportDir, `error-summary-${timestamp}.md`);
    this.createErrorSummary(report, summaryPath);
    
    return reportPath;
  }

  private createErrorSummary(report: ErrorReport, summaryPath: string): void {
    const summary = `# TypeScript Error Analysis Report

Generated: ${report.timestamp}
Total Errors: ${report.totalErrors}

## Error Summary by Category

${Object.entries(report.errorsByCategory)
  .map(([category, count]) => `- **${category.replace(/_/g, ' ').toUpperCase()}**: ${count} errors`)
  .join('\n')}

## Error Summary by Severity

${Object.entries(report.errorsBySeverity)
  .map(([severity, count]) => `- **${severity.toUpperCase()}**: ${count} errors`)
  .join('\n')}

## Errors by File

${Object.entries(report.errorsByFile)
  .sort(([,a], [,b]) => b - a)
  .map(([file, count]) => `- **${file}**: ${count} errors`)
  .join('\n')}

## Detailed Error List

${report.errors.map(error => 
  `### ${error.file}:${error.line}:${error.column}
- **Code**: ${error.code}
- **Category**: ${error.category}
- **Severity**: ${error.severity}
- **Message**: ${error.message}
`).join('\n')}
`;

    fs.writeFileSync(summaryPath, summary);
  }

  /**
   * Main analysis function
   */
  public async analyze(): Promise<void> {
    logger.info("Starting TypeScript error analysis...");
    
    // Create backup
    this.createBackup();
    
    // Run compiler and get errors
    const compilerOutput = this.runTypeScriptCompiler();
    
    if (!compilerOutput.trim()) {
      logger.debug("No TypeScript errors found!");
      return;
    }
    
    // Parse and categorize errors
    const errors = this.parseCompilerOutput(compilerOutput);
    
    // Generate report
    const report = this.generateErrorReport(errors);
    
    // Save report
    const reportPath = this.saveErrorReport(report);
    
    console.log(`\nAnalysis complete!`);
    console.log(`Total errors found: ${report.totalErrors}`);
    console.log(`Report saved to: ${reportPath}`);
    console.log(`\nError breakdown:`);
    
    Object.entries(report.errorsByCategory).forEach(([category, count]) => {
      if (count > 0) {
        console.log(`  ${category.replace(/_/g, ' ')}: ${count}`);
      }
    });
  }
}

// Run analysis if called directly
if (require.main === module) {
  const analyzer = new ErrorAnalyzer();
  analyzer.analyze().catch(console.error);
}

export { ErrorAnalyzer, CompilationError, ErrorCategory, ErrorReport };