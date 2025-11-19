#!/usr/bin/env ts-node

/**
 * AWS S3 File Management Script
 * 
 * This script provides AWS S3 file operations including
 * backup, restore, validation, and management utilities.
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const access = promisify(fs.access);

interface S3Config {
  region: string;
  bucketName: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  useIAM?: boolean;
}

interface FileMetadata {
  key: string;
  size: number;
  etag: string;
  lastModified: string;
  contentType?: string;
  checksum?: string;
}

interface S3OperationResult {
  success: boolean;
  message: string;
  details?: any;
}

interface S3ValidationResult {
  valid: boolean;
  issues: string[];
  summary: {
    totalFiles: number;
    totalSize: number;
    corruptedFiles: number;
    missingFiles: number;
  };
}

class S3Manager {
  private s3Client: S3Client;
  private config: S3Config;

  constructor(config: S3Config) {
    this.config = config;
    
    const clientConfig: any = {
      region: config.region,
    };

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    this.s3Client = new S3Client(clientConfig);
  }

  async listFiles(prefix?: string): Promise<FileMetadata[]> {
    console.log(`📂 Listing files${prefix ? ` with prefix "${prefix}"` : ''}...`);

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        Prefix: prefix,
      });

      const response = await this.s3Client.send(command);
      const files: FileMetadata[] = [];

      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key && item.Size && item.ETag && item.LastModified) {
            files.push({
              key: item.Key,
              size: item.Size,
              etag: item.ETag,
              lastModified: item.LastModified.toISOString(),
            });
          }
        }
      }

      console.log(`✅ Found ${files.length} files`);
      return files;
    } catch (error) {
      console.error('❌ Failed to list files:', error);
      throw error;
    }
  }

  async downloadFile(key: string, localPath: string): Promise<S3OperationResult> {
    console.log(`📥 Downloading ${key} to ${localPath}...`);

    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        throw new Error('No file content received');
      }

      // Ensure directory exists
      const dir = path.dirname(localPath);
      await this.ensureDirectoryExists(dir);

      // Write file
      const fileContent = await response.Body.transformToByteArray();
      await writeFile(localPath, Buffer.from(fileContent));

      console.log(`✅ Downloaded ${key} successfully`);
      return {
        success: true,
        message: `File ${key} downloaded successfully`,
        details: { localPath, size: fileContent.length }
      };
    } catch (error) {
      console.error(`❌ Failed to download ${key}:`, error);
      return {
        success: false,
        message: `Failed to download ${key}: ${error.message}`,
      };
    }
  }

  async uploadFile(localPath: string, key: string, contentType?: string): Promise<S3OperationResult> {
    console.log(`📤 Uploading ${localPath} to ${key}...`);

    try {
      // Read file
      const fileContent = await readFile(localPath);
      
      // Determine content type
      const actualContentType = contentType || this.guessContentType(key);

      const command = new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
        Body: fileContent,
        ContentType: actualContentType,
      });

      const response = await this.s3Client.send(command);

      console.log(`✅ Uploaded ${key} successfully`);
      return {
        success: true,
        message: `File ${key} uploaded successfully`,
        details: { 
          etag: response.ETag,
          size: fileContent.length,
          contentType: actualContentType
        }
      };
    } catch (error) {
      console.error(`❌ Failed to upload ${key}:`, error);
      return {
        success: false,
        message: `Failed to upload ${key}: ${error.message}`,
      };
    }
  }

  async deleteFile(key: string): Promise<S3OperationResult> {
    console.log(`🗑️ Deleting ${key}...`);

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);

      console.log(`✅ Deleted ${key} successfully`);
      return {
        success: true,
        message: `File ${key} deleted successfully`,
      };
    } catch (error) {
      console.error(`❌ Failed to delete ${key}:`, error);
      return {
        success: false,
        message: `Failed to delete ${key}: ${error.message}`,
      };
    }
  }

  async validateFile(key: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      
      if (!response.ContentLength || !response.ETag) {
        return { valid: false, error: 'Missing metadata' };
      }

      // Check if file can be downloaded
      const downloadCommand = new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });

      const downloadResponse = await this.s3Client.send(downloadCommand);
      
      if (!downloadResponse.Body) {
        return { valid: false, error: 'Cannot read file content' };
      }

      // Verify file size
      const content = await downloadResponse.Body.transformToByteArray();
      if (content.length !== response.ContentLength) {
        return { valid: false, error: 'Size mismatch' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async validateAllFiles(): Promise<S3ValidationResult> {
    console.log('🔍 Validating all files...');

    const issues: string[] = [];
    const files = await this.listFiles();
    
    let corruptedFiles = 0;
    let totalSize = 0;

    for (const file of files) {
      totalSize += file.size;
      const validation = await this.validateFile(file.key);
      
      if (!validation.valid) {
        corruptedFiles++;
        issues.push(`Corrupted file: ${file.key} - ${validation.error}`);
      }
    }

    const summary = {
      totalFiles: files.length,
      totalSize,
      corruptedFiles,
      missingFiles: 0,
    };

    const valid = corruptedFiles === 0;

    if (valid) {
      console.log('✅ All files validated successfully');
    } else {
      console.log(`⚠️ Validation found issues: ${corruptedFiles} corrupted files`);
    }

    return {
      valid,
      issues,
      summary
    };
  }

  async backupBucket(backupDir: string): Promise<S3OperationResult> {
    console.log(`💾 Backing up bucket to ${backupDir}...`);

    try {
      const files = await this.listFiles();
      const backupManifest: FileMetadata[] = [];

      // Ensure backup directory exists
      await this.ensureDirectoryExists(backupDir);

      // Download all files
      for (const file of files) {
        const localPath = path.join(backupDir, file.key);
        const result = await this.downloadFile(file.key, localPath);
        
        if (result.success) {
          backupManifest.push(file);
        } else {
          issues.push(`Failed to backup ${file.key}: ${result.message}`);
        }
      }

      // Save manifest
      const manifestPath = path.join(backupDir, 'manifest.json');
      await writeFile(manifestPath, JSON.stringify({
        bucket: this.config.bucketName,
        region: this.config.region,
        backupDate: new Date().toISOString(),
        files: backupManifest,
        totalFiles: backupManifest.length,
        totalSize: backupManifest.reduce((sum, file) => sum + file.size, 0)
      }, null, 2));

      console.log(`✅ Backup completed: ${backupManifest.length} files`);
      return {
        success: true,
        message: `Bucket backup completed successfully`,
        details: { 
          backupDir,
          filesBackedUp: backupManifest.length,
          totalSize: backupManifest.reduce((sum, file) => sum + file.size, 0)
        }
      };
    } catch (error) {
      console.error('❌ Backup failed:', error);
      return {
        success: false,
        message: `Backup failed: ${error.message}`,
      };
    }
  }

  async restoreBucket(backupDir: string, dryRun: boolean = false): Promise<S3OperationResult> {
    console.log(`🔄 Restoring bucket from ${backupDir}${dryRun ? ' (dry run)' : ''}...`);

    try {
      const manifestPath = path.join(backupDir, 'manifest.json');
      
      // Check if manifest exists
      try {
        await access(manifestPath);
      } catch {
        throw new Error('Manifest file not found in backup directory');
      }

      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      const files = manifest.files as FileMetadata[];

      let restoredCount = 0;
      let skippedCount = 0;

      for (const file of files) {
        const localPath = path.join(backupDir, file.key);
        
        try {
          await access(localPath);
        } catch {
          console.warn(`⚠️ File not found in backup: ${file.key}`);
          continue;
        }

        if (!dryRun) {
          const result = await this.uploadFile(localPath, file.key);
          if (result.success) {
            restoredCount++;
          } else {
            console.error(`❌ Failed to restore ${file.key}: ${result.message}`);
          }
        } else {
          skippedCount++;
        }
      }

      const message = dryRun 
        ? `Dry run completed: ${skippedCount} files would be restored`
        : `Restore completed: ${restoredCount} files restored`;

      console.log(`✅ ${message}`);
      return {
        success: true,
        message,
        details: { 
          filesProcessed: files.length,
          restoredCount,
          skippedCount,
          dryRun
        }
      };
    } catch (error) {
      console.error('❌ Restore failed:', error);
      return {
        success: false,
        message: `Restore failed: ${error.message}`,
      };
    }
  }

  async generateReport(outputPath: string): Promise<S3OperationResult> {
    console.log('📊 Generating S3 report...');

    try {
      const files = await this.listFiles();
      const validation = await this.validateAllFiles();

      const report = {
        bucket: this.config.bucketName,
        region: this.config.region,
        generatedAt: new Date().toISOString(),
        summary: {
          totalFiles: files.length,
          totalSize: files.reduce((sum, file) => sum + file.size, 0),
          sizeFormatted: this.formatBytes(files.reduce((sum, file) => sum + file.size, 0)),
        },
        validation,
        files: files.map(file => ({
          ...file,
          sizeFormatted: this.formatBytes(file.size),
        })),
        usageByExtension: this.groupByExtension(files),
        usageByPrefix: this.groupByPrefix(files),
      };

      await writeFile(outputPath, JSON.stringify(report, null, 2));

      console.log(`✅ Report generated: ${outputPath}`);
      return {
        success: true,
        message: `Report generated successfully`,
        details: { outputPath }
      };
    } catch (error) {
      console.error('❌ Report generation failed:', error);
      return {
        success: false,
        message: `Report generation failed: ${error.message}`,
      };
    }
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await access(dir);
    } catch {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }

  private guessContentType(key: string): string {
    const ext = key.toLowerCase().split('.').pop() || '';
    const mimeTypes: Record<string, string> = {
      'txt': 'text/plain',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'zip': 'application/zip',
      'json': 'application/json',
      'xml': 'application/xml',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private groupByExtension(files: FileMetadata[]): Record<string, { count: number; size: number }> {
    const groups: Record<string, { count: number; size: number }> = {};
    
    for (const file of files) {
      const ext = file.key.split('.').pop()?.toLowerCase() || 'unknown';
      if (!groups[ext]) {
        groups[ext] = { count: 0, size: 0 };
      }
      groups[ext].count++;
      groups[ext].size += file.size;
    }

    return groups;
  }

  private groupByPrefix(files: FileMetadata[]): Record<string, { count: number; size: number }> {
    const groups: Record<string, { count: number; size: number }> = {};
    
    for (const file of files) {
      const parts = file.key.split('/');
      const prefix = parts.length > 1 ? parts[0] + '/' : 'root/';
      
      if (!groups[prefix]) {
        groups[prefix] = { count: 0, size: 0 };
      }
      groups[prefix].count++;
      groups[prefix].size += file.size;
    }

    return groups;
  }
}

// Configuration
const s3Config: S3Config = {
  region: process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1',
  bucketName: process.env.S3_BUCKET_NAME || process.env.VITE_AWS_S3_BUCKET || 'hallucifix-documents-prod',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  useIAM: !process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_SECRET_ACCESS_KEY
};

// CLI interface
async function main() {
  const command = process.argv[2];
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];
  const arg3 = process.argv[5];

  const manager = new S3Manager(s3Config);

  try {
    switch (command) {
      case 'list':
        const files = await manager.listFiles(arg1);
        console.log(JSON.stringify(files, null, 2));
        break;

      case 'download':
        if (!arg1 || !arg2) {
          console.log('Usage: download <s3-key> <local-path>');
          process.exit(1);
        }
        const downloadResult = await manager.downloadFile(arg1, arg2);
        console.log(JSON.stringify(downloadResult, null, 2));
        break;

      case 'upload':
        if (!arg1 || !arg2) {
          console.log('Usage: upload <local-path> <s3-key> [content-type]');
          process.exit(1);
        }
        const uploadResult = await manager.uploadFile(arg1, arg2, arg3);
        console.log(JSON.stringify(uploadResult, null, 2));
        break;

      case 'delete':
        if (!arg1) {
          console.log('Usage: delete <s3-key>');
          process.exit(1);
        }
        const deleteResult = await manager.deleteFile(arg1);
        console.log(JSON.stringify(deleteResult, null, 2));
        break;

      case 'validate':
        if (arg1) {
          const fileValidation = await manager.validateFile(arg1);
          console.log(JSON.stringify(fileValidation, null, 2));
        } else {
          const allValidation = await manager.validateAllFiles();
          console.log(JSON.stringify(allValidation, null, 2));
        }
        break;

      case 'backup':
        if (!arg1) {
          console.log('Usage: backup <backup-directory>');
          process.exit(1);
        }
        const backupResult = await manager.backupBucket(arg1);
        console.log(JSON.stringify(backupResult, null, 2));
        break;

      case 'restore':
        if (!arg1) {
          console.log('Usage: restore <backup-directory> [dry-run]');
          process.exit(1);
        }
        const dryRun = arg2 === 'dry-run';
        const restoreResult = await manager.restoreBucket(arg1, dryRun);
        console.log(JSON.stringify(restoreResult, null, 2));
        break;

      case 'report':
        const outputPath = arg1 || './s3-report.json';
        const reportResult = await manager.generateReport(outputPath);
        console.log(JSON.stringify(reportResult, null, 2));
        break;

      default:
        console.log('Available commands:');
        console.log('  list [prefix]                    - List files in bucket');
        console.log('  download <key> <path>            - Download file from S3');
        console.log('  upload <path> <key> [type]       - Upload file to S3');
        console.log('  delete <key>                    - Delete file from S3');
        console.log('  validate [key]                   - Validate files');
        console.log('  backup <directory>               - Backup all files');
        console.log('  restore <directory> [dry-run]    - Restore from backup');
        console.log('  report [output-path]             - Generate usage report');
    }

  } catch (error) {
    console.error('❌ Operation failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { S3Manager, S3Config, FileMetadata, S3OperationResult, S3ValidationResult };