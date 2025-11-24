# Linting Resolution Plan - Critical Syntax Errors

## Overview
This document covers the resolution of critical syntax errors that prevent the application from running properly. These include parsing errors, undefined variables, and case declaration issues.

## Total Issues: 147 Critical Errors

### 1. Parsing Errors (20 errors)
**Priority: CRITICAL - Blocks compilation**

#### Files with Syntax Issues:
- `src/App.tsx:199` - `'managerRef' is not defined`
- `src/components/ApiDocumentation.tsx:179` - `Parsing error: '}' expected`
- `src/components/AppWithCognito.tsx:85` - `Parsing error: Declaration or statement expected`
- `src/components/BatchAnalysis.tsx:172` - `Parsing error: ',' expected`
- `src/components/CognitoApp.tsx:48,49` - `Unexpected empty object pattern`
- `src/components/GlobalErrorBoundary.tsx:16` - `Parsing error: Expression expected`
- `src/components/HallucinationAnalyzer.tsx:579` - `Parsing error: ',' expected`
- `src/components/auth/AccessDeniedError.tsx:98` - `Parsing error: ',' expected`

#### Action Items:
1. **Fix undefined variables** - Add proper variable declarations
2. **Fix syntax errors** - Correct missing brackets, commas, and expressions
3. **Remove empty object patterns** - Replace with proper destructuring

### 2. Undefined Variables (45 errors)
**Priority: CRITICAL - Runtime errors**

#### Common Missing Variables:
- `'Auth' is not defined` (19 occurrences)
- `'supabase' is not defined` (16 occurrences)  
- `'React' is not defined` (8+ occurrences)
- `'logger' is not defined` (7 occurrences)
- `'NodeJS' is not defined` (6+ occurrences)

#### Files Requiring Import Fixes:
- All files using `Auth` from Supabase - add `import { Auth } from '@/lib/supabase'`
- All files using `supabase` - add `import { supabase } from '@/lib/supabase'`
- All files using React features - add `import React from 'react'`
- All files using NodeJS types - add `import type { NodeJS } from 'node'`
- All files using logger - add `import { logger } from '@/lib/logger'`

### 3. Case Declaration Issues (27 errors)
**Priority: HIGH - Code logic errors**

#### Pattern: `Unexpected lexical declaration in case block`
- `src/components/UserManagement.tsx:260`
- `src/components/auth/CognitoAuthForm.tsx:44`
- Multiple test files

#### Action Items:
- Wrap variable declarations in case blocks with braces `{}`
- Use `let` declarations at switch block start instead of case blocks

### 4. React Import Issues (15 errors)
**Priority: CRITICAL - Component rendering fails**

#### Missing React imports:
- `src/components/__tests__/PaymentMethodForm.test.tsx:24`
- Multiple component files

#### Action Items:
- Add `import React from 'react'` to all component files
- Ensure React is imported for all JSX usage

### 5. Type Definition Issues (15 errors)
**Priority: HIGH - TypeScript compilation**

#### Missing type definitions:
- `'RequestInit' is not defined`
- `'HeadersInit' is not defined` 
- `'EventListener' is not defined`
- Various custom type definitions

#### Action Items:
- Add proper type imports
- Install missing type packages if needed
- Create type definition files for custom types

### 6. Duplicate Key Issues (10 errors)
**Priority: MEDIUM - Configuration errors**

#### Environment Variable Duplicates:
- Multiple duplicate keys in environment configurations
- `VITE_OPENAI_*`, `VITE_ANTHROPIC_*`, `OPENAI_*`, `ANTHROPIC_*` duplicates

#### Action Items:
- Remove duplicate environment variable declarations
- Consolidate configuration files
- Update `.env` files to remove duplicates

### 7. Other Critical Errors (15 errors)
**Priority: HIGH - Runtime stability**

#### Issues:
- `'useState' is not defined` - Missing React import
- `'Stripe' is not defined` - Missing Stripe import
- `'ValidationResult' is not defined` - Missing type import
- Various other undefined references

## Implementation Strategy

### Phase 1: Immediate Fixes (2-3 hours)
1. **Fix all parsing errors** - These block compilation
2. **Add missing React imports** - Critical for component rendering
3. **Fix undefined Auth/supabase** - Core functionality

### Phase 2: Type and Import Fixes (3-4 hours)  
1. **Add missing type imports**
2. **Fix case declaration issues**
3. **Resolve undefined variable references**

### Phase 3: Configuration Cleanup (1-2 hours)
1. **Remove duplicate environment variables**
2. **Fix remaining import issues**
3. **Validate all TypeScript compilation**

## Success Criteria
- ✅ All parsing errors resolved
- ✅ All undefined variable errors fixed
- ✅ All case declaration issues resolved
- ✅ All React imports properly added
- ✅ TypeScript compilation successful
- ✅ Application runs without syntax errors

## Files to Modify
- 45+ component files requiring import fixes
- 15+ files with syntax errors
- 10+ configuration files
- 25+ test files

## Estimated Time: 6-8 hours total
- Phase 1: 2-3 hours
- Phase 2: 3-4 hours  
- Phase 3: 1-2 hours

## Dependencies
- Access to component files and their dependencies
- Knowledge of project structure and import patterns
- TypeScript and React expertise