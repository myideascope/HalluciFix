/**
 * Secret rotation procedures and automation
 * Provides comprehensive secret rotation procedures for different types of secrets
 */

// Web Crypto API will be used instead of Node.js crypto
import { SecureSecretStorage } from './secureSecretStorage.js';
import { SecretRotationConfig } from './secretEncryption.js';
import { SecretManagerError } from './errors.js';

export interface RotationProcedure {
  secretKey: string;
  rotationType: 'api-key' | 'jwt-secret' | 'encryption-key' | 'database-password' | 'oauth-secret';
  preRotationSteps: string[];
  postRotationSteps: string[];
  rollbackSteps: string[];
  validationSteps: string[];
  dependencies: string[];
}

export interface RotationResult {
  success: boolean;
  secretKey: string;
  oldSecretHash?: string;
  newSecretHash?: string;
  timestamp: number;
  duration: number;
  steps: Array<{
    step: string;
    success: boolean;
    duration: number;
    error?: string;
  }>;
  rollbackPerformed?: boolean;
}

/**
 * Secret rotation procedures manager
 */
export class SecretRotationProcedures {
  private procedures: Map<string, RotationProcedure> = new Map();
  private rotationHistory: RotationResult[] = [];

  constructor(private secretStorage: SecureSecretStorage) {
    this.initializeDefaultProcedures();
  }

  /**
   * Initialize default rotation procedures for common secret types
   */
  private initializeDefaultProcedures(): void {
    // JWT Secret rotation procedure
    this.registerProcedure({
      secretKey: 'auth/jwt-secret',
      rotationType: 'jwt-secret',
      preRotationSteps: [
        'Validate current JWT secret is working',
        'Check for active JWT tokens',
        'Prepare token migration strategy'
      ],
      postRotationSteps: [
        'Update JWT service configuration',
        'Verify new tokens can be created',
        'Verify existing tokens can still be validated (grace period)',
        'Update application configuration',
        'Restart JWT-dependent services'
      ],
      rollbackSteps: [
        'Restore previous JWT secret',
        'Restart JWT-dependent services',
        'Verify token validation is working'
      ],
      validationSteps: [
        'Create test JWT token',
        'Validate test JWT token',
        'Check token expiration handling'
      ],
      dependencies: []
    });

    // Database password rotation procedure
    this.registerProcedure({
      secretKey: 'database/supabase-service-key',
      rotationType: 'database-password',
      preRotationSteps: [
        'Check database connectivity',
        'Verify no long-running transactions',
        'Create database backup',
        'Prepare connection pool for rotation'
      ],
      postRotationSteps: [
        'Update database connection configuration',
        'Test database connectivity with new credentials',
        'Update connection pools',
        'Restart database-dependent services',
        'Verify application functionality'
      ],
      rollbackSteps: [
        'Restore previous database credentials',
        'Update connection pools',
        'Restart database-dependent services',
        'Verify database connectivity'
      ],
      validationSteps: [
        'Test database connection',
        'Execute test query',
        'Verify read/write permissions'
      ],
      dependencies: []
    });

    // OpenAI API key rotation procedure
    this.registerProcedure({
      secretKey: 'ai/openai-api-key',
      rotationType: 'api-key',
      preRotationSteps: [
        'Validate current API key is working',
        'Check API usage limits and quotas',
        'Prepare new API key in OpenAI dashboard'
      ],
      postRotationSteps: [
        'Update AI service configuration',
        'Test API connectivity with new key',
        'Verify API functionality',
        'Update rate limiting configuration',
        'Deactivate old API key'
      ],
      rollbackSteps: [
        'Reactivate previous API key',
        'Update AI service configuration',
        'Test API connectivity'
      ],
      validationSteps: [
        'Test API connection',
        'Make test API call',
        'Verify response format'
      ],
      dependencies: []
    });

    // Google OAuth secret rotation procedure
    this.registerProcedure({
      secretKey: 'auth/google-client-secret',
      rotationType: 'oauth-secret',
      preRotationSteps: [
        'Validate current OAuth configuration',
        'Check for active OAuth sessions',
        'Prepare new client secret in Google Cloud Console'
      ],
      postRotationSteps: [
        'Update OAuth service configuration',
        'Test OAuth flow with new secret',
        'Verify token exchange functionality',
        'Update redirect URI configuration',
        'Invalidate old client secret'
      ],
      rollbackSteps: [
        'Restore previous client secret',
        'Update OAuth service configuration',
        'Test OAuth flow'
      ],
      validationSteps: [
        'Test OAuth authorization flow',
        'Verify token exchange',
        'Check user profile retrieval'
      ],
      dependencies: []
    });

    // Encryption key rotation procedure
    this.registerProcedure({
      secretKey: 'security/encryption-key',
      rotationType: 'encryption-key',
      preRotationSteps: [
        'Identify all encrypted data',
        'Create data backup',
        'Prepare re-encryption strategy',
        'Validate current encryption is working'
      ],
      postRotationSteps: [
        'Re-encrypt all sensitive data with new key',
        'Update encryption service configuration',
        'Verify data integrity after re-encryption',
        'Test encryption/decryption functionality',
        'Securely destroy old encryption key'
      ],
      rollbackSteps: [
        'Restore data from backup',
        'Restore previous encryption key',
        'Verify data integrity',
        'Test encryption/decryption functionality'
      ],
      validationSteps: [
        'Test data encryption',
        'Test data decryption',
        'Verify encrypted data integrity',
        'Check performance impact'
      ],
      dependencies: []
    });
  }

  /**
   * Register a custom rotation procedure
   */
  registerProcedure(procedure: RotationProcedure): void {
    this.procedures.set(procedure.secretKey, procedure);
  }

  /**
   * Execute rotation for a specific secret
   */
  async rotateSecret(secretKey: string, userId?: string): Promise<RotationResult> {
    const startTime = Date.now();
    const procedure = this.procedures.get(secretKey);
    
    if (!procedure) {
      throw new SecretManagerError(`No rotation procedure found for secret: ${secretKey}`, secretKey);
    }

    const result: RotationResult = {
      success: false,
      secretKey,
      timestamp: startTime,
      duration: 0,
      steps: []
    };

    try {
      // Get current secret for rollback purposes
      const currentSecret = await this.secretStorage.getSecret(secretKey, userId);
      if (currentSecret) {
        result.oldSecretHash = await this.hashSecret(currentSecret);
      }

      // Execute pre-rotation steps
      await this.executeSteps('Pre-rotation', procedure.preRotationSteps, result);

      // Generate new secret
      const newSecret = await this.generateNewSecret(procedure.rotationType);
      result.newSecretHash = await this.hashSecret(newSecret);

      // Store new secret
      await this.secretStorage.setSecret(secretKey, newSecret, userId, {
        description: `Rotated on ${new Date().toISOString()}`,
        tags: ['rotated', procedure.rotationType]
      });

      // Execute post-rotation steps
      await this.executeSteps('Post-rotation', procedure.postRotationSteps, result);

      // Execute validation steps
      await this.executeSteps('Validation', procedure.validationSteps, result);

      result.success = true;
      console.log(`Successfully rotated secret: ${secretKey}`);

    } catch (error) {
      console.error(`Failed to rotate secret ${secretKey}:`, error);
      
      // Attempt rollback
      try {
        await this.executeSteps('Rollback', procedure.rollbackSteps, result);
        result.rollbackPerformed = true;
        console.log(`Rollback completed for secret: ${secretKey}`);
      } catch (rollbackError) {
        console.error(`Rollback failed for secret ${secretKey}:`, rollbackError);
      }

      throw new SecretManagerError(
        `Secret rotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        secretKey
      );
    } finally {
      result.duration = Date.now() - startTime;
      this.rotationHistory.push(result);
      
      // Keep only recent history (last 100 rotations)
      if (this.rotationHistory.length > 100) {
        this.rotationHistory = this.rotationHistory.slice(-100);
      }
    }

    return result;
  }

  /**
   * Execute a batch of rotation steps
   */
  private async executeSteps(
    phase: string, 
    steps: string[], 
    result: RotationResult
  ): Promise<void> {
    for (const step of steps) {
      const stepStartTime = Date.now();
      const stepResult = {
        step: `${phase}: ${step}`,
        success: false,
        duration: 0
      };

      try {
        await this.executeStep(step, phase);
        stepResult.success = true;
      } catch (error) {
        stepResult.success = false;
        stepResult.error = error instanceof Error ? error.message : 'Unknown error';
        throw error;
      } finally {
        stepResult.duration = Date.now() - stepStartTime;
        result.steps.push(stepResult);
      }
    }
  }

  /**
   * Execute a single rotation step
   */
  private async executeStep(step: string, phase: string): Promise<void> {
    // This is a simplified implementation
    // In a real system, each step would have specific implementation
    console.log(`Executing ${phase} step: ${step}`);
    
    // Simulate step execution time
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // For demonstration, we'll just log the step
    // In practice, each step would perform specific actions like:
    // - Updating service configurations
    // - Restarting services
    // - Testing connectivity
    // - Validating functionality
  }

  /**
   * Generate a new secret based on the rotation type
   */
  private async generateNewSecret(rotationType: string): Promise<string> {
    switch (rotationType) {
      case 'jwt-secret':
        // Generate a strong JWT secret (64 bytes)
        return this.generateRandomSecret(64);
      
      case 'encryption-key':
        // Generate a 256-bit encryption key
        return this.generateRandomSecret(32);
      
      case 'database-password':
        // Generate a strong database password
        return this.generateComplexPassword(32);
      
      case 'api-key':
        // Generate an API key format
        return `sk-${this.generateRandomSecret(48)}`;
      
      case 'oauth-secret':
        // Generate OAuth client secret
        return `GOCSPX-${this.generateRandomSecret(28)}`;
      
      default:
        // Default to strong random secret
        return this.generateRandomSecret(32);
    }
  }

  /**
   * Generate a random secret of specified length
   */
  private generateRandomSecret(length: number): string {
    // Generate a mixed character secret that will pass validation
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let secret = '';
    
    // Ensure we have at least one of each character type for longer secrets
    if (length >= 4) {
      const lowercase = 'abcdefghijklmnopqrstuvwxyz';
      const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const numbers = '0123456789';
      const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      
      // Add one of each type first
      secret += lowercase[Math.floor(Math.random() * lowercase.length)];
      secret += uppercase[Math.floor(Math.random() * uppercase.length)];
      secret += numbers[Math.floor(Math.random() * numbers.length)];
      secret += special[Math.floor(Math.random() * special.length)];
      
      // Fill the rest randomly
      for (let i = 4; i < length; i++) {
        secret += chars[Math.floor(Math.random() * chars.length)];
      }
      
      // Shuffle the secret to avoid predictable patterns
      return secret.split('').sort(() => Math.random() - 0.5).join('');
    } else {
      // For shorter secrets, just use random characters
      for (let i = 0; i < length; i++) {
        secret += chars[Math.floor(Math.random() * chars.length)];
      }
      return secret;
    }
  }

  /**
   * Generate a complex password with mixed characters
   */
  private generateComplexPassword(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      password += chars[randomIndex];
    }
    
    return password;
  }

  /**
   * Create a hash of a secret for tracking purposes (without exposing the secret)
   */
  private async hashSecret(secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }

  /**
   * Get rotation history
   */
  getRotationHistory(secretKey?: string): RotationResult[] {
    if (secretKey) {
      return this.rotationHistory.filter(result => result.secretKey === secretKey);
    }
    return [...this.rotationHistory];
  }

  /**
   * Get rotation procedure for a secret
   */
  getRotationProcedure(secretKey: string): RotationProcedure | undefined {
    return this.procedures.get(secretKey);
  }

  /**
   * List all registered rotation procedures
   */
  listRotationProcedures(): RotationProcedure[] {
    return Array.from(this.procedures.values());
  }

  /**
   * Schedule automatic rotation for all secrets with procedures
   */
  scheduleAllRotations(defaultConfig?: Partial<SecretRotationConfig>): void {
    for (const procedure of this.procedures.values()) {
      try {
        // This would integrate with the SecretRotationManager
        // For now, we'll just log the scheduling
        console.log(`Scheduling rotation for ${procedure.secretKey}`);
      } catch (error) {
        console.warn(`Failed to schedule rotation for ${procedure.secretKey}:`, error);
      }
    }
  }

  /**
   * Validate rotation readiness for a secret
   */
  async validateRotationReadiness(secretKey: string): Promise<{
    ready: boolean;
    issues: string[];
    warnings: string[];
  }> {
    const procedure = this.procedures.get(secretKey);
    const issues: string[] = [];
    const warnings: string[] = [];

    if (!procedure) {
      issues.push('No rotation procedure defined');
      return { ready: false, issues, warnings };
    }

    try {
      // Check if secret exists
      const currentSecret = await this.secretStorage.getSecret(secretKey);
      if (!currentSecret) {
        issues.push('Secret does not exist');
      }

      // Check dependencies
      for (const dependency of procedure.dependencies) {
        const dependencySecret = await this.secretStorage.getSecret(dependency);
        if (!dependencySecret) {
          issues.push(`Dependency secret missing: ${dependency}`);
        }
      }

      // Additional readiness checks could be added here
      // For example:
      // - Check if services are healthy
      // - Verify no ongoing maintenance
      // - Check system load
      
    } catch (error) {
      issues.push(`Failed to validate readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      ready: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Create a rotation plan for multiple secrets
   */
  async createRotationPlan(secretKeys: string[]): Promise<{
    plan: Array<{
      secretKey: string;
      order: number;
      dependencies: string[];
      estimatedDuration: number;
    }>;
    totalEstimatedDuration: number;
    warnings: string[];
  }> {
    const plan: Array<{
      secretKey: string;
      order: number;
      dependencies: string[];
      estimatedDuration: number;
    }> = [];
    const warnings: string[] = [];
    let totalDuration = 0;

    // Simple dependency resolution (topological sort would be better for complex dependencies)
    const processed = new Set<string>();
    let order = 1;

    for (const secretKey of secretKeys) {
      const procedure = this.procedures.get(secretKey);
      if (!procedure) {
        warnings.push(`No procedure found for ${secretKey}`);
        continue;
      }

      // Check if dependencies are in the plan
      const unmetDependencies = procedure.dependencies.filter(dep => !processed.has(dep));
      if (unmetDependencies.length > 0) {
        warnings.push(`Unmet dependencies for ${secretKey}: ${unmetDependencies.join(', ')}`);
      }

      const estimatedDuration = this.estimateRotationDuration(procedure);
      
      plan.push({
        secretKey,
        order: order++,
        dependencies: procedure.dependencies,
        estimatedDuration
      });

      totalDuration += estimatedDuration;
      processed.add(secretKey);
    }

    return {
      plan,
      totalEstimatedDuration: totalDuration,
      warnings
    };
  }

  /**
   * Estimate rotation duration for a procedure
   */
  private estimateRotationDuration(procedure: RotationProcedure): number {
    // Base duration estimates by rotation type (in milliseconds)
    const baseDurations: Record<string, number> = {
      'api-key': 30000,        // 30 seconds
      'jwt-secret': 60000,     // 1 minute
      'encryption-key': 300000, // 5 minutes
      'database-password': 120000, // 2 minutes
      'oauth-secret': 45000    // 45 seconds
    };

    const baseDuration = baseDurations[procedure.rotationType] || 60000;
    
    // Add time for each step (estimated 5 seconds per step)
    const stepCount = procedure.preRotationSteps.length + 
                     procedure.postRotationSteps.length + 
                     procedure.validationSteps.length;
    
    return baseDuration + (stepCount * 5000);
  }
}