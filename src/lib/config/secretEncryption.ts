/**
 * Secret encryption and secure storage implementation
 * Provides encryption, decryption, and secure storage for sensitive configuration data
 */

import * as crypto from 'crypto';

export interface EncryptedSecret {
  encryptedData: string;
  iv: string;
  salt: string;
  algorithm: string;
  keyDerivation: string;
  timestamp: number;
  version: number;
}

export interface SecretRotationConfig {
  rotationIntervalMs: number;
  maxAge: number;
  notifyBeforeExpiry: number;
  autoRotate: boolean;
}

export interface SecretAccessLog {
  secretKey: string;
  operation: 'read' | 'write' | 'delete' | 'rotate';
  timestamp: number;
  userId?: string;
  source: string;
  success: boolean;
  error?: string;
}

/**
 * Secret encryption service for secure storage of sensitive configuration data
 */
export class SecretEncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly keyDerivation = 'pbkdf2';
  private readonly iterations = 100000;
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly saltLength = 32;
  private readonly tagLength = 16;
  private readonly version = 1;

  private masterKey: Buffer | null = null;
  private accessLogs: SecretAccessLog[] = [];

  constructor(private masterPassword?: string) {
    if (masterPassword) {
      this.setMasterKey(masterPassword);
    }
  }

  /**
   * Set the master encryption key from password
   */
  setMasterKey(password: string): void {
    const salt = this.getMasterKeySalt();
    this.masterKey = crypto.pbkdf2Sync(password, salt, this.iterations, this.keyLength, 'sha256');
  }

  /**
   * Get or generate master key salt
   */
  private getMasterKeySalt(): Buffer {
    // In production, this should be stored securely and consistently
    const saltSource = process.env.ENCRYPTION_MASTER_SALT || 'hallucifix-default-salt';
    return crypto.createHash('sha256').update(saltSource).digest();
  }

  /**
   * Encrypt a secret value
   */
  async encryptSecret(plaintext: string, secretKey: string): Promise<EncryptedSecret> {
    if (!this.masterKey) {
      throw new Error('Master key not set. Call setMasterKey() first.');
    }

    try {
      // Generate random IV and salt for this encryption
      const iv = crypto.randomBytes(this.ivLength);
      const salt = crypto.randomBytes(this.saltLength);

      // Derive encryption key from master key and salt
      const derivedKey = crypto.pbkdf2Sync(this.masterKey, salt, this.iterations, this.keyLength, 'sha256');

      // Create cipher using the modern API
      const cipher = crypto.createCipheriv(this.algorithm, derivedKey, iv);

      // Add the secret key as additional data for authentication
      const authData = crypto.createHash('sha256').update(secretKey).digest();
      
      // Encrypt the data with authentication
      let encrypted = cipher.update(plaintext + authData.toString('hex'), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const result: EncryptedSecret = {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        algorithm: this.algorithm,
        keyDerivation: this.keyDerivation,
        timestamp: Date.now(),
        version: this.version
      };

      // Log the encryption operation
      this.logAccess({
        secretKey,
        operation: 'write',
        timestamp: Date.now(),
        source: 'SecretEncryptionService',
        success: true
      });

      return result;
    } catch (error) {
      this.logAccess({
        secretKey,
        operation: 'write',
        timestamp: Date.now(),
        source: 'SecretEncryptionService',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to encrypt secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt a secret value
   */
  async decryptSecret(encryptedSecret: EncryptedSecret, secretKey: string): Promise<string> {
    if (!this.masterKey) {
      throw new Error('Master key not set. Call setMasterKey() first.');
    }

    try {
      // Validate version compatibility
      if (encryptedSecret.version !== this.version) {
        throw new Error(`Unsupported encryption version: ${encryptedSecret.version}`);
      }

      // Parse components
      const iv = Buffer.from(encryptedSecret.iv, 'hex');
      const salt = Buffer.from(encryptedSecret.salt, 'hex');
      const encryptedData = encryptedSecret.encryptedData;

      // Derive the same key used for encryption
      const derivedKey = crypto.pbkdf2Sync(this.masterKey, salt, this.iterations, this.keyLength, 'sha256');

      // Create decipher using the modern API
      const decipher = crypto.createDecipheriv(encryptedSecret.algorithm, derivedKey, iv);

      // Decrypt the data
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Verify authentication by checking the secret key hash
      const expectedAuthData = crypto.createHash('sha256').update(secretKey).digest().toString('hex');
      const authDataLength = expectedAuthData.length;
      
      if (decrypted.length < authDataLength) {
        throw new Error('Invalid encrypted data format');
      }
      
      const actualAuthData = decrypted.slice(-authDataLength);
      const actualPlaintext = decrypted.slice(0, -authDataLength);
      
      if (actualAuthData !== expectedAuthData) {
        throw new Error('Authentication failed - invalid secret key');
      }
      
      decrypted = actualPlaintext;

      // Log the decryption operation
      this.logAccess({
        secretKey,
        operation: 'read',
        timestamp: Date.now(),
        source: 'SecretEncryptionService',
        success: true
      });

      return decrypted;
    } catch (error) {
      this.logAccess({
        secretKey,
        operation: 'read',
        timestamp: Date.now(),
        source: 'SecretEncryptionService',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to decrypt secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a secret needs rotation based on age
   */
  needsRotation(encryptedSecret: EncryptedSecret, rotationConfig: SecretRotationConfig): boolean {
    const age = Date.now() - encryptedSecret.timestamp;
    return age > rotationConfig.rotationIntervalMs;
  }

  /**
   * Check if a secret is approaching expiry
   */
  isApproachingExpiry(encryptedSecret: EncryptedSecret, rotationConfig: SecretRotationConfig): boolean {
    const age = Date.now() - encryptedSecret.timestamp;
    const timeUntilRotation = rotationConfig.rotationIntervalMs - age;
    return timeUntilRotation <= rotationConfig.notifyBeforeExpiry;
  }

  /**
   * Generate a secure random secret
   */
  generateSecret(length: number = 32): string {
    // Generate a mixed character secret that will pass validation
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let secret = '';
    
    // Ensure we have at least one of each character type
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
  }

  /**
   * Validate secret strength
   */
  validateSecretStrength(secret: string): { isValid: boolean; score: number; issues: string[] } {
    const issues: string[] = [];
    let score = 0;

    // Length check
    if (secret.length < 16) {
      issues.push('Secret should be at least 16 characters long');
    } else if (secret.length >= 32) {
      score += 25;
    } else if (secret.length >= 24) {
      score += 20;
    } else {
      score += 10;
    }

    // Character variety
    const hasLower = /[a-z]/.test(secret);
    const hasUpper = /[A-Z]/.test(secret);
    const hasNumbers = /\d/.test(secret);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(secret);

    const varietyCount = [hasLower, hasUpper, hasNumbers, hasSpecial].filter(Boolean).length;
    score += varietyCount * 15;

    if (varietyCount < 3) {
      issues.push('Secret should contain at least 3 different character types (lowercase, uppercase, numbers, special characters)');
    }

    // Entropy check (simplified)
    const uniqueChars = new Set(secret).size;
    const entropyScore = (uniqueChars / secret.length) * 20;
    score += entropyScore;

    if (uniqueChars < secret.length * 0.5) {
      issues.push('Secret has low entropy (too many repeated characters)');
    }

    // Common patterns
    if (/(.)\1{2,}/.test(secret)) {
      issues.push('Secret contains repeated character sequences');
      score -= 10;
    }

    if (/123|abc|qwe|password|admin/i.test(secret)) {
      issues.push('Secret contains common patterns or words');
      score -= 20;
    }

    return {
      isValid: issues.length === 0 && score >= 70,
      score: Math.max(0, Math.min(100, score)),
      issues
    };
  }

  /**
   * Log access to secrets for audit purposes
   */
  private logAccess(log: SecretAccessLog): void {
    this.accessLogs.push(log);
    
    // Keep only recent logs (last 1000 entries)
    if (this.accessLogs.length > 1000) {
      this.accessLogs = this.accessLogs.slice(-1000);
    }

    // In production, this should be sent to a secure logging service
    if (process.env.NODE_ENV === 'production') {
      console.log(`Secret access: ${log.operation} ${log.secretKey} - ${log.success ? 'SUCCESS' : 'FAILED'}`);
    }
  }

  /**
   * Get access logs for audit purposes
   */
  getAccessLogs(secretKey?: string, since?: number): SecretAccessLog[] {
    let logs = this.accessLogs;

    if (secretKey) {
      logs = logs.filter(log => log.secretKey === secretKey);
    }

    if (since) {
      logs = logs.filter(log => log.timestamp >= since);
    }

    return logs.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clear access logs (use with caution)
   */
  clearAccessLogs(): void {
    this.accessLogs = [];
  }

  /**
   * Export encrypted secrets for backup (without master key)
   */
  exportSecrets(secrets: Record<string, EncryptedSecret>): string {
    const exportData = {
      version: this.version,
      timestamp: Date.now(),
      secrets: secrets
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import encrypted secrets from backup
   */
  importSecrets(exportedData: string): Record<string, EncryptedSecret> {
    try {
      const data = JSON.parse(exportedData);
      
      if (data.version !== this.version) {
        throw new Error(`Incompatible export version: ${data.version}`);
      }

      return data.secrets;
    } catch (error) {
      throw new Error(`Failed to import secrets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Secret rotation manager for automated secret rotation
 */
export class SecretRotationManager {
  private rotationSchedules: Map<string, NodeJS.Timeout> = new Map();
  private rotationCallbacks: Map<string, (oldSecret: string, newSecret: string) => Promise<void>> = new Map();

  constructor(
    private encryptionService: SecretEncryptionService,
    private defaultConfig: SecretRotationConfig = {
      rotationIntervalMs: 30 * 24 * 60 * 60 * 1000, // 30 days
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
      notifyBeforeExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
      autoRotate: false
    }
  ) {}

  /**
   * Schedule automatic rotation for a secret
   */
  scheduleRotation(
    secretKey: string,
    rotationCallback: (oldSecret: string, newSecret: string) => Promise<void>,
    config: Partial<SecretRotationConfig> = {}
  ): void {
    const rotationConfig = { ...this.defaultConfig, ...config };
    
    // Clear existing schedule if any
    this.clearRotationSchedule(secretKey);

    // Store callback
    this.rotationCallbacks.set(secretKey, rotationCallback);

    if (rotationConfig.autoRotate) {
      // Schedule rotation
      const timeout = setTimeout(async () => {
        try {
          await this.rotateSecret(secretKey);
        } catch (error) {
          console.error(`Failed to auto-rotate secret ${secretKey}:`, error);
        }
      }, rotationConfig.rotationIntervalMs);

      this.rotationSchedules.set(secretKey, timeout);
    }
  }

  /**
   * Manually rotate a secret
   */
  async rotateSecret(secretKey: string): Promise<string> {
    const callback = this.rotationCallbacks.get(secretKey);
    if (!callback) {
      throw new Error(`No rotation callback registered for secret: ${secretKey}`);
    }

    try {
      // Generate new secret
      const newSecret = this.encryptionService.generateSecret();
      
      // Validate new secret strength
      const validation = this.encryptionService.validateSecretStrength(newSecret);
      if (!validation.isValid) {
        throw new Error(`Generated secret failed validation: ${validation.issues.join(', ')}`);
      }

      // Call the rotation callback with old and new secrets
      // The callback should handle updating the secret in all necessary places
      await callback('', newSecret); // Old secret not provided for security

      console.log(`Successfully rotated secret: ${secretKey}`);
      return newSecret;
    } catch (error) {
      console.error(`Failed to rotate secret ${secretKey}:`, error);
      throw error;
    }
  }

  /**
   * Clear rotation schedule for a secret
   */
  clearRotationSchedule(secretKey: string): void {
    const timeout = this.rotationSchedules.get(secretKey);
    if (timeout) {
      clearTimeout(timeout);
      this.rotationSchedules.delete(secretKey);
    }
  }

  /**
   * Clear all rotation schedules
   */
  clearAllSchedules(): void {
    this.rotationSchedules.forEach(timeout => clearTimeout(timeout));
    this.rotationSchedules.clear();
    this.rotationCallbacks.clear();
  }

  /**
   * Get rotation status for all scheduled secrets
   */
  getRotationStatus(): Array<{ secretKey: string; hasSchedule: boolean; hasCallback: boolean }> {
    const allKeys = new Set([
      ...this.rotationSchedules.keys(),
      ...this.rotationCallbacks.keys()
    ]);

    return Array.from(allKeys).map(secretKey => ({
      secretKey,
      hasSchedule: this.rotationSchedules.has(secretKey),
      hasCallback: this.rotationCallbacks.has(secretKey)
    }));
  }
}