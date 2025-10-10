# Project Structure

## Root Directory
```
├── src/                    # Main application source code
├── supabase/              # Database migrations and functions
├── docs/                  # Project documentation
├── dist/                  # Build output (generated)
├── node_modules/          # Dependencies (generated)
└── .kiro/                 # Kiro AI assistant configuration
```

## Source Code Organization (`src/`)

### Components (`src/components/`)
- **Page Components**: `LandingPage.tsx`, `Dashboard.tsx`, `Analytics.tsx`
- **Feature Components**: `HallucinationAnalyzer.tsx`, `BatchAnalysis.tsx`, `ScheduledScans.tsx`
- **UI Components**: `Toast.tsx`, `DarkModeToggle.tsx`, `AuthForm.tsx`
- **System Components**: `Settings.tsx`, `UserManagement.tsx`, `ReviewSystem.tsx`

### Hooks (`src/hooks/`)
- `useAuth.ts` - Authentication state and methods
- `useDarkMode.ts` - Theme switching functionality
- `useToast.ts` - Notification system

### Services (`src/lib/`)
- `supabase.ts` - Database client configuration
- `api.ts` - API communication layer
- `analysisService.ts` - Core analysis logic
- `ragService.ts` - RAG (Retrieval-Augmented Generation) operations
- `scheduledScans.ts` - Automated scanning functionality
- `googleDrive.ts` - Google Drive integration
- `pdfParser.ts` - PDF processing utilities

### Types (`src/types/`)
- `analysis.ts` - Analysis result types and converters
- `user.ts` - User and authentication types
- `review.ts` - Content review workflow types
- `scheduledScan.ts` - Scheduled scan configuration types

## Database Structure (`supabase/`)

### Migrations (`supabase/migrations/`)
- Sequential SQL migration files with descriptive names
- Database schema evolution tracking

### Functions (`supabase/functions/`)
- `scan-executor/` - Serverless function for processing scheduled scans

## Documentation (`docs/`)
- `API_REFERENCE.md` - API documentation
- `TECHNICAL_DOCUMENTATION.md` - Technical specifications
- `USER_GUIDE.md` - End-user documentation
- `PRODUCT_ROADMAP.md` - Feature planning
- `SALES_PLAYBOOK.md` - Sales and marketing materials

## Naming Conventions
- **Components**: PascalCase (e.g., `HallucinationAnalyzer.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useAuth.ts`)
- **Services**: camelCase (e.g., `analysisService.ts`)
- **Types**: camelCase files, PascalCase interfaces (e.g., `AnalysisResult`)
- **Database**: snake_case for tables and columns