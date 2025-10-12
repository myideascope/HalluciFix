import { describe, it, expect } from 'vitest';
import {
  createTestUser,
  createTestUsers,
  createAdminUser,
  createManagerUser,
  createEditorUser,
  createViewerUser,
  createTestPermission,
  createTestUserRole,
  createTestAnalysisResult,
  createTestAnalysisResults,
  createTestDatabaseAnalysisResult,
  createTestHallucination,
  createTestSeqLogprobAnalysis,
  createTestScheduledScan,
  createTestScheduledScans,
  createTestReview,
  createTestReviews,
  createTestGoogleDriveFile,
  createTestGoogleDriveFiles,
  createTestContent,
  createTestBatchDocument,
  createTestBatchDocuments,
  createTestScenario,
  createHighRiskAnalysis,
  createLowRiskAnalysis
} from '../index';
import { DEFAULT_ROLES } from '../../../types/user';

describe('Test Data Factories', () => {
  describe('User Factories', () => {
    describe('createTestUser', () => {
      it('should create a valid user with default values', () => {
        const user = createTestUser();
        
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('email');
        expect(user).toHaveProperty('name');
        expect(user).toHaveProperty('role');
        expect(user).toHaveProperty('department');
        expect(user).toHaveProperty('status');
        expect(user).toHaveProperty('lastActive');
        expect(user).toHaveProperty('createdAt');
        expect(user).toHaveProperty('permissions');
        
        expect(typeof user.id).toBe('string');
        expect(typeof user.email).toBe('string');
        expect(typeof user.name).toBe('string');
        expect(user.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
        expect(['active', 'inactive', 'pending']).toContain(user.status);
        expect(Array.isArray(user.permissions)).toBe(true);
      });

      it('should apply overrides correctly', () => {
        const overrides = {
          id: 'custom-id',
          email: 'custom@test.com',
          name: 'Custom User',
          status: 'active' as const
        };
        
        const user = createTestUser(overrides);
        
        expect(user.id).toBe('custom-id');
        expect(user.email).toBe('custom@test.com');
        expect(user.name).toBe('Custom User');
        expect(user.status).toBe('active');
      });

      it('should have valid role and permissions', () => {
        const user = createTestUser();
        
        expect(user.role).toHaveProperty('id');
        expect(user.role).toHaveProperty('name');
        expect(user.role).toHaveProperty('level');
        expect(user.role).toHaveProperty('permissions');
        expect(typeof user.role.level).toBe('number');
        expect(user.role.level).toBeGreaterThanOrEqual(1);
        expect(user.permissions).toEqual(user.role.permissions);
      });
    });

    describe('createTestUsers', () => {
      it('should create multiple users', () => {
        const users = createTestUsers(5);
        
        expect(Array.isArray(users)).toBe(true);
        expect(users).toHaveLength(5);
        
        users.forEach(user => {
          expect(user).toHaveProperty('id');
          expect(user).toHaveProperty('email');
          expect(user).toHaveProperty('name');
        });
        
        // All users should have unique IDs
        const ids = users.map(u => u.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(5);
      });

      it('should apply overrides to all users', () => {
        const overrides = { department: 'Engineering' };
        const users = createTestUsers(3, overrides);
        
        users.forEach(user => {
          expect(user.department).toBe('Engineering');
        });
      });
    });

    describe('Role-specific user factories', () => {
      it('should create admin user with correct permissions', () => {
        const adminUser = createAdminUser();
        
        expect(adminUser.role.level).toBe(1);
        expect(adminUser.role.name).toBe('Administrator');
        expect(adminUser.status).toBe('active');
        expect(adminUser.permissions).toEqual(DEFAULT_ROLES[0].permissions);
      });

      it('should create manager user with correct permissions', () => {
        const managerUser = createManagerUser();
        
        expect(managerUser.role.level).toBe(2);
        expect(managerUser.role.name).toBe('Manager');
        expect(managerUser.status).toBe('active');
        expect(managerUser.permissions).toEqual(DEFAULT_ROLES[1].permissions);
      });

      it('should create editor user with correct permissions', () => {
        const editorUser = createEditorUser();
        
        expect(editorUser.role.level).toBe(3);
        expect(editorUser.role.name).toBe('Editor');
        expect(editorUser.status).toBe('active');
        expect(editorUser.permissions).toEqual(DEFAULT_ROLES[2].permissions);
      });

      it('should create viewer user with correct permissions', () => {
        const viewerUser = createViewerUser();
        
        expect(viewerUser.role.level).toBe(4);
        expect(viewerUser.role.name).toBe('Viewer');
        expect(viewerUser.status).toBe('active');
        expect(viewerUser.permissions).toEqual(DEFAULT_ROLES[3].permissions);
      });
    });

    describe('createTestPermission', () => {
      it('should create valid permission', () => {
        const permission = createTestPermission();
        
        expect(permission).toHaveProperty('id');
        expect(permission).toHaveProperty('name');
        expect(permission).toHaveProperty('description');
        expect(permission).toHaveProperty('resource');
        expect(permission).toHaveProperty('actions');
        
        expect(typeof permission.id).toBe('string');
        expect(typeof permission.name).toBe('string');
        expect(typeof permission.description).toBe('string');
        expect(typeof permission.resource).toBe('string');
        expect(Array.isArray(permission.actions)).toBe(true);
        expect(permission.actions.length).toBeGreaterThan(0);
      });
    });

    describe('createTestUserRole', () => {
      it('should create valid user role', () => {
        const role = createTestUserRole();
        
        expect(role).toHaveProperty('id');
        expect(role).toHaveProperty('name');
        expect(role).toHaveProperty('description');
        expect(role).toHaveProperty('level');
        expect(role).toHaveProperty('permissions');
        
        expect(typeof role.level).toBe('number');
        expect(role.level).toBeGreaterThanOrEqual(1);
        expect(role.level).toBeLessThanOrEqual(5);
        expect(Array.isArray(role.permissions)).toBe(true);
      });
    });
  });

  describe('Analysis Factories', () => {
    describe('createTestHallucination', () => {
      it('should create valid hallucination', () => {
        const hallucination = createTestHallucination();
        
        expect(hallucination).toHaveProperty('text');
        expect(hallucination).toHaveProperty('type');
        expect(hallucination).toHaveProperty('confidence');
        expect(hallucination).toHaveProperty('explanation');
        expect(hallucination).toHaveProperty('startIndex');
        expect(hallucination).toHaveProperty('endIndex');
        
        expect(typeof hallucination.text).toBe('string');
        expect(typeof hallucination.type).toBe('string');
        expect(typeof hallucination.confidence).toBe('number');
        expect(hallucination.confidence).toBeGreaterThanOrEqual(0.5);
        expect(hallucination.confidence).toBeLessThanOrEqual(1);
        expect(hallucination.startIndex).toBeLessThan(hallucination.endIndex);
      });
    });

    describe('createTestSeqLogprobAnalysis', () => {
      it('should create valid seq-logprob analysis', () => {
        const analysis = createTestSeqLogprobAnalysis();
        
        expect(analysis).toHaveProperty('seqLogprob');
        expect(analysis).toHaveProperty('normalizedSeqLogprob');
        expect(analysis).toHaveProperty('confidenceScore');
        expect(analysis).toHaveProperty('hallucinationRisk');
        expect(analysis).toHaveProperty('isHallucinationSuspected');
        expect(analysis).toHaveProperty('lowConfidenceTokens');
        expect(analysis).toHaveProperty('suspiciousSequences');
        expect(analysis).toHaveProperty('processingTime');
        
        expect(typeof analysis.seqLogprob).toBe('number');
        expect(analysis.seqLogprob).toBeLessThan(0);
        expect(typeof analysis.confidenceScore).toBe('number');
        expect(analysis.confidenceScore).toBeGreaterThanOrEqual(0);
        expect(analysis.confidenceScore).toBeLessThanOrEqual(100);
        expect(['low', 'medium', 'high', 'critical']).toContain(analysis.hallucinationRisk);
        expect(typeof analysis.isHallucinationSuspected).toBe('boolean');
      });
    });

    describe('createTestAnalysisResult', () => {
      it('should create valid analysis result', () => {
        const result = createTestAnalysisResult();
        
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('user_id');
        expect(result).toHaveProperty('content');
        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('accuracy');
        expect(result).toHaveProperty('riskLevel');
        expect(result).toHaveProperty('hallucinations');
        expect(result).toHaveProperty('verificationSources');
        expect(result).toHaveProperty('processingTime');
        expect(result).toHaveProperty('analysisType');
        
        expect(typeof result.accuracy).toBe('number');
        expect(result.accuracy).toBeGreaterThanOrEqual(0);
        expect(result.accuracy).toBeLessThanOrEqual(100);
        expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
        expect(['single', 'batch', 'scheduled']).toContain(result.analysisType);
        expect(Array.isArray(result.hallucinations)).toBe(true);
      });

      it('should correlate accuracy with risk level and hallucinations', () => {
        const results = createTestAnalysisResults(20);
        
        results.forEach(result => {
          if (result.riskLevel === 'low') {
            expect(result.accuracy).toBeGreaterThan(85);
            expect(result.hallucinations.length).toBeLessThanOrEqual(1);
          } else if (result.riskLevel === 'critical') {
            expect(result.accuracy).toBeLessThanOrEqual(50);
            expect(result.hallucinations.length).toBeGreaterThanOrEqual(3);
          }
        });
      });
    });

    describe('createTestDatabaseAnalysisResult', () => {
      it('should create valid database analysis result', () => {
        const result = createTestDatabaseAnalysisResult();
        
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('user_id');
        expect(result).toHaveProperty('content');
        expect(result).toHaveProperty('accuracy');
        expect(result).toHaveProperty('risk_level');
        expect(result).toHaveProperty('hallucinations');
        expect(result).toHaveProperty('verification_sources');
        expect(result).toHaveProperty('processing_time');
        expect(result).toHaveProperty('created_at');
        expect(result).toHaveProperty('analysis_type');
        
        // Database format uses snake_case
        expect(typeof result.verification_sources).toBe('number');
        expect(typeof result.processing_time).toBe('number');
        expect(typeof result.created_at).toBe('string');
        expect(['single', 'batch', 'scheduled']).toContain(result.analysis_type);
      });
    });

    describe('Risk-specific analysis factories', () => {
      it('should create high risk analysis', () => {
        const highRisk = createHighRiskAnalysis();
        
        expect(highRisk.accuracy).toBeLessThanOrEqual(50);
        expect(highRisk.riskLevel).toBe('critical');
        expect(highRisk.hallucinations.length).toBeGreaterThanOrEqual(5);
      });

      it('should create low risk analysis', () => {
        const lowRisk = createLowRiskAnalysis();
        
        expect(lowRisk.accuracy).toBeGreaterThanOrEqual(90);
        expect(lowRisk.riskLevel).toBe('low');
        expect(lowRisk.hallucinations).toHaveLength(0);
      });
    });
  });

  describe('Scheduled Scan Factories', () => {
    describe('createTestScheduledScan', () => {
      it('should create valid scheduled scan', () => {
        const scan = createTestScheduledScan();
        
        expect(scan).toHaveProperty('id');
        expect(scan).toHaveProperty('user_id');
        expect(scan).toHaveProperty('name');
        expect(scan).toHaveProperty('description');
        expect(scan).toHaveProperty('frequency');
        expect(scan).toHaveProperty('source_type');
        expect(scan).toHaveProperty('source_config');
        expect(scan).toHaveProperty('is_active');
        expect(scan).toHaveProperty('next_run');
        expect(scan).toHaveProperty('created_at');
        expect(scan).toHaveProperty('updated_at');
        
        expect(['daily', 'weekly', 'monthly']).toContain(scan.frequency);
        expect(['google_drive', 'url', 'upload']).toContain(scan.source_type);
        expect(typeof scan.is_active).toBe('boolean');
        expect(typeof scan.source_config).toBe('object');
      });
    });

    describe('createTestScheduledScans', () => {
      it('should create multiple scheduled scans', () => {
        const scans = createTestScheduledScans(3);
        
        expect(Array.isArray(scans)).toBe(true);
        expect(scans).toHaveLength(3);
        
        scans.forEach(scan => {
          expect(scan).toHaveProperty('id');
          expect(scan).toHaveProperty('name');
        });
      });
    });
  });

  describe('Review Factories', () => {
    describe('createTestReview', () => {
      it('should create valid review', () => {
        const review = createTestReview();
        
        expect(review).toHaveProperty('id');
        expect(review).toHaveProperty('analysis_id');
        expect(review).toHaveProperty('reviewer_id');
        expect(review).toHaveProperty('status');
        expect(review).toHaveProperty('comments');
        expect(review).toHaveProperty('created_at');
        expect(review).toHaveProperty('updated_at');
        
        expect(['pending', 'approved', 'rejected']).toContain(review.status);
        expect(typeof review.comments).toBe('string');
      });
    });
  });

  describe('Google Drive Factories', () => {
    describe('createTestGoogleDriveFile', () => {
      it('should create valid Google Drive file', () => {
        const file = createTestGoogleDriveFile();
        
        expect(file).toHaveProperty('id');
        expect(file).toHaveProperty('name');
        expect(file).toHaveProperty('mimeType');
        expect(file).toHaveProperty('modifiedTime');
        expect(file).toHaveProperty('webViewLink');
        expect(file).toHaveProperty('parents');
        
        expect(typeof file.id).toBe('string');
        expect(typeof file.name).toBe('string');
        expect(typeof file.mimeType).toBe('string');
        expect(Array.isArray(file.parents)).toBe(true);
        expect(file.webViewLink).toMatch(/^https?:\/\//);
      });
    });

    describe('createTestGoogleDriveFiles', () => {
      it('should create multiple Google Drive files', () => {
        const files = createTestGoogleDriveFiles(4);
        
        expect(Array.isArray(files)).toBe(true);
        expect(files).toHaveLength(4);
        
        files.forEach(file => {
          expect(file).toHaveProperty('id');
          expect(file).toHaveProperty('name');
          expect(file).toHaveProperty('mimeType');
        });
      });
    });
  });

  describe('Content Factories', () => {
    describe('createTestContent', () => {
      it('should create clean content', () => {
        const content = createTestContent('clean');
        
        expect(typeof content).toBe('string');
        expect(content.length).toBeGreaterThan(0);
        
        // Clean content should not contain suspicious phrases
        const suspiciousPhrases = ['exactly', 'zero false positives', 'unprecedented'];
        const hasSuspiciousContent = suspiciousPhrases.some(phrase => 
          content.toLowerCase().includes(phrase.toLowerCase())
        );
        expect(hasSuspiciousContent).toBe(false);
      });

      it('should create suspicious content', () => {
        const content = createTestContent('suspicious');
        
        expect(typeof content).toBe('string');
        expect(content.length).toBeGreaterThan(0);
        
        // Should contain some suspicious phrases
        const suspiciousPhrases = ['exactly', 'zero', 'unprecedented', 'revolutionary', 'perfect'];
        const hasSuspiciousContent = suspiciousPhrases.some(phrase => 
          content.toLowerCase().includes(phrase.toLowerCase())
        );
        expect(hasSuspiciousContent).toBe(true);
      });

      it('should create problematic content', () => {
        const content = createTestContent('problematic');
        
        expect(typeof content).toBe('string');
        expect(content.length).toBeGreaterThan(0);
        
        // Should contain multiple suspicious phrases
        const suspiciousPhrases = ['exactly', 'zero', 'unprecedented', 'revolutionary', 'perfect'];
        const matchingPhrases = suspiciousPhrases.filter(phrase => 
          content.toLowerCase().includes(phrase.toLowerCase())
        );
        expect(matchingPhrases.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Batch Analysis Factories', () => {
    describe('createTestBatchDocument', () => {
      it('should create valid batch document', () => {
        const doc = createTestBatchDocument();
        
        expect(doc).toHaveProperty('id');
        expect(doc).toHaveProperty('content');
        
        expect(typeof doc.id).toBe('string');
        expect(typeof doc.content).toBe('string');
        expect(doc.content.length).toBeGreaterThan(0);
      });
    });

    describe('createTestBatchDocuments', () => {
      it('should create multiple batch documents', () => {
        const docs = createTestBatchDocuments(5);
        
        expect(Array.isArray(docs)).toBe(true);
        expect(docs).toHaveLength(5);
        
        docs.forEach(doc => {
          expect(doc).toHaveProperty('id');
          expect(doc).toHaveProperty('content');
        });
        
        // All documents should have unique IDs
        const ids = docs.map(d => d.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(5);
      });
    });
  });

  describe('Utility Functions', () => {
    describe('createTestScenario', () => {
      it('should create complete test scenario', () => {
        const scenario = createTestScenario();
        
        expect(scenario).toHaveProperty('user');
        expect(scenario).toHaveProperty('analysisResults');
        expect(scenario).toHaveProperty('scheduledScans');
        expect(scenario).toHaveProperty('reviews');
        
        expect(scenario.analysisResults).toHaveLength(5);
        expect(scenario.scheduledScans).toHaveLength(2);
        expect(scenario.reviews).toHaveLength(3);
        
        // All analysis results should belong to the user
        scenario.analysisResults.forEach(result => {
          expect(result.user_id).toBe(scenario.user.id);
        });
        
        // All scheduled scans should belong to the user
        scenario.scheduledScans.forEach(scan => {
          expect(scan.user_id).toBe(scenario.user.id);
        });
      });

      it('should create scenario with specific user ID', () => {
        const userId = 'specific-user-123';
        const scenario = createTestScenario(userId);
        
        expect(scenario.user.id).toBe(userId);
        
        scenario.analysisResults.forEach(result => {
          expect(result.user_id).toBe(userId);
        });
      });
    });
  });

  describe('Data Consistency', () => {
    it('should maintain referential integrity in test data', () => {
      const user = createTestUser();
      const analysisResult = createTestAnalysisResult({ user_id: user.id });
      const review = createTestReview({ 
        analysis_id: analysisResult.id,
        reviewer_id: user.id 
      });
      
      expect(analysisResult.user_id).toBe(user.id);
      expect(review.analysis_id).toBe(analysisResult.id);
      expect(review.reviewer_id).toBe(user.id);
    });

    it('should generate unique IDs across different factories', () => {
      const users = createTestUsers(10);
      const analyses = createTestAnalysisResults(10);
      const scans = createTestScheduledScans(10);
      
      const allIds = [
        ...users.map(u => u.id),
        ...analyses.map(a => a.id),
        ...scans.map(s => s.id)
      ];
      
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it('should generate realistic timestamps', () => {
      const result = createTestAnalysisResult();
      const user = createTestUser();
      
      const resultTime = new Date(result.timestamp);
      const userCreatedTime = new Date(user.createdAt);
      const userActiveTime = new Date(user.lastActive);
      const now = new Date();
      
      expect(resultTime.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(userCreatedTime.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(userActiveTime.getTime()).toBeLessThanOrEqual(now.getTime());
    });
  });
});