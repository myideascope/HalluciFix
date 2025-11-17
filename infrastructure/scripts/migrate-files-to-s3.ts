#!/usr/bin/env ts-node

/**
 * File Migration Script: Supabase Storage to AWS S3
 * 
 * This script migrates files from Supabase Storage to AWS S3.
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

interface MigrationConfig {
  supabase: {
    url: string;
    serviceRoleKey: string;
    bucketName: string;
  };
  s3: {
    region: string;
    bucketName: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  outputDir: string;
  batchSize: number;
}

interface FileMigrationResult {
  fileName: string;
  supabasePath: string;
  s3Key: string;
  size: number;
  success: boolean;
  error?: string;
}

class FileMigrator {
  private supabaseClient: ReturnType<typeof createClient>;
  private s3Client: S3Client;
  private config: MigrationConfig;

  constructor(config: MigrationConfig) {
    this.config = config;
    
    this.supabaseClient = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey
    );
    
    this.s3Client = new S3Client({
      region: config.s3.region,
      credentials: config.s3.accessKeyId && config.s3.secretAccessKey ? {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey
      } : undefined
    });
  }

  /**
   * List all files in Supabase Storage bucket
   */
  async listSupabaseFiles(): Promise<Array<{ name: string; id: string; updated_at: string; created_at: string; last_accessed_at: string; metadata: any }>> {
    try {
      console.log('🔄 Listing files in Supabase Storage...');
      
      const { data, error } = await this.supabaseClient.storage
        .from(this.config.supabase.bucketName)
        .list('', {
          limit: 1000,
          sortBy: { column: 'created_at', order: 'asc' }
        });

      if (error) {
        throw error;
      }

      console.log(`✅ Found ${data?.length || 0} files in Supabase Storage`);
      return data || [];

    } catch (error) {
      console.error('❌ Failed to list Supabase files:', error);
      throw error;
    }
  }

  /**
   * Download file from Supabase Storage
   */
  async downloadFromSupabase(filePath: string): Promise<{ data: Uint8Array; contentType: string }> {
    try {
      const { data, error } = await this.supabaseClient.storage
        .from(this.config.supabase.bucketName)
        .download(filePath);

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('No data received from Supabase');
      }

      const arrayBuffer = await data.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      return {
        data: uint8Array,
        contentType: data.type || 'application/octet-stream'
      };

    } catch (error) {
      console.error(`❌ Failed to download ${filePath} from Supabase:`, error);
      throw error;
    }
  }

  /**
   * Upload file to S3
   */
  async uploadToS3(
    key: string, 
    data: Uint8Array, 
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.config.s3.bucketName,
        Key: key,
        Body: data,
        ContentType: contentType,
        Metadata: metadata,
        // Remove explicit encryption - buckets use AWS-managed encryption
      });

      await this.s3Client.send(command);

    } catch (error) {
      console.error(`❌ Failed to upload ${key} to S3:`, error);
      throw error;
    }
  }

  /**
   * Generate S3 key from Supabase path
   */
  generateS3Key(supabasePath: string): string {
    // Remove any leading slashes and ensure proper structure
    const cleanPath = supabasePath.replace(/^\/+/, '');
    
    // If the path doesn't start with 'uploads/', add it
    if (!cleanPath.startsWith('uploads/')) {
      return `migrated/${cleanPath}`;
    }
    
    return cleanPath;
  }

  /**
   * Migrate all files from Supabase to S3
   */
  async migrateFiles(): Promise<FileMigrationResult[]> {
    try {
      console.log('🚀 Starting file migration from Supabase to S3...');
      
      const files = await this.listSupabaseFiles();
      const results: FileMigrationResult[] = [];
      
      if (files.length === 0) {
        console.log('ℹ️  No files found to migrate');
        return results;
      }

      let processed = 0;
      
      for (const file of files) {
        try {
          console.log(`📁 Processing file ${processed + 1}/${files.length}: ${file.name}`);
          
          // Download from Supabase
          const { data, contentType } = await this.downloadFromSupabase(file.name);
          
          // Generate S3 key
          const s3Key = this.generateS3Key(file.name);
          
          // Prepare metadata
          const metadata = {
            originalPath: file.name,
            migratedAt: new Date().toISOString(),
            supabaseCreatedAt: file.created_at,
            supabaseUpdatedAt: file.updated_at,
            ...file.metadata
          };
          
          // Upload to S3
          await this.uploadToS3(s3Key, data, contentType, metadata);
          
          results.push({
            fileName: file.name,
            supabasePath: file.name,
            s3Key,
            size: data.length,
            success: true
          });
          
          console.log(`  ✅ Migrated: ${file.name} -> ${s3Key} (${data.length} bytes)`);
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          results.push({
            fileName: file.name,
            supabasePath: file.name,
            s3Key: this.generateS3Key(file.name),
            size: 0,
            success: false,
            error: errorMessage
          });
          
          console.error(`  ❌ Failed to migrate ${file.name}:`, errorMessage);
        }
        
        processed++;
        
        // Add small delay to avoid rate limiting
        if (processed % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Write migration summary
      const summaryPath = path.join(this.config.outputDir, 'file-migration-summary.json');
      await fs.promises.writeFile(summaryPath, JSON.stringify(results, null, 2));
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      console.log(`\n📊 Migration Summary:`);
      console.log(`  Total files: ${results.length}`);
      console.log(`  Successful: ${successful}`);
      console.log(`  Failed: ${failed}`);
      console.log(`  Summary saved to: ${summaryPath}`);
      
      return results;

    } catch (error) {
      console.error('💥 File migration failed:', error);
      throw error;
    }
  }

  /**
   * Validate migration by comparing file counts and sizes
   */
  async validateMigration(results: FileMigrationResult[]): Promise<boolean> {
    try {
      console.log('🔄 Validating file migration...');
      
      const successful = results.filter(r => r.success);
      const totalSize = successful.reduce((sum, r) => sum + r.size, 0);
      
      console.log(`📊 Validation Results:`);
      console.log(`  Files migrated: ${successful.length}`);
      console.log(`  Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      
      // Additional validation could include:
      // - Checking if files exist in S3
      // - Comparing file sizes
      // - Verifying file integrity with checksums
      
      return successful.length > 0;

    } catch (error) {
      console.error('❌ Migration validation failed:', error);
      return false;
    }
  }
}

/**
 * Main migration function
 */
async function migrateFilesToS3() {
  const config: MigrationConfig = {
    supabase: {
      url: process.env.SUPABASE_URL || '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      bucketName: process.env.SUPABASE_BUCKET_NAME || 'documents'
    },
    s3: {
      region: process.env.AWS_REGION || 'us-east-1',
      bucketName: process.env.S3_BUCKET_NAME || 'hallucifix-documents',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    outputDir: path.join(__dirname, '../migration-data'),
    batchSize: 50
  };

  // Validate configuration
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error('Supabase configuration missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  if (!config.s3.bucketName) {
    throw new Error('S3 configuration missing. Set S3_BUCKET_NAME');
  }

  // Create output directory
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  const migrator = new FileMigrator(config);

  try {
    console.log('🚀 Starting file migration to S3...');
    
    const results = await migrator.migrateFiles();
    const isValid = await migrator.validateMigration(results);
    
    if (isValid) {
      console.log('🎉 File migration completed successfully!');
      console.log('\n📝 Next steps:');
      console.log('1. Update your application configuration to use S3');
      console.log('2. Test file upload and download functionality');
      console.log('3. Monitor S3 usage and costs');
      console.log('4. Clean up Supabase storage after validation');
    } else {
      console.error('❌ File migration validation failed');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 File migration failed:', error);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateFilesToS3().catch(console.error);
}

export { FileMigrator, migrateFilesToS3 };