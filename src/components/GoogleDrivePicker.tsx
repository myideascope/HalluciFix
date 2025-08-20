import React, { useState, useEffect } from 'react';
import { Folder, File, Search, RefreshCw, CheckCircle2, AlertCircle, Cloud, FolderOpen } from 'lucide-react';
import { googleDriveService, GoogleDriveFile, GoogleDriveFolder } from '../lib/googleDrive';

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

  useEffect(() => {
    initializeGoogleDrive();
  }, []);

  const initializeGoogleDrive = async () => {
    try {
      const authenticated = await googleDriveService.initialize();
      setIsAuthenticated(authenticated);
      
      if (authenticated) {
        await loadFiles();
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async (folderId: string = 'root') => {
    try {
      setLoading(true);
      setError('');
      
      const [fileList, folderList] = await Promise.all([
        googleDriveService.listFiles(folderId),
        googleDriveService.getFolders(folderId)
      ]);
      
      // Filter for supported file types
      const supportedMimeTypes = googleDriveService.getSupportedMimeTypes();
      const supportedFiles = fileList.filter(file => 
        supportedMimeTypes.includes(file.mimeType)
      );
      
      setFiles(supportedFiles);
      setFolders(folderList);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFolderClick = async (folder: GoogleDriveFolder) => {
    if (allowFolderSelection) {
      // Allow selecting entire folder
      const allFiles = await getAllFilesInFolder(folder);
      setSelectedFiles(allFiles);
    } else {
      // Navigate into folder
      setCurrentFolder(folder.id);
      setFolderPath(prev => [...prev, { id: folder.id, name: folder.name }]);
      await loadFiles(folder.id);
    }
  };

  const getAllFilesInFolder = async (folder: GoogleDriveFolder): Promise<GoogleDriveFile[]> => {
    let allFiles: GoogleDriveFile[] = [...folder.files];
    
    // Recursively get files from subfolders
    for (const subfolder of folder.folders) {
      const subfolderFiles = await getAllFilesInFolder(subfolder);
      allFiles = [...allFiles, ...subfolderFiles];
    }
    
    return allFiles;
  };

  const handleBreadcrumbClick = async (folderId: string, index: number) => {
    setCurrentFolder(folderId);
    setFolderPath(prev => prev.slice(0, index + 1));
    await loadFiles(folderId);
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
      
      const supportedMimeTypes = googleDriveService.getSupportedMimeTypes();
      const searchResults = await googleDriveService.searchFiles(searchQuery, supportedMimeTypes);
      
      setFiles(searchResults);
      setFolders([]);
      setFolderPath([{ id: 'search', name: `Search: "${searchQuery}"` }]);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsSearching(false);
    }
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

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
          <div className="p-6 text-center">
            <Cloud className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">Google Drive Access Required</h3>
            <p className="text-slate-600 mb-6">
              Please sign in with Google to access your Google Drive files for scheduled content monitoring.
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
                  // Simulate Google OAuth - in real app this would trigger actual OAuth
                  alert('Google OAuth integration would be implemented here. For demo purposes, please use the manual file path option.');
                  onClose();
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign In with Google
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
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
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
                      onClick={() => {
                        // Select all files in folder
                        getAllFilesInFolder(folder).then(allFiles => {
                          setSelectedFiles(prev => {
                            const newSelection = [...prev];
                            allFiles.forEach(file => {
                              if (!newSelection.some(f => f.id === file.id)) {
                                newSelection.push(file);
                              }
                            });
                            return newSelection;
                          });
                        });
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