import React, { useState, useEffect } from 'react';
import { Folder, File, Search, RefreshCw, CheckCircle2, AlertCircle, Cloud, FolderOpen, Wifi, WifiOff } from 'lucide-react';
import { googleDriveService, GoogleDriveFile, GoogleDriveFolder, DriveError, DriveErrorType } from '../lib/googleDrive';
import { useAuth } from '../hooks/useAuth';

interface GoogleDrivePickerProps {
  onFilesSelected: (files: GoogleDriveFile[]) => void;
  onClose: () => void;
  multiSelect?: boolean;
  allowFolderSelection?: boolean;
}

const GoogleDrivePicker: React.FC<GoogleDrivePickerProps> = ({ 
  onFilesSelected, 
  onClose, 
  multiSelect = true,
  allowFolderSelection = false
}) => {
  const { user, isOAuthAvailable } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [folders, setFolders] = useState<GoogleDriveFolder[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<GoogleDriveFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string>('root');
  const [folderPath, setFolderPath] = useState<Array<{id: string, name: string}>>([
    { id: 'root', name: 'My Drive' }
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    isInBackoff: boolean;
    backoffEndsAt?: number;
    requestsRemaining: number;
  } | null>(null);

  useEffect(() => {
    initializeGoogleDrive();
  }, [user, isOAuthAvailable]);

  const initializeGoogleDrive = async () => {
    try {
      setLoading(true);
      setError('');
      
      if (!isOAuthAvailable) {
        setError('Google OAuth is not configured. Please contact your administrator.');
        setLoading(false);
        return;
      }

      if (!user) {
        setError('Please sign in to access Google Drive.');
        setLoading(false);
        return;
      }

      // Check if Google Drive service is available and authenticated
      const isAvailable = await googleDriveService.isAvailable();
      if (!isAvailable) {
        setError('Google Drive service is not configured.');
        setLoading(false);
        return;
      }

      const authenticated = await googleDriveService.isAuthenticated();
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        await loadFiles();
        updateRateLimitInfo();
      } else {
        setError('Google Drive authentication required. Please re-authenticate.');
      }
    } catch (error: any) {
      handleDriveError(error);
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async (folderId: string = 'root') => {
    try {
      setLoading(true);
      setError('');
      
      // Load files and folders from Google Drive API
      const [driveFiles, driveFolders] = await Promise.all([
        googleDriveService.listFiles(folderId, 50),
        googleDriveService.getFolders(folderId)
      ]);
      
      // Filter files to only show supported types
      const supportedMimeTypes = googleDriveService.getSupportedMimeTypes();
      const filteredFiles = driveFiles.filter(file => 
        supportedMimeTypes.some(type => file.mimeType.includes(type.split('/')[1]) || file.mimeType === type)
      );
      
      setFiles(filteredFiles);
      setFolders(driveFolders);
      updateRateLimitInfo();
    } catch (error: any) {
      handleDriveError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDriveError = (error: any) => {
    if (error instanceof DriveError) {
      switch (error.type) {
        case DriveErrorType.AUTHENTICATION_ERROR:
          setError('Authentication expired. Please re-authenticate with Google Drive.');
          setIsAuthenticated(false);
          break;
        case DriveErrorType.PERMISSION_ERROR:
          setError('Insufficient permissions. Please grant additional access to Google Drive.');
          break;
        case DriveErrorType.RATE_LIMIT_ERROR:
          setError(`Rate limit exceeded. ${error.retryAfter ? `Please wait ${error.retryAfter} seconds.` : 'Please try again later.'}`);
          updateRateLimitInfo();
          break;
        case DriveErrorType.FILE_NOT_FOUND:
          setError('The requested file or folder was not found.');
          break;
        case DriveErrorType.NETWORK_ERROR:
          setError('Network error. Please check your connection and try again.');
          break;
        default:
          setError(error.message || 'An unexpected error occurred.');
      }
    } else {
      setError(error.message || 'An unexpected error occurred.');
    }
  };

  const updateRateLimitInfo = () => {
    const rateLimitStatus = googleDriveService.getRateLimitStatus();
    setRateLimitInfo({
      isInBackoff: rateLimitStatus.isInBackoff,
      backoffEndsAt: rateLimitStatus.backoffEndsAt,
      requestsRemaining: rateLimitStatus.requestsRemaining
    });
  };

  const handleFolderClick = async (folder: GoogleDriveFolder) => {
    if (allowFolderSelection) {
      // Allow selecting entire folder
      const allFiles = await getAllFilesInFolder(folder);
      setSelectedFiles(prev => {
        const newSelection = [...prev];
        allFiles.forEach(file => {
          if (!newSelection.some(f => f.id === file.id)) {
            newSelection.push(file);
          }
        });
        return newSelection;
      });
    } else {
      // Navigate into folder
      setCurrentFolder(folder.id);
      setFolderPath(prev => [...prev, { id: folder.id, name: folder.name }]);
      await loadFiles(folder.id);
    }
  };

  const handleBreadcrumbClick = async (folderId: string, index: number) => {
    setCurrentFolder(folderId);
    setFolderPath(prev => prev.slice(0, index + 1));
    await loadFiles(folderId);
  };

  const getAllFilesInFolder = async (folder: GoogleDriveFolder): Promise<GoogleDriveFile[]> => {
    try {
      const files = await googleDriveService.listFiles(folder.id);
      const supportedMimeTypes = googleDriveService.getSupportedMimeTypes();
      return files.filter(file => 
        supportedMimeTypes.some(type => file.mimeType.includes(type.split('/')[1]) || file.mimeType === type)
      );
    } catch (error) {
      console.warn(`Failed to get files from folder ${folder.name}:`, error);
      return [];
    }
  };

  const handleFileSelect = (file: GoogleDriveFile) => {
    if (multiSelect) {
      setSelectedFiles(prev => {
        const isSelected = prev.some(f => f.id === file.id);
        if (isSelected) {
          return prev.filter(f => f.id !== file.id);
        } else {
          return [...prev, file];
        }
      });
    } else {
      setSelectedFiles([file]);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    try {
      setIsSearching(true);
      setError('');
      
      // Search files using Google Drive API
      const supportedMimeTypes = googleDriveService.getSupportedMimeTypes();
      const searchResults = await googleDriveService.searchFiles(searchQuery, supportedMimeTypes);
      
      setFiles(searchResults);
      setFolders([]);
      setCurrentFolder('search');
      setFolderPath([{ id: 'search', name: `Search: "${searchQuery}"` }]);
      updateRateLimitInfo();
      
      if (searchResults.length === 0) {
        setError(`No files found matching "${searchQuery}"`);
      } else {
        setError('');
      }
    } catch (error: any) {
      handleDriveError(error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleReturnToRoot = async () => {
    setCurrentFolder('root');
    setFolderPath([{ id: 'root', name: 'My Drive' }]);
    setSearchQuery('');
    await loadFiles('root');
  };

  const handleConfirmSelection = () => {
    onFilesSelected(selectedFiles);
    onClose();
  };

  const formatFileSize = (size?: string) => {
    if (!size) return 'Unknown size';
    const bytes = parseInt(size);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('folder')) return <Folder className="w-5 h-5 text-blue-600" />;
    if (mimeType.includes('document') || mimeType.includes('text')) return <File className="w-5 h-5 text-blue-600" />;
    if (mimeType.includes('spreadsheet')) return <File className="w-5 h-5 text-green-600" />;
    if (mimeType.includes('presentation')) return <File className="w-5 h-5 text-orange-600" />;
    return <File className="w-5 h-5 text-slate-600" />;
  };

  if (!isOAuthAvailable) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
          <div className="p-6 text-center">
            <WifiOff className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">Google Drive Not Available</h3>
            <p className="text-slate-600 mb-6">
              Google OAuth is not configured. Please contact your administrator to set up Google Drive integration.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
          <div className="p-6 text-center">
            <Cloud className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">Authentication Required</h3>
            <p className="text-slate-600 mb-6">
              Please sign in to access your Google Drive files.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
          <div className="p-6 text-center">
            <Cloud className="w-16 h-16 text-orange-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">Google Drive Access Required</h3>
            <p className="text-slate-600 mb-6">
              Your Google Drive authentication has expired or additional permissions are needed. Please re-authenticate to access your files.
            </p>
            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Redirect to re-authentication
                  window.location.href = '/auth/google';
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Re-authenticate
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">Select Files from Google Drive</h3>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="flex items-center space-x-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search files..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center space-x-2 text-sm">
            {folderPath.map((folder, index) => (
              <React.Fragment key={folder.id}>
                <button
                  onClick={() => handleBreadcrumbClick(folder.id, index)}
                  className="text-blue-600 hover:text-blue-700 transition-colors"
                >
                  {folder.name}
                </button>
                {index < folderPath.length - 1 && (
                  <span className="text-slate-400">/</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-96 overflow-y-auto">
          {/* Rate limit info */}
          {rateLimitInfo && rateLimitInfo.isInBackoff && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <div className="flex-1">
                <p className="text-sm text-yellow-700 font-medium">Rate limit active</p>
                <p className="text-xs text-yellow-600">
                  {rateLimitInfo.backoffEndsAt && 
                    `Please wait ${Math.ceil((rateLimitInfo.backoffEndsAt - Date.now()) / 1000)} seconds before making more requests.`
                  }
                </p>
              </div>
            </div>
          )}

          {/* Connection status */}
          {rateLimitInfo && !rateLimitInfo.isInBackoff && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-3">
              <Wifi className="w-4 h-4 text-green-600" />
              <p className="text-xs text-green-700">
                Connected to Google Drive • {rateLimitInfo.requestsRemaining} requests remaining
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                  {error.includes('authentication') && (
                    <button
                      onClick={() => window.location.href = '/auth/google'}
                      className="mt-2 text-xs text-red-600 hover:text-red-700 underline"
                    >
                      Re-authenticate with Google
                    </button>
                  )}
                  {error.includes('Rate limit') && (
                    <button
                      onClick={handleReturnToRoot}
                      className="mt-2 text-xs text-red-600 hover:text-red-700 underline"
                    >
                      Return to My Drive
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
              <p className="text-slate-600">Loading files...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Folders */}
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <div 
                    onClick={() => handleFolderClick(folder)}
                    className="flex items-center space-x-3 flex-1 cursor-pointer"
                  >
                    <FolderOpen className="w-5 h-5 text-blue-600" />
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{folder.name}</p>
                      <p className="text-sm text-slate-500">{folder.files.length} files</p>
                    </div>
                  </div>
                  
                  {allowFolderSelection && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const allFiles = await getAllFilesInFolder(folder);
                          setSelectedFiles(prev => {
                            const newSelection = [...prev];
                            allFiles.forEach(file => {
                              if (!newSelection.some(f => f.id === file.id)) {
                                newSelection.push(file);
                              }
                            });
                            return newSelection;
                          });
                        } catch (error) {
                          handleDriveError(error);
                        }
                      }}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      Select All
                    </button>
                  )}
                </div>
              ))}

              {/* Files */}
              {files.map((file) => {
                const isSelected = selectedFiles.some(f => f.id === file.id);
                
                return (
                  <div
                    key={file.id}
                    onClick={() => handleFileSelect(file)}
                    className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                      {getFileIcon(file.mimeType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{file.name}</p>
                      <p className="text-sm text-slate-500">
                        {formatFileSize(file.size)} • Modified {new Date(file.modifiedTime).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                );
              })}

              {files.length === 0 && folders.length === 0 && !loading && (
                <div className="text-center py-8">
                  <File className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-600">No supported files found</p>
                  <p className="text-sm text-slate-500">Supported: Documents, Spreadsheets, Text files, PDFs</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            {selectedFiles.length > 0 && (
              <span>{selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected</span>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>
            
            <button
              onClick={handleConfirmSelection}
              disabled={selectedFiles.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Select Files ({selectedFiles.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoogleDrivePicker;