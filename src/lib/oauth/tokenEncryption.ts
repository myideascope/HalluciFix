/**
 * Token encryption service using AES-GCM for secure token storage
 */

import { EncryptionService } from './types';
import { supabase } from '../supabase';

export class TokenEncryptionService implements EncryptionService {
  private readonly algorithm = 'AES-GCM';
  private readonly keyLength = 256;
  private readonly ivLength = 12; // 96 bits for GCM

  /**
   * Encrypts data using AES-GCM encryption
   */
  async encrypt(data: string, key: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      
      const cryptoKey = await this.importKey(key);
      const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
      
      const encrypted = await crypto.subtle.encrypt(
        { name: this.algorithm, iv },
        cryptoKey,
        dataBuffer
      );

      // Combine IV and encrypted data
      const result = new Uint8Array(iv.length + encrypted.byteLength);
      result.set(iv);
      result.set(new Uint8Array(encrypted), iv.length);
      
      // Return base64 encoded result
      return btoa(String.fromCharCode(...result));
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypts data using AES-GCM decryption
   */
  async decrypt(encryptedData: string, key: string): Promise<string> {
    try {
      // Decode base64 data
      const data = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      );
      
      // Extract IV and encrypted data
      const iv = data.slice(0, this.ivLength);
      const encrypted = data.slice(this.ivLength);
      
      const cryptoKey = await this.importKey(key);
      
      const decrypted = await crypto.subtle.decrypt(
        { name: this.algorithm, iv },
        cryptoKey,
        encrypted
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generates a new encryption key
   */
  generateKey(): string {
    const array = new Uint8Array(32); // 256 bits
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
  }

  /**
   * Rotates encryption key for all tokens or specific user
   */
  async rotateKey(oldKey: string, newKey: string, userId?: string): Promise<void> {
    try {
      // Build query to get tokens that need key rotation
      let query = supabase
        .from('user_tokens')
        .select('id, user_id, encrypted_tokens');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: tokens, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(`Failed to fetch tokens for rotation: ${fetchError.message}`);
      }

      if (!tokens || tokens.length === 0) {
        return; // No tokens to rotate
      }

      // Process tokens in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < tokens.length; i += batchSize) {
        const batch = tokens.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (token) => {
          try {
            // Decrypt with old key
            const decryptedData = await this.decrypt(token.encrypted_tokens, oldKey);
            
            // Re-encrypt with new key
            const reencryptedData = await this.encrypt(decryptedData, newKey);
            
            // Update in database
            const { error: updateError } = await supabase
              .from('user_tokens')
              .update({ 
                encrypted_tokens: reencryptedData,
                updated_at: new Date().toISOString()
              })
              .eq('id', token.id);

            if (updateError) {
              console.error(`Failed to rotate key for token ${token.id}:`, updateError);
            }
          } catch (error) {
            console.error(`Failed to process token ${token.id} during key rotation:`, error);
          }
        }));
      }
    } catch (error) {
      throw new Error(`Key rotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Imports a key for use with Web Crypto API
   */
  private async importKey(key: string): Promise<CryptoKey> {
    try {
      // Decode base64 key
      const keyData = new Uint8Array(
        atob(key).split('').map(char => char.charCodeAt(0))
      );
      
      return await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: this.algorithm },
        false,
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      throw new Error(`Key import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validates that a key is properly formatted
   */
  validateKey(key: string): boolean {
    try {
      const keyData = atob(key);
      return keyData.length === 32; // 256 bits
    } catch {
      return false;
    }
  }
}