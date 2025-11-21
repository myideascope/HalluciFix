/**
 * Billing Data Encryption Service
 * Provides secure encryption and storage for sensitive billing data
 */

import { createHash, createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';

import { logger } from './logging';
// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const TAG_LENGTH = 16; // 128 bits
const ITERATIONS = 100000; // PBKDF2 iterations

// Encrypted data structure
export interface EncryptedData {
  encrypted: string;
  iv: string;
  salt: string;
  tag: string;
  algorithm: string;
  keyDerivation: string;
}

// Sensitive billing data types
export interface SensitiveBillingData {
  cardNumber?: string;
  cvv?: string;
  bankAccount?: string;
  taxId?: string;
  personalInfo?: {
    ssn?: string;
    passport?: string;
    driverLicense?: string;
  };
}

export class BillingEncryptionService {
  private masterKey: Buffer;

  constructor() {
    // Get master key from environment or generate one
    const masterKeyHex = process.env.BILLING_ENCRYPTION_KEY;
    if (!masterKeyHex) {
      throw new Error('BILLING_ENCRYPTION_KEY environment variable is required');
    }

    if (masterKeyHex.length !== 64) { // 32 bytes = 64 hex characters
      throw new Error('BILLING_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }

    this.masterKey = Buffer.from(masterKeyHex, 'hex');
  }

  /**
   * Encrypt sensitive billing data
   */
  encrypt(data: string, userSalt?: string): EncryptedData {
    try {
      // Generate random salt and IV
      const salt = userSalt ? Buffer.from(userSalt, 'hex') : randomBytes(SALT_LENGTH);
      const iv = randomBytes(IV_LENGTH);

      // Derive key from master key and salt
      const derivedKey = pbkdf2Sync(this.masterKey, salt, ITERATIONS, KEY_LENGTH, 'sha256');

      // Create cipher
      const cipher = createCipheriv(ALGORITHM, derivedKey, iv);

      // Encrypt data
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const tag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        tag: tag.toString('hex'),
        algorithm: ALGORITHM,
        keyDerivation: 'pbkdf2',
      };

    } catch (error) {
      logger.error("Encryption failed:", error instanceof Error ? error : new Error(String(error)));
      throw new Error('Failed to encrypt billing data');
    }
  }

  /**
   * Decrypt sensitive billing data
   */
  decrypt(encryptedData: EncryptedData): string {
    try {
      // Validate algorithm
      if (encryptedData.algorithm !== ALGORITHM) {
        throw new Error('Unsupported encryption algorithm');
      }

      // Convert hex strings back to buffers
      const salt = Buffer.from(encryptedData.salt, 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');

      // Derive key from master key and salt
      const derivedKey = pbkdf2Sync(this.masterKey, salt, ITERATIONS, KEY_LENGTH, 'sha256');

      // Create decipher
      const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
      decipher.setAuthTag(tag);

      // Decrypt data
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;

    } catch (error) {
      logger.error("Decryption failed:", error instanceof Error ? error : new Error(String(error)));
      throw new Error('Failed to decrypt billing data');
    }
  }

  /**
   * Hash sensitive data for indexing (one-way)
   */
  hash(data: string, salt?: string): string {
    const hashSalt = salt || randomBytes(16).toString('hex');
    const hash = createHash('sha256');
    hash.update(data + hashSalt);
    return hash.digest('hex');
  }

  /**
   * Encrypt payment method data
   */
  encryptPaymentMethod(paymentMethod: {
    type: 'card' | 'bank_account';
    last4: string;
    brand?: string;
    expiryMonth?: number;
    expiryYear?: number;
    bankName?: string;
    accountType?: string;
  }): EncryptedData {
    const sensitiveData = JSON.stringify(paymentMethod);
    return this.encrypt(sensitiveData);
  }

  /**
   * Decrypt payment method data
   */
  decryptPaymentMethod(encryptedData: EncryptedData): any {
    const decryptedData = this.decrypt(encryptedData);
    return JSON.parse(decryptedData);
  }

  /**
   * Encrypt customer billing address
   */
  encryptBillingAddress(address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }): EncryptedData {
    const sensitiveData = JSON.stringify(address);
    return this.encrypt(sensitiveData);
  }

  /**
   * Decrypt customer billing address
   */
  decryptBillingAddress(encryptedData: EncryptedData): any {
    const decryptedData = this.decrypt(encryptedData);
    return JSON.parse(decryptedData);
  }

  /**
   * Encrypt tax information
   */
  encryptTaxInfo(taxInfo: {
    taxId?: string;
    taxIdType?: string;
    businessType?: string;
    vatNumber?: string;
  }): EncryptedData {
    const sensitiveData = JSON.stringify(taxInfo);
    return this.encrypt(sensitiveData);
  }

  /**
   * Decrypt tax information
   */
  decryptTaxInfo(encryptedData: EncryptedData): any {
    const decryptedData = this.decrypt(encryptedData);
    return JSON.parse(decryptedData);
  }

  /**
   * Securely mask sensitive data for display
   */
  maskSensitiveData(data: string, type: 'card' | 'ssn' | 'account' | 'email' = 'card'): string {
    if (!data || data.length < 4) {
      return '****';
    }

    switch (type) {
      case 'card':
        // Show last 4 digits of card number
        return '**** **** **** ' + data.slice(-4);
      
      case 'ssn':
        // Show last 4 digits of SSN
        return '***-**-' + data.slice(-4);
      
      case 'account':
        // Show last 4 digits of account number
        return '****' + data.slice(-4);
      
      case 'email':
        // Show first character and domain
        const [local, domain] = data.split('@');
        if (!domain) return '****@****.***';
        return local.charAt(0) + '***@' + domain;
      
      default:
        return '****' + data.slice(-4);
    }
  }

  /**
   * Generate secure random token for billing operations
   */
  generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Validate encryption key strength
   */
  static validateEncryptionKey(key: string): {
    valid: boolean;
    errors: string[];
    strength: 'weak' | 'medium' | 'strong';
  } {
    const errors: string[] = [];
    let strength: 'weak' | 'medium' | 'strong' = 'weak';

    // Check length
    if (key.length < 64) {
      errors.push('Key must be at least 64 hex characters (32 bytes)');
    }

    // Check if it's valid hex
    if (!/^[0-9a-fA-F]+$/.test(key)) {
      errors.push('Key must be valid hexadecimal');
    }

    // Check for patterns (simple check)
    if (key.includes('0000') || key.includes('1111') || key.includes('ffff')) {
      errors.push('Key contains suspicious patterns');
      strength = 'weak';
    } else if (key.length >= 64) {
      strength = 'strong';
    } else {
      strength = 'medium';
    }

    return {
      valid: errors.length === 0,
      errors,
      strength,
    };
  }

  /**
   * Generate new encryption key
   */
  static generateEncryptionKey(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Rotate encryption key (re-encrypt data with new key)
   */
  async rotateEncryptionKey(
    oldEncryptedData: EncryptedData,
    newMasterKey: Buffer
  ): Promise<EncryptedData> {
    try {
      // Decrypt with old key
      const decryptedData = this.decrypt(oldEncryptedData);

      // Create new service instance with new key
      const oldMasterKey = this.masterKey;
      this.masterKey = newMasterKey;

      // Encrypt with new key
      const newEncryptedData = this.encrypt(decryptedData);

      // Restore old key
      this.masterKey = oldMasterKey;

      return newEncryptedData;

    } catch (error) {
      logger.error("Key rotation failed:", error instanceof Error ? error : new Error(String(error)));
      throw new Error('Failed to rotate encryption key');
    }
  }

  /**
   * Secure data deletion (overwrite memory)
   */
  secureDelete(data: string | Buffer): void {
    if (typeof data === 'string') {
      // Overwrite string memory (limited effectiveness in JavaScript)
      for (let i = 0; i < data.length; i++) {
        data = data.substring(0, i) + '0' + data.substring(i + 1);
      }
    } else if (Buffer.isBuffer(data)) {
      // Overwrite buffer memory
      data.fill(0);
    }
  }

  /**
   * Verify data integrity
   */
  verifyIntegrity(encryptedData: EncryptedData, expectedHash?: string): boolean {
    try {
      // Decrypt data
      const decryptedData = this.decrypt(encryptedData);
      
      if (expectedHash) {
        // Verify against expected hash
        const actualHash = this.hash(decryptedData);
        return actualHash === expectedHash;
      }

      // If no expected hash, just verify decryption succeeded
      return true;

    } catch (error) {
      return false;
    }
  }

  /**
   * Create encrypted backup of billing data
   */
  createEncryptedBackup(data: Record<string, any>): {
    backup: EncryptedData;
    checksum: string;
    timestamp: string;
  } {
    const serializedData = JSON.stringify(data);
    const backup = this.encrypt(serializedData);
    const checksum = this.hash(serializedData);
    
    return {
      backup,
      checksum,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Restore from encrypted backup
   */
  restoreFromBackup(backup: {
    backup: EncryptedData;
    checksum: string;
    timestamp: string;
  }): Record<string, any> {
    const decryptedData = this.decrypt(backup.backup);
    const actualChecksum = this.hash(decryptedData);
    
    if (actualChecksum !== backup.checksum) {
      throw new Error('Backup integrity check failed');
    }
    
    return JSON.parse(decryptedData);
  }
}

// Export singleton instance
export const billingEncryptionService = new BillingEncryptionService();