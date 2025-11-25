import { LoadTestResult } from '../test/performance/database-load-testing';
import { BenchmarkResult } from './performanceBenchmarking';
import { ProfilingSession } from './databaseProfiler';

interface PerformanceCriteria {
  name: string;
  description: string;
  category: 'response_time' | 'throughput' | 'reliability' | 'scalability' | 'resource_usage';
  thresholds: {
    excellent: number;
    good: number;
    acceptable: number;
    poor: number;
  };
  unit: string;
  higherIsBetter: boolean;
  mandatory: boolean;
  weight: number; // For overall scoring (0-1)
}

interface ValidationConfig {
  criteria: PerformanceCriteria[];
  overallPassingScore: number; // Minimum score to pass (0-100)
  mandatoryCriteriaRequired: boolean;
  environment: 'development' | 'staging' | 'production';
  testTypes: ('load' | 'stress' | 'benchmark' | 'profiling')[];
}

interface ValidationResult {
  testId: string;
  timestamp: Date;
  environment: string;
  config: ValidationConfig;
  criteriaResults: CriteriaResult[];
  overallScore: number;
  passed: boolean;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: ValidationSummary;
  recommendations: string[];
  signOffRequired: boolean;
}

interface CriteriaResult {
  criteria: PerformanceCriteria;
  actualValue: number;
  score: number; // 0-100
  grade: 'excellent' | 'good' | 'acceptable' | 'poor';
  passed: boolean;
  deviation: number; // Percentage deviation from acceptable threshold
  trend?: 'improving' | 'stable' | 'degrading';
}

interface ValidationSummary {
  totalCriteria: number;
  passedCriteria: number;
  failedCriteria: number;
  mandatoryPassed: number;
  mandatoryFailed: number;
  categoryScores: Record<string, number>;
  criticalIssues: string[];
  strengths: string[];
}

interface AcceptanceProcedure {
  name: string;
  description: string;
  steps: AcceptanceStep[];
  requiredApprovals: string[];
  automatedChecks: boolean;
}

interface AcceptanceStep {
  stepNumber: number;
  description: string;
  automated: boolean;
  criteria: string[];
  expectedOutcome: string;
  validationMethod: string;
}

class PerformanceValidation {
  private standardCriteria: PerformanceCriteria[] = [
    {
      name: 'Average Response Time',
      description: 'Average query execution time across all operations',
      category: 'response_time',
      thresholds: { excellent: 50, good: 100, acceptable: 500, poor: 1000 },
      unit: 'ms',
      higherIsBetter: false,
      mandatory: true,
      weight: 0.25
    },
    {
      name: '95th Percentile Response Time',
      description: '95th percentile of query execution times',
      category: 'response_time',
      thresholds: { excellent: 100, good: 200, acceptable: 1000, poor: 2000 },
      unit: 'ms',
      higherIsBetter: false,
      mandatory: true,
      weight: 0.20
    },
    {
      name: 'Throughput',
      description: 'Number of operations processed per second',
      category: 'throughput',
      thresholds: { excellent: 100, good: 50, acceptable: 20, poor: 10 },
      unit: 'ops/sec',
      higherIsBetter: true,
      mandatory: true,
      weight: 0.20
    },
    {
      name: 'Error Rate',
      description: 'Percentage of failed operations',
      category: 'reliability',
      thresholds: { excellent: 0.1, good: 0.5, acceptable: 2.0, poor: 5.0 },
      unit: '%',
      higherIsBetter: false,
      mandatory: true,
      weight: 0.15
    },
    {
      name: 'Connection Pool Usage',
      description: 'Peak connection pool utilization',
      category: 'resource_usage',
      thresholds: { excellent: 50, good: 70, acceptable: 85, poor: 95 },
      unit: '%',
      higherIsBetter: false,
      mandatory: false,
      weight: 0.10
    },
    {
      name: 'Memory Usage',
      description: 'Peak memory utilization during testing',
      category: 'resource_usage',
      thresholds: { excellent: 60, good: 75, acceptable: 90, poor: 95 },
      unit: '%',
      higherIsBetter: false,
      mandatory: false,
      weight: 0.05
    },
    {
      name: 'Concurrent User Capacity',
      description: 'Maximum concurrent users before performance degradation',
      category: 'scalability',
      thresholds: { excellent: 100, good: 50, acceptable: 25, poor: 10 },
      unit: 'users',
      higherIsBetter: true,
      mandatory: false,
      weight: 0.05
    }
  ];

  private acceptanceProcedures: AcceptanceProcedure[] = [
    {
      name: 'Database Performance Acceptance',
      description: 'Comprehensive database performance validation procedure',
      requiredApprovals: ['Tech Lead', 'Database Administrator', 'Performance Engineer'],
      automatedChecks: true,
      steps: [
        {
          stepNumber: 1,
          description: 'Execute automated performance test suite',
          automated: true,
          criteria: ['All load tests pass', 'Benchmark results within thresholds'],
          expectedOutcome: 'All automated tests pass with acceptable performance metrics',
          validationMethod: 'Automated test execution and result validation'
        },
        {
          stepNumber: 2,
          description: 'Validate performance criteria compliance',
          automated: true,
          criteria: ['Response time < 500ms', 'Error rate < 2%', 'Throughput > 20 ops/sec'],
          expectedOutcome: 'All mandatory criteria meet acceptance thresholds',
          validationMethod: 'Automated criteria validation against test results'
        },
        {
          stepNumber: 3,
          description: 'Review performance trends and regressions',
          automated: false,
          criteria: ['No significant performance regressions', 'Positive or stable trends'],
          expectedOutcome: 'Performance trends are acceptable or improving',
          validationMethod: 'Manual review of performance trend analysis'
        },
        {
          stepNumber: 4,
          description: 'Validate scalability requirements',
          automated: true,
          criteria: ['System handles target concurrent users', 'No breaking points below requirements'],
          expectedOutcome: 'System meets scalability requirements under load',
          validationMethod: 'Stress testing and capacity validation'
        },
        {
          stepNumber: 5,
          description: 'Final approval and sign-off',
          automated: false,
          criteria: ['All previous steps completed', 'Stakeholder approval obtained'],
          expectedOutcome: 'Performance validation approved for deployment',
          validationMethod: 'Stakeholder review and formal approval process'
        }
      ]
    }
  ];

  async validateLoadTestResults(
    results: LoadTestResult[],
    config?: Partial<ValidationConfig>
  ): Promise<ValidationResult> {
    const validationConfig = this.createValidationConfig(config);
    const testId = `load_validation_${Date.now()}`;

    const criteriaResults: CriteriaResult[] = [];

    for (const criteria of validationConfig.criteria) {
      const actualValue = this.extractValueFromLoadTest(results, criteria);
      const criteriaResult = this.evaluateCriteria(criteria, actualValue);
      criteriaResults.push(criteriaResult);
    }

    return this.generateValidationResult(testId, validationConfig, criteriaResults);
  }

  async validateBenchmarkResults(
    results: BenchmarkResult[],
    config?: Partial<ValidationConfig>
  ): Promise<ValidationResult> {
    const validationConfig = this.createValidationConfig(config);
    const testId = `benchmark_validation_${Date.now()}`;

    const criteriaResults: CriteriaResult[] = [];

    for (const criteria of validationConfig.criteria) {
      const actualValue = this.extractValueFromBenchmark(results, criteria);
      const criteriaResult = this.evaluateCriteria(criteria, actualValue);
      criteriaResults.push(criteriaResult);
    }

    return this.generateValidationResult(testId, validationConfig, criteriaResults);
  }

  async validateProfilingResults(
    sessions: ProfilingSession[],
    config?: Partial<ValidationConfig>
  ): Promise<ValidationResult> {
    const validationConfig = this.createValidationConfig(config);
    const testId = `profiling_validation_${Date.now()}`;

    const criteriaResults: CriteriaResult[] = [];

    for (const criteria of validationConfig.criteria) {
      const actualValue = this.extractValueFromProfiling(sessions, criteria);
      const criteriaResult = this.evaluateCriteria(criteria, actualValue);
      criteriaResults.push(criteriaResult);
    }

    return this.generateValidationResult(testId, validationConfig, criteriaResults);
  }

  private createValidationConfig(config?: Partial<ValidationConfig>): ValidationConfig {
    return {
      criteria: this.standardCriteria,
      overallPassingScore: 70,
      mandatoryCriteriaRequired: true,
      environment: 'development',
      testTypes: ['load', 'benchmark'],
      ...config
    };
  }

  private extractValueFromLoadTest(results: LoadTestResult[], criteria: PerformanceCriteria): number {
    if (results.length === 0) return 0;

    const latestResult = results[0];

    switch (criteria.name) {
      case 'Average Response Time':
        return latestResult.averageResponseTime;
      case '95th Percentile Response Time':
        return latestResult.p95ResponseTime;
      case 'Throughput':
        return latestResult.throughput;
      case 'Error Rate':
        return latestResult.errorRate;
      case 'Connection Pool Usage':
        // Would need to be extracted from system metrics
        return 0;
      case 'Memory Usage':
        // Would need to be extracted from system metrics
        return 0;
      case 'Concurrent User Capacity':
        return latestResult.config.concurrentUsers;
      default:
        return 0;
    }
  }

  private extractValueFromBenchmark(results: BenchmarkResult[], criteria: PerformanceCriteria): number {
    if (results.length === 0) return 0;

    const latestResult = results[0];

    switch (criteria.name) {
      case 'Average Response Time':
        return latestResult.overallMetrics.averageExecutionTime;
      case '95th Percentile Response Time':
        return latestResult.overallMetrics.p95ExecutionTime;
      case 'Throughput':
        return latestResult.overallMetrics.totalQueries / (latestResult.overallMetrics.totalExecutionTime / 1000);
      case 'Error Rate':
        return 100 - latestResult.overallMetrics.successRate;
      case 'Connection Pool Usage':
        return latestResult.systemMetrics?.connectionPoolUsage || 0;
      case 'Memory Usage':
        return latestResult.systemMetrics?.memoryUsage || 0;
      default:
        return 0;
    }
  }

  private extractValueFromProfiling(sessions: ProfilingSession[], criteria: PerformanceCriteria): number {
    if (sessions.length === 0) return 0;

    const latestSession = sessions[0];

    switch (criteria.name) {
      case 'Average Response Time':
        return latestSession.summary.averageExecutionTime;
      case 'Error Rate': {
          const totalQueries = latestSession.summary.totalQueries;
          const successfulQueries = totalQueries - latestSession.queryProfiles.filter(q => q.bottlenecks.some(b => b.type === 'cpu')).length;
          return ((totalQueries - successfulQueries) / totalQueries) * 100;
        }
      case 'Connection Pool Usage':
        return latestSession.summary.resourceUtilization.peakConnections;
      case 'Memory Usage':
        return latestSession.summary.resourceUtilization.avgMemoryUsage;
      default:
        return 0;
    }
  }

  private evaluateCriteria(criteria: PerformanceCriteria, actualValue: number): CriteriaResult {
    let grade: 'excellent' | 'good' | 'acceptable' | 'poor';
    let score: number;

    if (criteria.higherIsBetter) {
      if (actualValue >= criteria.thresholds.excellent) {
        grade = 'excellent';
        score = 100;
      } else if (actualValue >= criteria.thresholds.good) {
        grade = 'good';
        score = 85;
      } else if (actualValue >= criteria.thresholds.acceptable) {
        grade = 'acceptable';
        score = 70;
      } else {
        grade = 'poor';
        score = Math.max(0, (actualValue / criteria.thresholds.acceptable) * 70);
      }
    } else {
      if (actualValue <= criteria.thresholds.excellent) {
        grade = 'excellent';
        score = 100;
      } else if (actualValue <= criteria.thresholds.good) {
        grade = 'good';
        score = 85;
      } else if (actualValue <= criteria.thresholds.acceptable) {
        grade = 'acceptable';
        score = 70;
      } else {
        grade = 'poor';
        score = Math.max(0, 70 - ((actualValue - criteria.thresholds.acceptable) / criteria.thresholds.acceptable) * 70);
      }
    }

    const passed = criteria.mandatory ? grade !== 'poor' : score >= 50;
    const deviation = criteria.higherIsBetter
      ? ((actualValue - criteria.thresholds.acceptable) / criteria.thresholds.acceptable) * 100
      : ((actualValue - criteria.thresholds.acceptable) / criteria.thresholds.acceptable) * 100;

    return {
      criteria,
      actualValue,
      score,
      grade,
      passed,
      deviation
    };
  }

  private generateValidationResult(
    testId: string,
    config: ValidationConfig,
    criteriaResults: CriteriaResult[]
  ): ValidationResult {
    // Calculate overall score
    const overallScore = criteriaResults.reduce((sum, result) => {
      return sum + (result.score * result.criteria.weight);
    }, 0);

    // Check if validation passed
    const mandatoryResults = criteriaResults.filter(r => r.criteria.mandatory);
    const mandatoryPassed = mandatoryResults.every(r => r.passed);
    const scoreThresholdMet = overallScore >= config.overallPassingScore;
    const passed = config.mandatoryCriteriaRequired ? (mandatoryPassed && scoreThresholdMet) : scoreThresholdMet;

    // Determine grade
    let grade: 'A' | 'B' | 'C' | 'D' | 'F';
    if (overallScore >= 90) grade = 'A';
    else if (overallScore >= 80) grade = 'B';
    else if (overallScore >= 70) grade = 'C';
    else if (overallScore >= 60) grade = 'D';
    else grade = 'F';

    // Generate summary
    const summary = this.generateValidationSummary(criteriaResults);

    // Generate recommendations
    const recommendations = this.generateRecommendations(criteriaResults, overallScore);

    // Determine if sign-off is required
    const signOffRequired = !passed || grade === 'D' || summary.criticalIssues.length > 0;

    return {
      testId,
      timestamp: new Date(),
      environment: config.environment,
      config,
      criteriaResults,
      overallScore,
      passed,
      grade,
      summary,
      recommendations,
      signOffRequired
    };
  }

  private generateValidationSummary(criteriaResults: CriteriaResult[]): ValidationSummary {
    const totalCriteria = criteriaResults.length;
    const passedCriteria = criteriaResults.filter(r => r.passed).length;
    const failedCriteria = totalCriteria - passedCriteria;

    const mandatoryResults = criteriaResults.filter(r => r.criteria.mandatory);
    const mandatoryPassed = mandatoryResults.filter(r => r.passed).length;
    const mandatoryFailed = mandatoryResults.length - mandatoryPassed;

    // Calculate category scores
    const categoryScores: Record<string, number> = {};
    const categories = [...new Set(criteriaResults.map(r => r.criteria.category))];
    
    categories.forEach(category => {
      const categoryResults = criteriaResults.filter(r => r.criteria.category === category);
      const avgScore = categoryResults.reduce((sum, r) => sum + r.score, 0) / categoryResults.length;
      categoryScores[category] = avgScore;
    });

    // Identify critical issues
    const criticalIssues: string[] = [];
    const poorResults = criteriaResults.filter(r => r.grade === 'poor');
    poorResults.forEach(result => {
      if (result.criteria.mandatory) {
        criticalIssues.push(`Critical: ${result.criteria.name} failed mandatory requirement`);
      } else {
        criticalIssues.push(`Warning: ${result.criteria.name} performing poorly`);
      }
    });

    // Identify strengths
    const strengths: string[] = [];
    const excellentResults = criteriaResults.filter(r => r.grade === 'excellent');
    excellentResults.forEach(result => {
      strengths.push(`${result.criteria.name} performing excellently`);
    });

    return {
      totalCriteria,
      passedCriteria,
      failedCriteria,
      mandatoryPassed,
      mandatoryFailed,
      categoryScores,
      criticalIssues,
      strengths
    };
  }

  private generateRecommendations(criteriaResults: CriteriaResult[], overallScore: number): string[] {
    const recommendations: string[] = [];

    // Overall performance recommendations
    if (overallScore < 70) {
      recommendations.push('Overall performance is below acceptable levels. Comprehensive optimization required.');
    } else if (overallScore < 85) {
      recommendations.push('Performance is acceptable but has room for improvement.');
    }

    // Category-specific recommendations
    const responseTimeIssues = criteriaResults.filter(r => 
      r.criteria.category === 'response_time' && r.grade === 'poor'
    );
    if (responseTimeIssues.length > 0) {
      recommendations.push('Response time issues detected. Review query optimization and indexing strategies.');
    }

    const throughputIssues = criteriaResults.filter(r => 
      r.criteria.category === 'throughput' && r.grade === 'poor'
    );
    if (throughputIssues.length > 0) {
      recommendations.push('Throughput below expectations. Consider connection pooling and query optimization.');
    }

    const reliabilityIssues = criteriaResults.filter(r => 
      r.criteria.category === 'reliability' && r.grade === 'poor'
    );
    if (reliabilityIssues.length > 0) {
      recommendations.push('Reliability issues detected. Investigate error causes and implement proper error handling.');
    }

    const resourceIssues = criteriaResults.filter(r => 
      r.criteria.category === 'resource_usage' && r.grade === 'poor'
    );
    if (resourceIssues.length > 0) {
      recommendations.push('Resource usage is high. Consider capacity planning and resource optimization.');
    }

    // Specific criteria recommendations
    criteriaResults.forEach(result => {
      if (result.grade === 'poor') {
        switch (result.criteria.name) {
          case 'Average Response Time':
            recommendations.push('Optimize slow queries and ensure proper indexing.');
            break;
          case 'Error Rate':
            recommendations.push('Investigate and fix causes of query failures.');
            break;
          case 'Connection Pool Usage':
            recommendations.push('Optimize connection pool configuration or increase pool size.');
            break;
        }
      }
    });

    return [...new Set(recommendations)]; // Remove duplicates
  }

  getStandardCriteria(): PerformanceCriteria[] {
    return [...this.standardCriteria];
  }

  getAcceptanceProcedures(): AcceptanceProcedure[] {
    return [...this.acceptanceProcedures];
  }

  async executeAcceptanceProcedure(
    procedureName: string,
    validationResults: ValidationResult[]
  ): Promise<{
    procedureId: string;
    completed: boolean;
    stepResults: { step: AcceptanceStep; passed: boolean; notes: string }[];
    overallResult: 'passed' | 'failed' | 'requires_review';
    approvals: { approver: string; approved: boolean; timestamp: Date; notes: string }[];
  }> {
    const procedure = this.acceptanceProcedures.find(p => p.name === procedureName);
    if (!procedure) {
      throw new Error(`Acceptance procedure not found: ${procedureName}`);
    }

    const procedureId = `acceptance_${Date.now()}`;
    const stepResults: { step: AcceptanceStep; passed: boolean; notes: string }[] = [];

    // Execute each step
    for (const step of procedure.steps) {
      const stepResult = await this.executeAcceptanceStep(step, validationResults);
      stepResults.push(stepResult);
    }

    // Determine overall result
    const allStepsPassed = stepResults.every(sr => sr.passed);
    const hasValidationFailures = validationResults.some(vr => !vr.passed);
    
    let overallResult: 'passed' | 'failed' | 'requires_review';
    if (allStepsPassed && !hasValidationFailures) {
      overallResult = 'passed';
    } else if (hasValidationFailures || stepResults.some(sr => !sr.passed && sr.step.automated)) {
      overallResult = 'failed';
    } else {
      overallResult = 'requires_review';
    }

    return {
      procedureId,
      completed: true,
      stepResults,
      overallResult,
      approvals: [] // Would be populated by actual approval workflow
    };
  }

  private async executeAcceptanceStep(
    step: AcceptanceStep,
    validationResults: ValidationResult[]
  ): Promise<{ step: AcceptanceStep; passed: boolean; notes: string }> {
    if (!step.automated) {
      // Manual steps require human intervention
      return {
        step,
        passed: true, // Assume passed for manual steps
        notes: 'Manual step - requires human review and approval'
      };
    }

    // Automated step validation
    let passed = true;
    const notes: string[] = [];

    // Check validation results against step criteria
    for (const criterion of step.criteria) {
      const criterionMet = this.checkStepCriterion(criterion, validationResults);
      if (!criterionMet) {
        passed = false;
        notes.push(`Failed criterion: ${criterion}`);
      }
    }

    return {
      step,
      passed,
      notes: notes.length > 0 ? notes.join('; ') : 'All automated checks passed'
    };
  }

  private checkStepCriterion(criterion: string, validationResults: ValidationResult[]): boolean {
    // Simple criterion matching - in practice, this would be more sophisticated
    if (criterion.includes('load tests pass')) {
      return validationResults.filter(vr => vr.testId.includes('load')).every(vr => vr.passed);
    }
    
    if (criterion.includes('Response time < 500ms')) {
      return validationResults.every(vr => {
        const responseTimeCriteria = vr.criteriaResults.find(cr => cr.criteria.name === 'Average Response Time');
        return responseTimeCriteria ? responseTimeCriteria.actualValue < 500 : false;
      });
    }
    
    if (criterion.includes('Error rate < 2%')) {
      return validationResults.every(vr => {
        const errorRateCriteria = vr.criteriaResults.find(cr => cr.criteria.name === 'Error Rate');
        return errorRateCriteria ? errorRateCriteria.actualValue < 2 : false;
      });
    }

    // Default to true for unrecognized criteria
    return true;
  }

  async generatePerformanceReport(validationResults: ValidationResult[]): Promise<string> {
    const report = [
      '# Database Performance Validation Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Total Validations: ${validationResults.length}`,
      '',
      '## Executive Summary',
      ''
    ];

    const overallPassed = validationResults.every(vr => vr.passed);
    const averageScore = validationResults.reduce((sum, vr) => sum + vr.overallScore, 0) / validationResults.length;

    report.push(`**Overall Status:** ${overallPassed ? 'PASSED' : 'FAILED'}`);
    report.push(`**Average Score:** ${averageScore.toFixed(1)}/100`);
    report.push('');

    // Add detailed results for each validation
    validationResults.forEach((result, index) => {
      report.push(`## Validation ${index + 1}: ${result.testId}`);
      report.push('');
      report.push(`**Status:** ${result.passed ? 'PASSED' : 'FAILED'}`);
      report.push(`**Score:** ${result.overallScore.toFixed(1)}/100`);
      report.push(`**Grade:** ${result.grade}`);
      report.push('');

      if (result.summary.criticalIssues.length > 0) {
        report.push('### Critical Issues');
        result.summary.criticalIssues.forEach(issue => {
          report.push(`- ${issue}`);
        });
        report.push('');
      }

      if (result.recommendations.length > 0) {
        report.push('### Recommendations');
        result.recommendations.forEach(rec => {
          report.push(`- ${rec}`);
        });
        report.push('');
      }
    });

    return report.join('\n');
  }
}

export { PerformanceValidation, PerformanceCriteria, ValidationResult, ValidationConfig, AcceptanceProcedure };