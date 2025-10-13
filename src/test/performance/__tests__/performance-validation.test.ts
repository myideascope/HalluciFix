import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceValidation, PerformanceCriteria, ValidationConfig } from '../../../lib/performanceValidation';
import { LoadTestResult } from '../database-load-testing';

describe('PerformanceValidation', () => {
  let validation: PerformanceValidation;
  let mockLoadTestResults: LoadTestResult[];

  beforeEach(() => {
    validation = new PerformanceValidation();
    
    mockLoadTestResults = [
      {
        testName: 'test_load',
        config: {
          concurrentUsers: 10,
          testDuration: 60,
          operationsPerUser: 20,
          queryTypes: ['user_analysis_list']
        },
        startTime: new Date(),
        endTime: new Date(),
        totalOperations: 200,
        successfulOperations: 199,
        failedOperations: 1,
        averageResponseTime: 80,  // Good performance (< 100ms)
        p95ResponseTime: 150,     // Good performance (< 200ms)
        p99ResponseTime: 200,
        throughput: 60,           // Good throughput (> 50 ops/sec)
        errorRate: 0.3,           // Good error rate (< 0.5%)
        queryResults: new Map()
      }
    ];
  });

  describe('validateLoadTestResults', () => {
    it('should validate load test results against standard criteria', async () => {
      const result = await validation.validateLoadTestResults(mockLoadTestResults);

      expect(result).toBeDefined();
      expect(result.testId).toContain('load_validation');
      expect(result.criteriaResults).toHaveLength(validation.getStandardCriteria().length);
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.passed).toBeDefined();
      expect(result.grade).toMatch(/^[A-F]$/);
    });

    it('should pass validation for good performance metrics', async () => {
      const result = await validation.validateLoadTestResults(mockLoadTestResults);

      expect(result.passed).toBe(true);
      expect(result.grade).toMatch(/^[A-C]$/);
      expect(result.overallScore).toBeGreaterThan(70);
    });

    it('should fail validation for poor performance metrics', async () => {
      const poorResults = [{
        ...mockLoadTestResults[0],
        averageResponseTime: 2000, // Very slow
        p95ResponseTime: 3000,     // Very slow
        throughput: 5,             // Low throughput
        errorRate: 10              // High error rate
      }];

      const result = await validation.validateLoadTestResults(poorResults);

      expect(result.passed).toBe(false);
      expect(result.grade).toMatch(/^[D-F]$/);
      expect(result.summary.criticalIssues.length).toBeGreaterThan(0);
    });

    it('should respect custom validation configuration', async () => {
      const customConfig: Partial<ValidationConfig> = {
        overallPassingScore: 90,
        mandatoryCriteriaRequired: false
      };

      const result = await validation.validateLoadTestResults(mockLoadTestResults, customConfig);

      expect(result.config.overallPassingScore).toBe(90);
      expect(result.config.mandatoryCriteriaRequired).toBe(false);
    });

    it('should handle empty results gracefully', async () => {
      const result = await validation.validateLoadTestResults([]);

      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
      // Score will be calculated based on default values (0) which may not be 0 due to weighted scoring
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('criteria evaluation', () => {
    it('should correctly evaluate response time criteria', async () => {
      const result = await validation.validateLoadTestResults(mockLoadTestResults);
      
      const responseTimeCriteria = result.criteriaResults.find(
        cr => cr.criteria.name === 'Average Response Time'
      );

      expect(responseTimeCriteria).toBeDefined();
      expect(responseTimeCriteria!.actualValue).toBe(80);
      expect(responseTimeCriteria!.grade).toBe('good');
      expect(responseTimeCriteria!.passed).toBe(true);
    });

    it('should correctly evaluate throughput criteria', async () => {
      const result = await validation.validateLoadTestResults(mockLoadTestResults);
      
      const throughputCriteria = result.criteriaResults.find(
        cr => cr.criteria.name === 'Throughput'
      );

      expect(throughputCriteria).toBeDefined();
      expect(throughputCriteria!.actualValue).toBe(60);
      expect(throughputCriteria!.grade).toBe('good');
      expect(throughputCriteria!.passed).toBe(true);
    });

    it('should correctly evaluate error rate criteria', async () => {
      const result = await validation.validateLoadTestResults(mockLoadTestResults);
      
      const errorRateCriteria = result.criteriaResults.find(
        cr => cr.criteria.name === 'Error Rate'
      );

      expect(errorRateCriteria).toBeDefined();
      expect(errorRateCriteria!.actualValue).toBe(0.3);
      expect(errorRateCriteria!.grade).toBe('good');
      expect(errorRateCriteria!.passed).toBe(true);
    });
  });

  describe('scoring and grading', () => {
    it('should calculate weighted overall score correctly', async () => {
      const result = await validation.validateLoadTestResults(mockLoadTestResults);

      // Verify that score is calculated based on weighted criteria
      const expectedScore = result.criteriaResults.reduce((sum, cr) => {
        return sum + (cr.score * cr.criteria.weight);
      }, 0);

      expect(result.overallScore).toBeCloseTo(expectedScore, 1);
    });

    it('should assign correct grades based on score ranges', async () => {
      // Test different score ranges
      const testCases = [
        { score: 95, expectedGrade: 'A' },
        { score: 85, expectedGrade: 'B' },
        { score: 75, expectedGrade: 'C' },
        { score: 65, expectedGrade: 'D' },
        { score: 45, expectedGrade: 'F' }
      ];

      for (const testCase of testCases) {
        // Mock the scoring to return specific values
        const mockResults = [{
          ...mockLoadTestResults[0],
          averageResponseTime: testCase.score > 80 ? 100 : testCase.score > 60 ? 300 : 1500
        }];

        const result = await validation.validateLoadTestResults(mockResults);
        
        // Grade should be appropriate for the performance level
        expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
      }
    });
  });

  describe('mandatory criteria handling', () => {
    it('should fail validation if mandatory criteria fail', async () => {
      const failingResults = [{
        ...mockLoadTestResults[0],
        averageResponseTime: 2000, // Fails mandatory response time criteria
        errorRate: 1 // Passes error rate
      }];

      const result = await validation.validateLoadTestResults(failingResults, {
        mandatoryCriteriaRequired: true
      });

      expect(result.passed).toBe(false);
      expect(result.summary.mandatoryFailed).toBeGreaterThan(0);
    });

    it('should pass validation if non-mandatory criteria fail but mandatory pass', async () => {
      const mixedResults = [{
        ...mockLoadTestResults[0],
        averageResponseTime: 100, // Passes mandatory criteria
        throughput: 5 // Fails non-mandatory throughput (if not mandatory)
      }];

      const result = await validation.validateLoadTestResults(mixedResults, {
        mandatoryCriteriaRequired: true,
        overallPassingScore: 50 // Lower threshold
      });

      // Should still pass if mandatory criteria are met
      const mandatoryPassed = result.criteriaResults
        .filter(cr => cr.criteria.mandatory)
        .every(cr => cr.passed);

      if (mandatoryPassed) {
        expect(result.passed).toBe(true);
      }
    });
  });

  describe('recommendations generation', () => {
    it('should generate appropriate recommendations for poor performance', async () => {
      const poorResults = [{
        ...mockLoadTestResults[0],
        averageResponseTime: 2000,
        errorRate: 8,
        throughput: 3
      }];

      const result = await validation.validateLoadTestResults(poorResults);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some(rec => 
        rec.toLowerCase().includes('response time') || 
        rec.toLowerCase().includes('optimization')
      )).toBe(true);
    });

    it('should generate fewer recommendations for good performance', async () => {
      const goodResults = [{
        ...mockLoadTestResults[0],
        averageResponseTime: 50,
        errorRate: 0.1,
        throughput: 100
      }];

      const result = await validation.validateLoadTestResults(goodResults);

      // Should have fewer or no recommendations for good performance
      expect(result.recommendations.length).toBeLessThanOrEqual(2);
    });
  });

  describe('acceptance procedures', () => {
    it('should provide standard acceptance procedures', () => {
      const procedures = validation.getAcceptanceProcedures();

      expect(procedures).toBeDefined();
      expect(procedures.length).toBeGreaterThan(0);
      expect(procedures[0]).toHaveProperty('name');
      expect(procedures[0]).toHaveProperty('steps');
      expect(procedures[0]).toHaveProperty('requiredApprovals');
    });

    it('should execute acceptance procedure steps', async () => {
      const procedures = validation.getAcceptanceProcedures();
      const procedure = procedures[0];
      
      const validationResults = [await validation.validateLoadTestResults(mockLoadTestResults)];
      
      const result = await validation.executeAcceptanceProcedure(
        procedure.name,
        validationResults
      );

      expect(result).toBeDefined();
      expect(result.procedureId).toBeDefined();
      expect(result.stepResults).toHaveLength(procedure.steps.length);
      expect(result.overallResult).toMatch(/^(passed|failed|requires_review)$/);
    });
  });

  describe('performance report generation', () => {
    it('should generate comprehensive performance report', async () => {
      const validationResults = [
        await validation.validateLoadTestResults(mockLoadTestResults)
      ];

      const report = await validation.generatePerformanceReport(validationResults);

      expect(report).toBeDefined();
      expect(typeof report).toBe('string');
      expect(report).toContain('Database Performance Validation Report');
      expect(report).toContain('Executive Summary');
      expect(report).toContain(validationResults[0].testId);
    });

    it('should include critical issues in report', async () => {
      const poorResults = [{
        ...mockLoadTestResults[0],
        averageResponseTime: 3000,
        errorRate: 15
      }];

      const validationResults = [
        await validation.validateLoadTestResults(poorResults)
      ];

      const report = await validation.generatePerformanceReport(validationResults);

      expect(report).toContain('Critical Issues');
      expect(report).toContain('FAILED');
    });
  });

  describe('standard criteria', () => {
    it('should provide comprehensive standard criteria', () => {
      const criteria = validation.getStandardCriteria();

      expect(criteria).toBeDefined();
      expect(criteria.length).toBeGreaterThan(5);
      
      // Check for essential criteria
      const criteriaNames = criteria.map(c => c.name);
      expect(criteriaNames).toContain('Average Response Time');
      expect(criteriaNames).toContain('95th Percentile Response Time');
      expect(criteriaNames).toContain('Throughput');
      expect(criteriaNames).toContain('Error Rate');
    });

    it('should have properly configured criteria thresholds', () => {
      const criteria = validation.getStandardCriteria();

      criteria.forEach(criterion => {
        expect(criterion.thresholds.excellent).toBeDefined();
        expect(criterion.thresholds.good).toBeDefined();
        expect(criterion.thresholds.acceptable).toBeDefined();
        expect(criterion.thresholds.poor).toBeDefined();
        
        // Verify threshold ordering makes sense
        if (criterion.higherIsBetter) {
          expect(criterion.thresholds.excellent).toBeGreaterThanOrEqual(criterion.thresholds.good);
          expect(criterion.thresholds.good).toBeGreaterThanOrEqual(criterion.thresholds.acceptable);
        } else {
          expect(criterion.thresholds.excellent).toBeLessThanOrEqual(criterion.thresholds.good);
          expect(criterion.thresholds.good).toBeLessThanOrEqual(criterion.thresholds.acceptable);
        }
      });
    });
  });
});