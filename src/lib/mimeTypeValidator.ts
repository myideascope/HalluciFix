export interface MimeTypeInfo {
  type: string;
  category: 'document' | 'spreadsheet' | 'presentation' | 'image' | 'pdf' | 'text' | 'archive' | 'other';
  extensions: string[];
  description: string;
  isGoogleWorkspace: boolean;
  canExport: boolean;
  exportFormats?: string[];
  maxRecommendedSize?: number; // in bytes
  processingComplexity: 'low' | 'medium' | 'high';
}

class MimeTypeValidator {
  private readonly mimeTypeMap: Map<string, MimeTypeInfo> = new Map();

  constructor() {
    this.initializeMimeTypes();
  }

  private initializeMimeTypes() {
    const mimeTypes: Array<[string, MimeTypeInfo]> = [
      // Text files
      ['text/plain', {
        type: 'text/plain',
        category: 'text',
        extensions: ['.txt'],
        description: 'Plain Text',
        isGoogleWorkspace: false,
        canExport: false,
        maxRecommendedSize: 50 * 1024 * 1024, // 50MB
        processingComplexity: 'low'
      }],
      ['text/csv', {
        type: 'text/csv',
        category: 'spreadsheet',
        extensions: ['.csv'],
        description: 'Comma-Separated Values',
        isGoogleWorkspace: false,
        canExport: false,
        maxRecommendedSize: 100 * 1024 * 1024, // 100MB
        processingComplexity: 'low'
      }],
      ['text/markdown', {
        type: 'text/markdown',
        category: 'text',
        extensions: ['.md', '.markdown'],
        description: 'Markdown',
        isGoogleWorkspace: false,
        canExport: false,
        maxRecommendedSize: 10 * 1024 * 1024, // 10MB
        processingComplexity: 'low'
      }],
      ['text/html', {
        type: 'text/html',
        category: 'text',
        extensions: ['.html', '.htm'],
        description: 'HTML Document',
        isGoogleWorkspace: false,
        canExport: false,
        maxRecommendedSize: 20 * 1024 * 1024, // 20MB
        processingComplexity: 'medium'
      }],

      // Google Workspace files
      ['application/vnd.google-apps.document', {
        type: 'application/vnd.google-apps.document',
        category: 'document',
        extensions: [],
        description: 'Google Docs',
        isGoogleWorkspace: true,
        canExport: true,
        exportFormats: [
          'text/plain',
          'text/html',
          'application/rtf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/pdf'
        ],
        maxRecommendedSize: 50 * 1024 * 1024, // 50MB
        processingComplexity: 'medium'
      }],
      ['application/vnd.google-apps.spreadsheet', {
        type: 'application/vnd.google-apps.spreadsheet',
        category: 'spreadsheet',
        extensions: [],
        description: 'Google Sheets',
        isGoogleWorkspace: true,
        canExport: true,
        exportFormats: [
          'text/csv',
          'text/tab-separated-values',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/pdf'
        ],
        maxRecommendedSize: 100 * 1024 * 1024, // 100MB
        processingComplexity: 'medium'
      }],
      ['application/vnd.google-apps.presentation', {
        type: 'application/vnd.google-apps.presentation',
        category: 'presentation',
        extensions: [],
        description: 'Google Slides',
        isGoogleWorkspace: true,
        canExport: true,
        exportFormats: [
          'text/plain',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/pdf',
          'image/png',
          'image/jpeg'
        ],
        maxRecommendedSize: 200 * 1024 * 1024, // 200MB
        processingComplexity: 'high'
      }],
      ['application/vnd.google-apps.drawing', {
        type: 'application/vnd.google-apps.drawing',
        category: 'image',
        extensions: [],
        description: 'Google Drawings',
        isGoogleWorkspace: true,
        canExport: true,
        exportFormats: [
          'image/png',
          'image/jpeg',
          'image/svg+xml',
          'application/pdf'
        ],
        maxRecommendedSize: 50 * 1024 * 1024, // 50MB
        processingComplexity: 'medium'
      }],

      // Microsoft Office files
      ['application/msword', {
        type: 'application/msword',
        category: 'document',
        extensions: ['.doc'],
        description: 'Microsoft Word (Legacy)',
        isGoogleWorkspace: false,
        canExport: false,
        maxRecommendedSize: 50 * 1024 * 1024, // 50MB
        processingComplexity: 'high'
      }],
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        category: 'document',
        extensions: ['.docx'],
        description: 'Microsoft Word',
        isGoogleWorkspace: false,
        canExport: false,
        maxRecommendedSize: 50 * 1024 * 1024, // 50MB
        processingComplexity: 'high'
      }],
      ['application/vnd.ms-excel', {
        type: 'application/vnd.ms-excel',
        category: 'spreadsheet',
        extensions: ['.xls'],
        description: 'Microsoft Excel (Legacy)',
        isGoogleWorkspace: false,
        canExport: false,
        maxRecommendedSize: 100 * 1024 * 1024, // 100MB
        processingComplexity: 'high'
      }],
      ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        category: 'spreadsheet',
        extensions: ['.xlsx'],
        description: 'Microsoft Excel',
        isGoogleWorkspace: false,
        canExport: false,
        maxRecommendedSize: 100 * 1024 * 1024, // 100MB
        processingComplexity: 'high'
      }],

      // PDF
      ['application/pdf', {
        type: 'application/pdf',
        category: 'pdf',
        extensions: ['.pdf'],
        description: 'PDF Document',
        isGoogleWorkspace: false,
        canExport: false,
        maxRecommendedSize: 200 * 1024 * 1024, // 200MB
        processingComplexity: 'high'
      }],

      // Images
      ['image/png', {
        type: 'image/png',
        category: 'image',
        extensions: ['.png'],
        description: 'PNG Image',
        isGoogleWorkspace: false,
        canExport: false,
        maxRecommendedSize: 50 * 1024 * 1024, // 50MB
        processingComplexity: 'high'
      }],
      ['image/jpeg', {
        type: 'image/jpeg',
        category: 'image',
        extensions: ['.jpg', '.jpeg'],
        description: 'JPEG Image',
        isGoogleWorkspace: false,
        canExport: false,
        maxRecommendedSize: 50 * 1024 * 1024, // 50MB
        processingComplexity: 'high'
      }],

      // Other formats
      ['application/json', {
        type: 'application/json',
        category: 'text',
        extensions: ['.json'],
        description: 'JSON Data',
        isGoogleWorkspace: false,
        canExport: false,
        maxRecommendedSize: 20 * 1024 * 1024, // 20MB
        processingComplexity: 'low'
      }],
      ['application/xml', {
        type: 'application/xml',
        category: 'text',
        extensions: ['.xml'],
        description: 'XML Document',
        isGoogleWorkspace: false,
        canExport: false,
        maxRecommendedSize: 20 * 1024 * 1024, // 20MB
        processingComplexity: 'medium'
      }]
    ];

    mimeTypes.forEach(([mimeType, info]) => {
      this.mimeTypeMap.set(mimeType, info);
    });
  }

  /**
   * Get information about a MIME type
   */
  getMimeTypeInfo(mimeType: string): MimeTypeInfo | null {
    return this.mimeTypeMap.get(mimeType) || null;
  }

  /**
   * Check if a MIME type is supported
   */
  isSupported(mimeType: string): boolean {
    return this.mimeTypeMap.has(mimeType);
  }

  /**
   * Get all supported MIME types
   */
  getSupportedMimeTypes(): string[] {
    return Array.from(this.mimeTypeMap.keys());
  }

  /**
   * Get MIME types by category
   */
  getMimeTypesByCategory(category: MimeTypeInfo['category']): string[] {
    return Array.from(this.mimeTypeMap.entries())
      .filter(([, info]) => info.category === category)
      .map(([mimeType]) => mimeType);
  }

  /**
   * Validate file size against MIME type recommendations
   */
  validateFileSize(mimeType: string, sizeBytes: number): {
    valid: boolean;
    warning?: string;
    maxRecommended?: number;
  } {
    const info = this.getMimeTypeInfo(mimeType);
    if (!info) {
      return { valid: false };
    }

    if (info.maxRecommendedSize && sizeBytes > info.maxRecommendedSize) {
      return {
        valid: false,
        warning: `File size (${this.formatBytes(sizeBytes)}) exceeds recommended maximum (${this.formatBytes(info.maxRecommendedSize)}) for ${info.description}`,
        maxRecommended: info.maxRecommendedSize
      };
    }

    // Warn if file is large but still within limits
    if (info.maxRecommendedSize && sizeBytes > info.maxRecommendedSize * 0.8) {
      return {
        valid: true,
        warning: `Large file (${this.formatBytes(sizeBytes)}) - processing may be slow for ${info.description}`,
        maxRecommended: info.maxRecommendedSize
      };
    }

    return { valid: true };
  }

  /**
   * Get processing complexity estimate
   */
  getProcessingComplexity(mimeType: string): {
    complexity: 'low' | 'medium' | 'high';
    estimatedTimeMultiplier: number;
    description: string;
  } {
    const info = this.getMimeTypeInfo(mimeType);
    if (!info) {
      return {
        complexity: 'high',
        estimatedTimeMultiplier: 3,
        description: 'Unknown file type - high complexity assumed'
      };
    }

    const complexityMap = {
      low: {
        multiplier: 1,
        description: 'Fast processing - simple text extraction'
      },
      medium: {
        multiplier: 2,
        description: 'Moderate processing - format conversion required'
      },
      high: {
        multiplier: 4,
        description: 'Slow processing - complex format or OCR required'
      }
    };

    const complexity = complexityMap[info.processingComplexity];

    return {
      complexity: info.processingComplexity,
      estimatedTimeMultiplier: complexity.multiplier,
      description: complexity.description
    };
  }

  /**
   * Get the best export format for processing
   */
  getBestExportFormat(mimeType: string, preferredFormat?: string): string {
    const info = this.getMimeTypeInfo(mimeType);
    if (!info || !info.canExport || !info.exportFormats) {
      return mimeType; // Return original if no export options
    }

    // If preferred format is available, use it
    if (preferredFormat && info.exportFormats.includes(preferredFormat)) {
      return preferredFormat;
    }

    // Default preferences for different categories
    const categoryPreferences: Record<string, string> = {
      document: 'text/plain',
      spreadsheet: 'text/csv',
      presentation: 'text/plain',
      image: 'image/png'
    };

    const preferred = categoryPreferences[info.category];
    if (preferred && info.exportFormats.includes(preferred)) {
      return preferred;
    }

    // Return the first available export format
    return info.exportFormats[0];
  }

  /**
   * Detect MIME type from file extension
   */
  detectMimeTypeFromExtension(filename: string): string | null {
    const extension = this.getFileExtension(filename);
    if (!extension) return null;

    for (const [mimeType, info] of this.mimeTypeMap.entries()) {
      if (info.extensions.includes(extension)) {
        return mimeType;
      }
    }

    return null;
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string | null {
    const match = filename.match(/\.[^.]+$/);
    return match ? match[0].toLowerCase() : null;
  }

  /**
   * Format bytes for display
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get file type description for display
   */
  getFileTypeDescription(mimeType: string): string {
    const info = this.getMimeTypeInfo(mimeType);
    return info ? info.description : 'Unknown file type';
  }

  /**
   * Check if file requires special handling
   */
  requiresSpecialHandling(mimeType: string): {
    required: boolean;
    reasons: string[];
    recommendations: string[];
  } {
    const info = this.getMimeTypeInfo(mimeType);
    const reasons: string[] = [];
    const recommendations: string[] = [];

    if (!info) {
      reasons.push('Unknown file type');
      recommendations.push('Verify file format is supported');
      return { required: true, reasons, recommendations };
    }

    if (info.processingComplexity === 'high') {
      reasons.push('Complex file format');
      recommendations.push('Allow extra time for processing');
    }

    if (info.isGoogleWorkspace) {
      reasons.push('Google Workspace file requires export');
      recommendations.push('File will be converted to a standard format');
    }

    if (info.category === 'image') {
      reasons.push('Image file may require OCR');
      recommendations.push('Text extraction accuracy may vary');
    }

    if (info.category === 'pdf') {
      reasons.push('PDF may contain complex layouts');
      recommendations.push('Consider text-based PDFs for better results');
    }

    return {
      required: reasons.length > 0,
      reasons,
      recommendations
    };
  }
}

export const mimeTypeValidator = new MimeTypeValidator();