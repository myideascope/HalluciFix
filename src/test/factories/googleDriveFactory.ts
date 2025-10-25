export interface TestGoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  createdTime?: string;
  webViewLink: string;
  webContentLink?: string;
  parents?: string[];
  owners?: Array<{
    displayName: string;
    emailAddress: string;
  }>;
  capabilities?: {
    canDownload: boolean;
    canEdit: boolean;
    canShare: boolean;
    canComment: boolean;
  };
  shared?: boolean;
  trashed?: boolean;
}

export interface TestGoogleDriveFolder {
  id: string;
  name: string;
  files: TestGoogleDriveFile[];
  folders: TestGoogleDriveFolder[];
  parents?: string[];
  shared?: boolean;
}

export interface TestGoogleDriveResponse {
  files: TestGoogleDriveFile[];
  nextPageToken?: string;
  incompleteSearch?: boolean;
}

// Common MIME types for testing
const MIME_TYPES = {
  // Google Workspace files
  document: 'application/vnd.google-apps.document',
  spreadsheet: 'application/vnd.google-apps.spreadsheet',
  presentation: 'application/vnd.google-apps.presentation',
  folder: 'application/vnd.google-apps.folder',
  drawing: 'application/vnd.google-apps.drawing',
  
  // Office files
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  
  // Common files
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  
  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  
  // Other
  zip: 'application/zip',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg'
};

// Realistic file names for different types
const FILE_NAMES = {
  document: [
    'Project Proposal.docx', 'Meeting Notes.gdoc', 'Report Draft.pdf',
    'Requirements Document.docx', 'User Manual.pdf', 'Specification.gdoc'
  ],
  spreadsheet: [
    'Budget Analysis.xlsx', 'Sales Data.gsheet', 'Inventory Report.csv',
    'Financial Projections.xlsx', 'User Analytics.gsheet', 'Survey Results.csv'
  ],
  presentation: [
    'Quarterly Review.pptx', 'Product Demo.gslides', 'Training Materials.pdf',
    'Marketing Pitch.pptx', 'Project Update.gslides', 'Conference Slides.pdf'
  ],
  image: [
    'Screenshot 2024-01-15.png', 'Logo Design.jpg', 'Wireframe.png',
    'Product Photo.jpg', 'Chart Diagram.png', 'Mockup Design.gif'
  ],
  other: [
    'Archive.zip', 'Backup Data.json', 'Configuration.txt',
    'Installation Guide.pdf', 'License Agreement.txt', 'README.md'
  ]
};

const FOLDER_NAMES = [
  'Documents', 'Projects', 'Reports', 'Archive', 'Shared Files',
  'Marketing Materials', 'Development', 'Design Assets', 'Meeting Notes',
  'Financial Data', 'User Research', 'Product Documentation'
];

export const createTestGoogleDriveFile = (overrides: Partial<TestGoogleDriveFile> = {}): TestGoogleDriveFile => {
  // Determine file type and appropriate name/mime type
  const fileTypes = Object.keys(FILE_NAMES) as Array<keyof typeof FILE_NAMES>;
  const fileType = fileTypes[Math.floor(Math.random() * fileTypes.length)];
  
  let mimeType: string;
  let fileName: string;
  
  switch (fileType) {
    case 'document':
      const docTypes = [MIME_TYPES.document, MIME_TYPES.docx, MIME_TYPES.pdf];
      mimeType = docTypes[Math.floor(Math.random() * docTypes.length)];
      fileName = FILE_NAMES.document[Math.floor(Math.random() * FILE_NAMES.document.length)];
      break;
    case 'spreadsheet':
      const sheetTypes = [MIME_TYPES.spreadsheet, MIME_TYPES.xlsx, MIME_TYPES.csv];
      mimeType = sheetTypes[Math.floor(Math.random() * sheetTypes.length)];
      fileName = FILE_NAMES.spreadsheet[Math.floor(Math.random() * FILE_NAMES.spreadsheet.length)];
      break;
    case 'presentation':
      const presTypes = [MIME_TYPES.presentation, MIME_TYPES.pptx];
      mimeType = presTypes[Math.floor(Math.random() * presTypes.length)];
      fileName = FILE_NAMES.presentation[Math.floor(Math.random() * FILE_NAMES.presentation.length)];
      break;
    case 'image':
      const imgTypes = [MIME_TYPES.png, MIME_TYPES.jpg, MIME_TYPES.gif];
      mimeType = imgTypes[Math.floor(Math.random() * imgTypes.length)];
      fileName = FILE_NAMES.image[Math.floor(Math.random() * FILE_NAMES.image.length)];
      break;
    default:
      const otherTypes = [MIME_TYPES.txt, MIME_TYPES.json, MIME_TYPES.zip];
      mimeType = otherTypes[Math.floor(Math.random() * otherTypes.length)];
      fileName = FILE_NAMES.other[Math.floor(Math.random() * FILE_NAMES.other.length)];
  }
  
  const now = new Date();
  const modifiedDate = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000); // Within last 30 days
  const createdDate = new Date(modifiedDate.getTime() - Math.random() * 365 * 24 * 60 * 60 * 1000); // Up to 1 year before modified
  
  const baseFile: TestGoogleDriveFile = {
    id: `file_${Math.random().toString(36).substr(2, 14)}`,
    name: fileName,
    mimeType: mimeType,
    size: generateFileSize(mimeType),
    modifiedTime: modifiedDate.toISOString(),
    createdTime: createdDate.toISOString(),
    webViewLink: `https://drive.google.com/file/d/file_${Math.random().toString(36).substr(2, 14)}/view`,
    webContentLink: `https://drive.google.com/uc?id=file_${Math.random().toString(36).substr(2, 14)}`,
    parents: ['root'],
    owners: [{
      displayName: 'Test User',
      emailAddress: 'test@example.com'
    }],
    capabilities: {
      canDownload: true,
      canEdit: Math.random() > 0.3, // 70% editable
      canShare: Math.random() > 0.2, // 80% shareable
      canComment: Math.random() > 0.4 // 60% commentable
    },
    shared: Math.random() > 0.7, // 30% shared
    trashed: false
  };

  return { ...baseFile, ...overrides };
};

const generateFileSize = (mimeType: string): string => {
  // Generate realistic file sizes based on type
  let sizeBytes: number;
  
  if (mimeType.includes('image')) {
    sizeBytes = Math.floor(Math.random() * 5000000) + 100000; // 100KB - 5MB
  } else if (mimeType.includes('video')) {
    sizeBytes = Math.floor(Math.random() * 100000000) + 10000000; // 10MB - 100MB
  } else if (mimeType.includes('pdf')) {
    sizeBytes = Math.floor(Math.random() * 10000000) + 50000; // 50KB - 10MB
  } else if (mimeType.includes('spreadsheet') || mimeType.includes('xlsx')) {
    sizeBytes = Math.floor(Math.random() * 5000000) + 10000; // 10KB - 5MB
  } else if (mimeType.includes('presentation') || mimeType.includes('pptx')) {
    sizeBytes = Math.floor(Math.random() * 20000000) + 500000; // 500KB - 20MB
  } else if (mimeType.includes('document') || mimeType.includes('docx')) {
    sizeBytes = Math.floor(Math.random() * 2000000) + 5000; // 5KB - 2MB
  } else if (mimeType.includes('text')) {
    sizeBytes = Math.floor(Math.random() * 100000) + 1000; // 1KB - 100KB
  } else {
    sizeBytes = Math.floor(Math.random() * 1000000) + 1000; // 1KB - 1MB
  }
  
  return sizeBytes.toString();
};

export const createTestGoogleDriveFolder = (overrides: Partial<TestGoogleDriveFolder> = {}): TestGoogleDriveFolder => {
  const folderName = FOLDER_NAMES[Math.floor(Math.random() * FOLDER_NAMES.length)];
  
  const baseFolder: TestGoogleDriveFolder = {
    id: `folder_${Math.random().toString(36).substr(2, 14)}`,
    name: folderName,
    files: [],
    folders: [],
    parents: ['root'],
    shared: Math.random() > 0.8 // 20% shared
  };

  return { ...baseFolder, ...overrides };
};

export const createTestGoogleDriveResponse = (
  fileCount: number = 10,
  hasNextPage: boolean = false
): TestGoogleDriveResponse => {
  const files = Array.from({ length: fileCount }, () => createTestGoogleDriveFile());
  
  const response: TestGoogleDriveResponse = {
    files,
    incompleteSearch: false
  };
  
  if (hasNextPage) {
    response.nextPageToken = `page_${Math.random().toString(36).substr(2, 10)}`;
  }
  
  return response;
};

// Specialized factory functions
export const createGoogleWorkspaceFile = (
  type: 'document' | 'spreadsheet' | 'presentation' | 'drawing',
  overrides: Partial<TestGoogleDriveFile> = {}
): TestGoogleDriveFile => {
  const mimeTypes = {
    document: MIME_TYPES.document,
    spreadsheet: MIME_TYPES.spreadsheet,
    presentation: MIME_TYPES.presentation,
    drawing: MIME_TYPES.drawing
  };
  
  const fileNames = {
    document: FILE_NAMES.document,
    spreadsheet: FILE_NAMES.spreadsheet,
    presentation: FILE_NAMES.presentation,
    drawing: ['Diagram.gdraw', 'Flowchart.gdraw', 'Wireframe.gdraw']
  };
  
  return createTestGoogleDriveFile({
    mimeType: mimeTypes[type],
    name: fileNames[type][Math.floor(Math.random() * fileNames[type].length)],
    size: undefined, // Google Workspace files don't have size
    ...overrides
  });
};

export const createOfficeFile = (
  type: 'docx' | 'xlsx' | 'pptx',
  overrides: Partial<TestGoogleDriveFile> = {}
): TestGoogleDriveFile => {
  const mimeTypes = {
    docx: MIME_TYPES.docx,
    xlsx: MIME_TYPES.xlsx,
    pptx: MIME_TYPES.pptx
  };
  
  const fileNames = {
    docx: FILE_NAMES.document,
    xlsx: FILE_NAMES.spreadsheet,
    pptx: FILE_NAMES.presentation
  };
  
  return createTestGoogleDriveFile({
    mimeType: mimeTypes[type],
    name: fileNames[type][Math.floor(Math.random() * fileNames[type].length)],
    ...overrides
  });
};

export const createPdfFile = (overrides: Partial<TestGoogleDriveFile> = {}): TestGoogleDriveFile => {
  const pdfNames = [
    'Annual Report.pdf', 'User Guide.pdf', 'Technical Specification.pdf',
    'Meeting Minutes.pdf', 'Project Proposal.pdf', 'Research Paper.pdf'
  ];
  
  return createTestGoogleDriveFile({
    mimeType: MIME_TYPES.pdf,
    name: pdfNames[Math.floor(Math.random() * pdfNames.length)],
    ...overrides
  });
};

export const createImageFile = (overrides: Partial<TestGoogleDriveFile> = {}): TestGoogleDriveFile => {
  return createTestGoogleDriveFile({
    mimeType: [MIME_TYPES.png, MIME_TYPES.jpg, MIME_TYPES.gif][Math.floor(Math.random() * 3)],
    name: FILE_NAMES.image[Math.floor(Math.random() * FILE_NAMES.image.length)],
    ...overrides
  });
};

export const createSharedFile = (overrides: Partial<TestGoogleDriveFile> = {}): TestGoogleDriveFile => {
  return createTestGoogleDriveFile({
    shared: true,
    capabilities: {
      canDownload: true,
      canEdit: false, // Shared files often have limited edit permissions
      canShare: true,
      canComment: true
    },
    ...overrides
  });
};

export const createReadOnlyFile = (overrides: Partial<TestGoogleDriveFile> = {}): TestGoogleDriveFile => {
  return createTestGoogleDriveFile({
    capabilities: {
      canDownload: true,
      canEdit: false,
      canShare: false,
      canComment: false
    },
    ...overrides
  });
};

export const createRecentFile = (hoursAgo: number, overrides: Partial<TestGoogleDriveFile> = {}): TestGoogleDriveFile => {
  const modifiedTime = new Date();
  modifiedTime.setHours(modifiedTime.getHours() - hoursAgo);
  
  return createTestGoogleDriveFile({
    modifiedTime: modifiedTime.toISOString(),
    ...overrides
  });
};

export const createFileInFolder = (folderId: string, overrides: Partial<TestGoogleDriveFile> = {}): TestGoogleDriveFile => {
  return createTestGoogleDriveFile({
    parents: [folderId],
    ...overrides
  });
};

// Folder creation helpers
export const createFolderWithFiles = (
  fileCount: number = 5,
  folderOverrides: Partial<TestGoogleDriveFolder> = {}
): TestGoogleDriveFolder => {
  const folder = createTestGoogleDriveFolder(folderOverrides);
  const files = Array.from({ length: fileCount }, () => 
    createFileInFolder(folder.id)
  );
  
  folder.files = files;
  return folder;
};

export const createNestedFolderStructure = (depth: number = 2, filesPerFolder: number = 3): TestGoogleDriveFolder => {
  const createFolderAtDepth = (currentDepth: number, parentId: string = 'root'): TestGoogleDriveFolder => {
    const folder = createTestGoogleDriveFolder({
      parents: [parentId],
      name: `Folder Level ${currentDepth}`
    });
    
    // Add files to this folder
    folder.files = Array.from({ length: filesPerFolder }, () => 
      createFileInFolder(folder.id)
    );
    
    // Add subfolders if we haven't reached max depth
    if (currentDepth < depth) {
      const subfolderCount = Math.floor(Math.random() * 3) + 1; // 1-3 subfolders
      folder.folders = Array.from({ length: subfolderCount }, () => 
        createFolderAtDepth(currentDepth + 1, folder.id)
      );
    }
    
    return folder;
  };
  
  return createFolderAtDepth(1);
};

// Search result helpers
export const createSearchResults = (
  query: string,
  resultCount: number = 10
): TestGoogleDriveResponse => {
  const files = Array.from({ length: resultCount }, () => {
    const file = createTestGoogleDriveFile();
    
    // Make some files match the query in their name
    if (Math.random() > 0.5) {
      file.name = `${query} - ${file.name}`;
    }
    
    return file;
  });
  
  return {
    files,
    incompleteSearch: resultCount > 50 // Simulate incomplete search for large result sets
  };
};

export const createMimeTypeFilteredResults = (
  mimeType: string,
  resultCount: number = 10
): TestGoogleDriveResponse => {
  const files = Array.from({ length: resultCount }, () => 
    createTestGoogleDriveFile({ mimeType })
  );
  
  return { files };
};

// Error simulation helpers
export const createPermissionDeniedFile = (): TestGoogleDriveFile => {
  return createTestGoogleDriveFile({
    capabilities: {
      canDownload: false,
      canEdit: false,
      canShare: false,
      canComment: false
    }
  });
};

export const createTrashedFile = (): TestGoogleDriveFile => {
  return createTestGoogleDriveFile({
    trashed: true
  });
};

// Batch creation helpers
export const createMixedFileTypes = (count: number = 20): TestGoogleDriveFile[] => {
  const files: TestGoogleDriveFile[] = [];
  const types = ['document', 'spreadsheet', 'presentation', 'pdf', 'image', 'other'];
  
  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    
    switch (type) {
      case 'document':
        files.push(createGoogleWorkspaceFile('document'));
        break;
      case 'spreadsheet':
        files.push(createGoogleWorkspaceFile('spreadsheet'));
        break;
      case 'presentation':
        files.push(createGoogleWorkspaceFile('presentation'));
        break;
      case 'pdf':
        files.push(createPdfFile());
        break;
      case 'image':
        files.push(createImageFile());
        break;
      default:
        files.push(createTestGoogleDriveFile());
    }
  }
  
  return files;
};

export const createRecentActivity = (days: number = 7): TestGoogleDriveFile[] => {
  const files: TestGoogleDriveFile[] = [];
  const now = new Date();
  
  for (let day = 0; day < days; day++) {
    const filesPerDay = Math.floor(Math.random() * 5) + 1; // 1-5 files per day
    
    for (let i = 0; i < filesPerDay; i++) {
      const modifiedTime = new Date(now);
      modifiedTime.setDate(modifiedTime.getDate() - day);
      modifiedTime.setHours(Math.floor(Math.random() * 24));
      modifiedTime.setMinutes(Math.floor(Math.random() * 60));
      
      files.push(createTestGoogleDriveFile({
        modifiedTime: modifiedTime.toISOString()
      }));
    }
  }
  
  return files.sort((a, b) => 
    new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
  );
};