# S3 File Upload Implementation Guide

This guide covers the implementation of direct S3 file uploads, replacing Supabase storage with AWS S3 and Lambda-based file processing.

## Overview

The S3 file upload system provides:
- **Direct S3 Uploads**: Files are uploaded directly to S3 using presigned URLs
- **Lambda Processing**: Server-side file processing using AWS Lambda
- **Text Extraction**: Automatic text extraction from PDFs and documents
- **Metadata Analysis**: Content analysis and metadata extraction
- **Progress Tracking**: Real-time upload progress and status updates

## Architecture

```
Frontend → S3 (Direct Upload) → Lambda (Processing) → Database (Metadata)
```

### Components

1. **S3Service** (`src/lib/storage/s3Service.ts`)
   - Direct S3 operations (upload, download, delete)
   - Presigned URL generation
   - File metadata management

2. **FileUploadService** (`src/lib/storage/fileUploadService.ts`)
   - High-level file upload orchestration
   - Text extraction and validation
   - User permission management

3. **S3FileProcessor** (`src/lib/storage/s3FileProcessor.ts`)
   - Client-side file processing
   - Content extraction and analysis
   - Batch processing capabilities

4. **LambdaFileProcessor** (`src/lib/storage/lambdaFileProcessor.ts`)
   - Server-side Lambda integration
   - Async processing with status tracking
   - API Gateway communication

5. **useFileUpload Hook** (`src/hooks/useFileUpload.ts`)
   - React hook for file upload state management
   - Progress tracking and error handling
   - Integration with authentication

## Configuration

### Environment Variables

```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=us-east-1

# S3 Configuration
S3_BUCKET_NAME=hallucifix-documents
VITE_S3_BUCKET_NAME=hallucifix-documents
VITE_AWS_REGION=us-east-1

# API Configuration
VITE_API_URL=https://api.hallucifix.com

# File Upload Settings
MAX_FILE_SIZE=52428800  # 50MB
ALLOWED_FILE_TYPES=text/plain,text/markdown,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document
PRESIGNED_URL_EXPIRY=3600  # 1 hour
```

### S3 Bucket Configuration

The S3 bucket should be configured with:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowDirectUploads",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT:role/HallucifixUserRole"
      },
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::hallucifix-documents/uploads/${cognito-identity.amazonaws.com:sub}/*"
    }
  ]
}
```

### CORS Configuration

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["https://app.hallucifix.com", "http://localhost:3000"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## Usage Examples

### Basic File Upload

```typescript
import { useFileUpload } from '../hooks/useFileUpload';

function FileUploadComponent() {
  const { uploadFile, uploadState } = useFileUpload({
    extractText: true,
    maxSize: 50 * 1024 * 1024, // 50MB
    onSuccess: (result) => {
      console.log('Upload successful:', result);
    },
    onError: (error) => {
      console.error('Upload failed:', error);
    }
  });

  const handleFileSelect = async (file: File) => {
    const result = await uploadFile(file);
    if (result) {
      console.log('File uploaded:', result.url);
      console.log('Extracted text:', result.content);
    }
  };

  return (
    <div>
      <input 
        type="file" 
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
      />
      {uploadState.isUploading && (
        <div>Progress: {uploadState.progress}%</div>
      )}
      {uploadState.error && (
        <div>Error: {uploadState.error}</div>
      )}
    </div>
  );
}
```

### Presigned URL Upload

```typescript
import { useFileUpload } from '../hooks/useFileUpload';

function PresignedUploadComponent() {
  const { generatePresignedUpload, processUploadedFile } = useFileUpload();

  const handlePresignedUpload = async (file: File) => {
    // Generate presigned URL
    const { uploadUrl, fileKey, uploadId } = await generatePresignedUpload(
      file.name,
      file.type
    );

    // Upload directly to S3
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type
      }
    });

    if (response.ok) {
      // Process the uploaded file
      const result = await processUploadedFile(fileKey, uploadId);
      console.log('File processed:', result);
    }
  };

  return (
    <input 
      type="file" 
      onChange={(e) => e.target.files?.[0] && handlePresignedUpload(e.target.files[0])}
    />
  );
}
```

### Lambda Processing

```typescript
import { useFileUpload } from '../hooks/useFileUpload';

function LambdaProcessingComponent() {
  const { processWithLambda } = useFileUpload();

  const handleLambdaProcessing = async (fileKey: string) => {
    try {
      const result = await processWithLambda(fileKey, 'hallucifix-documents');
      
      console.log('Processing result:', {
        content: result.content,
        metadata: result.metadata,
        processingTime: result.processingTime
      });
    } catch (error) {
      console.error('Lambda processing failed:', error);
    }
  };

  return (
    <button onClick={() => handleLambdaProcessing('uploads/user123/document.pdf')}>
      Process with Lambda
    </button>
  );
}
```

### Enhanced S3 Upload Component

```typescript
import { S3FileUpload } from '../components/S3FileUpload';

function EnhancedUploadPage() {
  const handleUploadComplete = (results: FileUploadResult[]) => {
    console.log('All uploads completed:', results);
    
    // Process results
    results.forEach(result => {
      if (result.content) {
        // Use extracted text content
        console.log(`Text from ${result.filename}:`, result.content);
      }
    });
  };

  return (
    <S3FileUpload
      maxFiles={5}
      maxFileSize={50 * 1024 * 1024}
      allowedTypes={[
        'application/pdf',
        'text/plain',
        'application/msword'
      ]}
      extractText={true}
      showPreview={true}
      onUploadComplete={handleUploadComplete}
      onUploadError={(error) => console.error('Upload error:', error)}
    />
  );
}
```

## File Processing

### Supported File Types

- **Text Files**: `.txt`, `.md`, `.csv`
- **PDF Documents**: `.pdf` (with text extraction)
- **Word Documents**: `.doc`, `.docx` (basic support)
- **JSON Files**: `.json`

### Text Extraction

Text extraction is performed both client-side and server-side:

#### Client-Side (Browser)
- Immediate processing for small files
- PDF.js for PDF text extraction
- FileReader API for text files

#### Server-Side (Lambda)
- Heavy processing for large files
- Advanced PDF processing
- OCR capabilities (future enhancement)
- Metadata extraction

### Processing Pipeline

1. **Upload**: File uploaded to S3 with metadata
2. **Validation**: File type and size validation
3. **Processing**: Text extraction and analysis
4. **Storage**: Metadata stored in database
5. **Notification**: User notified of completion

## Security

### Access Control

- **User Isolation**: Files stored in user-specific S3 prefixes
- **Presigned URLs**: Time-limited access to S3 objects
- **Authentication**: All API calls require valid JWT tokens
- **Authorization**: Users can only access their own files

### File Validation

- **Type Checking**: MIME type validation
- **Size Limits**: Configurable file size limits
- **Content Scanning**: Malware scanning (future enhancement)
- **Rate Limiting**: Upload rate limiting per user

### Data Protection

- **Encryption**: S3 server-side encryption (AES-256)
- **Transit Security**: HTTPS for all communications
- **Access Logging**: All file operations logged
- **Retention Policies**: Automatic cleanup of old files

## Monitoring and Analytics

### Metrics Tracked

- Upload success/failure rates
- Processing times
- File type distribution
- Storage usage per user
- Error rates and types

### CloudWatch Integration

```typescript
// Example metrics
const metrics = {
  'FileUpload/Success': 1,
  'FileUpload/ProcessingTime': processingTime,
  'FileUpload/FileSize': fileSize,
  'FileUpload/FileType': contentType
};
```

### Alerts

- High error rates
- Processing timeouts
- Storage quota exceeded
- Unusual upload patterns

## Performance Optimization

### Upload Optimization

- **Multipart Uploads**: For files > 100MB
- **Parallel Processing**: Multiple files processed concurrently
- **Compression**: Client-side compression for text files
- **CDN Integration**: CloudFront for faster uploads

### Processing Optimization

- **Lambda Concurrency**: Configurable concurrent executions
- **Memory Allocation**: Optimized Lambda memory settings
- **Caching**: Processed content caching
- **Batch Processing**: Efficient batch operations

## Troubleshooting

### Common Issues

#### Upload Failures
```
Error: Upload failed with status 403
```
**Solution**: Check S3 bucket permissions and CORS configuration

#### Processing Timeouts
```
Error: Lambda function timed out
```
**Solution**: Increase Lambda timeout or optimize processing logic

#### Large File Issues
```
Error: File size exceeds maximum allowed
```
**Solution**: Implement multipart upload for large files

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm start
```

### Health Checks

```typescript
import { lambdaFileProcessor } from '../lib/storage/lambdaFileProcessor';

// Check if Lambda processing is available
const isAvailable = await lambdaFileProcessor.isAvailable();
console.log('Lambda processor available:', isAvailable);
```

## Migration from Supabase Storage

### Migration Steps

1. **Deploy S3 Infrastructure**: Set up S3 bucket and Lambda functions
2. **Update Environment Variables**: Configure S3 settings
3. **Test Upload Functionality**: Verify S3 uploads work
4. **Migrate Existing Files**: Copy files from Supabase to S3
5. **Update File References**: Update database file URLs
6. **Remove Supabase Storage**: Clean up old storage

### Migration Script

```bash
# Run migration script
npm run migrate:storage:supabase-to-s3

# Verify migration
npm run verify:storage:migration
```

## Best Practices

### Development

- Use local S3-compatible storage (MinIO) for development
- Implement comprehensive error handling
- Add progress indicators for user experience
- Use TypeScript for type safety

### Production

- Enable S3 versioning for file recovery
- Set up lifecycle policies for cost optimization
- Monitor storage costs and usage
- Implement automated backups

### Security

- Regularly rotate AWS credentials
- Use IAM roles instead of access keys
- Enable CloudTrail for audit logging
- Implement content scanning for malware

## Future Enhancements

- **OCR Processing**: Extract text from images and scanned PDFs
- **Video Processing**: Support for video file uploads
- **Real-time Collaboration**: Multi-user file editing
- **Advanced Analytics**: Content analysis and insights
- **Mobile SDK**: Native mobile app integration

## Support

For issues with S3 file uploads:
1. Check the troubleshooting section above
2. Review CloudWatch logs for Lambda functions
3. Verify S3 bucket permissions and CORS settings
4. Test with different file types and sizes