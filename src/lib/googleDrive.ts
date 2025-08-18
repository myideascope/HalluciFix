import { supabase } from './supabase';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink: string;
  parents?: string[];
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
  files: GoogleDriveFile[];
  folders: GoogleDriveFolder[];
}

class GoogleDriveService {
  private accessToken: string | null = null;

  async initialize() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.provider_token) {
      this.accessToken = session.provider_token;
      return true;
    }
    return false;
  }

  async listFiles(folderId: string = 'root', pageSize: number = 100): Promise<GoogleDriveFile[]> {
    if (!this.accessToken) {
      throw new Error('Google Drive not authenticated');
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents)',
        pageSize: pageSize.toString(),
        orderBy: 'modifiedTime desc'
      }),
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch files: ${response.statusText}`);
    }

    const data = await response.json();
    return data.files || [];
  }

  async getFolders(parentId: string = 'root'): Promise<GoogleDriveFolder[]> {
    if (!this.accessToken) {
      throw new Error('Google Drive not authenticated');
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id,name)',
        orderBy: 'name'
      }),
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch folders: ${response.statusText}`);
    }

    const data = await response.json();
    const folders: GoogleDriveFolder[] = [];

    for (const folder of data.files || []) {
      const files = await this.listFiles(folder.id);
      const subFolders = await this.getFolders(folder.id);
      
      folders.push({
        id: folder.id,
        name: folder.name,
        files,
        folders: subFolders
      });
    }

    return folders;
  }

  async downloadFile(fileId: string): Promise<string> {
    if (!this.accessToken) {
      throw new Error('Google Drive not authenticated');
    }

    // First, get file metadata to check if it's a Google Docs file
    const metadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!metadataResponse.ok) {
      throw new Error(`Failed to get file metadata: ${metadataResponse.statusText}`);
    }

    const metadata = await metadataResponse.json();
    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    // Handle Google Docs files by exporting them as plain text
    if (metadata.mimeType === 'application/vnd.google-apps.document') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    } else if (metadata.mimeType === 'application/vnd.google-apps.spreadsheet') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
    } else if (metadata.mimeType === 'application/vnd.google-apps.presentation') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    }

    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    // Return full file content without any character limits
    const fullContent = await response.text();
    return fullContent;
  }

  async searchFiles(query: string, mimeTypes?: string[]): Promise<GoogleDriveFile[]> {
    if (!this.accessToken) {
      throw new Error('Google Drive not authenticated');
    }

    let searchQuery = `name contains '${query}' and trashed=false`;
    
    if (mimeTypes && mimeTypes.length > 0) {
      const mimeTypeQuery = mimeTypes.map(type => `mimeType='${type}'`).join(' or ');
      searchQuery += ` and (${mimeTypeQuery})`;
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q: searchQuery,
        fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents)',
        pageSize: '50',
        orderBy: 'modifiedTime desc'
      }),
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to search files: ${response.statusText}`);
    }

    const data = await response.json();
    return data.files || [];
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  getSupportedMimeTypes(): string[] {
    return [
      'text/plain',
      'application/pdf',
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'text/csv',
      'text/markdown'
    ];
  }
}

export const googleDriveService = new GoogleDriveService();