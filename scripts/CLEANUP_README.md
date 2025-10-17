# Test Cleanup Scripts

This directory contains scripts to clean up test files, reports, and artifacts from the repository.

## Available Scripts

### 1. `cleanup-reports.sh` 
**Purpose**: Clean up test reports and artifacts only (keeps test code)

**What it removes**:
- Test result directories (`test-results/`, `coverage/`, etc.)
- Report files (`*-results.json`, `*-results.xml`, `*-report.html`)
- Video recordings (`.webm` files)
- HAR files
- Accessibility and performance reports

**Usage**:
```bash
# Direct execution
./scripts/cleanup-reports.sh

# Via npm script
npm run cleanup:reports
```

**Safe to use**: ✅ This only removes generated reports and artifacts, keeping all test code intact.

### 2. `cleanup-tests.sh`
**Purpose**: Remove all test files and configurations (keeps npm packages)

**What it removes**:
- All test directories (`e2e/`, `src/test/`)
- Test configuration files (`playwright.*.config.ts`, `vitest.*.config.ts`)
- Test-related scripts and documentation
- All test artifacts and reports

**Usage**:
```bash
# Direct execution
./scripts/cleanup-tests.sh

# Via npm script
npm run cleanup:tests
```

**Note**: ⚠️ This removes test code but preserves npm packages and package.json scripts.

### 3. `cleanup-tests-complete.sh`
**Purpose**: Complete removal of all testing infrastructure

**What it removes**:
- Everything from `cleanup-tests.sh`
- Test-related npm packages (vitest, playwright, testing-library, etc.)
- Test scripts from package.json
- All remaining test artifacts

**Usage**:
```bash
# Direct execution
./scripts/cleanup-tests-complete.sh

# Via npm script
npm run cleanup:tests:complete
```

**Warning**: 🚨 This completely removes all testing infrastructure. Use only if you want to permanently remove testing from the project.

## Recommended Usage

1. **During development**: Use `cleanup:reports` to clean up generated files while keeping tests
2. **Removing test framework**: Use `cleanup:tests` to remove test code but keep packages for potential future use
3. **Complete cleanup**: Use `cleanup:tests:complete` only when permanently removing testing from the project

## What's Protected by .gitignore

The updated `.gitignore` now excludes:
- `test-results/`
- `coverage/`
- `accessibility-test-report/`
- `performance-report/`
- `performance-results/`
- `.test-dashboard/`
- `*.webm` files
- `*-results.json` and `*-results.xml` files
- Playwright browsers and reports

## Recovery

If you accidentally run a cleanup script and need to recover:
1. Use `git checkout` to restore deleted files
2. Run `npm install` to reinstall removed packages
3. Check git history for any configuration changes that need to be reverted