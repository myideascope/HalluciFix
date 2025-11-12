# HalluciFix - Agent Guidelines

## Build/Lint/Test Commands

```bash
# Development
npm run dev                    # Start dev server
npm run build                  # Build for production
npm run preview                # Preview production build

# Code Quality
npm run lint                   # Run ESLint
npm run test                   # Run all tests
npm run test:watch             # Run tests in watch mode
npm run test:coverage          # Run tests with coverage

# Single Test Execution
npx vitest run --reporter=verbose path/to/test.file.ts
npx vitest run --reporter=verbose src/components/__tests__/ComponentName.test.tsx

# Integration Tests
npm run test:integration       # Run integration tests
npm run test:cognito-auth      # Run Cognito auth tests
npm run test:e2e              # Run end-to-end tests

# Environment-Specific
npm run test:debug            # Debug test mode
npm run test:performance      # Performance tests
npm run test:security         # Security tests
```

## Code Style Guidelines

### Imports & Organization
- Use absolute imports with `@/` prefix for src folder
- Group imports: external libraries → internal modules → types → assets
- Use named exports, avoid default exports
- Import React hooks from `../hooks/`, utilities from `../lib/`

### TypeScript & Types
- Strict mode enabled - no `any` types allowed
- Define interfaces for all props and complex objects
- Use type guards for runtime type checking
- Export types from `src/types/` directory

### Naming Conventions
- Components: PascalCase (e.g., `HallucinationAnalyzer.tsx`)
- Functions: camelCase (e.g., `analyzeContent()`)
- Constants: UPPER_SNAKE_CASE (e.g., `MAX_FILE_SIZE`)
- Test files: `ComponentName.test.tsx` or `utils.test.ts`
- Private helpers: prefix with underscore (e.g., `_validateInput()`)

### Error Handling
- Wrap all async operations in try-catch blocks
- Use structured logging with `logger.child({ component: 'ComponentName' })`
- Return error states, don't throw in render functions
- Implement error boundaries for critical components
- Use `logUtils.logError()` for standardized error reporting

### React Patterns
- Use functional components with hooks
- Implement proper cleanup in useEffect
- Use `useCallback` and `useMemo` for performance optimization
- Follow React Testing Library best practices for tests
- Use Tailwind CSS classes, avoid inline styles

### Testing Standards
- Minimum 80% coverage, 90% for critical modules
- Use `@testing-library/react` for component tests
- Mock external dependencies with `vi.mock()`
- Use test utilities from `src/test/utils/`
- Write integration tests for API endpoints and auth flows

### ESLint Rules
- No unused variables (`no-unused-vars: warn`)
- Prefer const over let (`prefer-const: error`)
- No console.log in production code (`no-console: warn`)
- React hooks rules enforced
- Component export validation

### Performance & Security
- Validate all user inputs with Zod schemas
- Use React.memo for expensive components
- Implement proper loading states
- Sanitize user content before display
- Use secure HTTP headers and CSP