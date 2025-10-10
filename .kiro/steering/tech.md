# Technology Stack

## Frontend Framework
- **React 18** with TypeScript for type safety
- **Vite** as the build tool and development server
- **Tailwind CSS** for styling with dark mode support
- **Lucide React** for consistent iconography

## Backend & Database
- **Supabase** for authentication, database, and real-time features
- **PostgreSQL** database with custom functions for scheduled processing
- **Supabase Edge Functions** for serverless compute (Deno runtime)

## Key Libraries
- `@supabase/supabase-js` - Database and auth client
- `googleapis` - Google Drive integration
- `pdf-parse` - PDF document processing
- `google-auth-library` - Google authentication

## Development Tools
- **ESLint** with TypeScript support for code quality
- **Vitest** for testing with UI mode available
- **PostCSS** with Autoprefixer for CSS processing

## Common Commands

### Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
```

### Code Quality
```bash
npm run lint         # Run ESLint
npm run test         # Run tests
npm run test:ui      # Run tests with UI
```

## Environment Variables
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

## Architecture Patterns
- **Custom Hooks** for state management (`useAuth`, `useDarkMode`, `useToast`)
- **Service Layer** pattern for API calls and business logic
- **Type-safe** database operations with conversion helpers
- **Component-based** architecture with clear separation of concerns