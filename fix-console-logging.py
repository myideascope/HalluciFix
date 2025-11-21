#!/usr/bin/env python3

import os
import re
import sys
from pathlib import Path

# Console to Logging Migration Script
class ConsoleToLoggingMigrator:
    def __init__(self, project_root):
        self.project_root = Path(project_root)
        self.total_files = 0
        self.modified_files = 0
        self.console_statements_fixed = 0
        
    def log(self, message, level="INFO"):
        colors = {
            "INFO": "\033[0;34m",
            "SUCCESS": "\033[0;32m", 
            "WARNING": "\033[1;33m",
            "ERROR": "\033[0;31m",
            "NC": "\033[0m"
        }
        print(f"{colors.get(level, '')}[{level}]{colors['NC']} {message}")
    
    def has_console_statements(self, file_path):
        """Check if file has console statements"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                return bool(re.search(r'console\.(log|error|warn|info)', content))
        except Exception:
            return False
    
    def add_logger_import(self, content, file_path):
        """Add logger import to file content"""
        # Check if logger is already imported
        if 'import.*logger.*from' in content:
            return content, False
        
        # Find the last import statement
        import_pattern = r'(import.*from[^\n]*;\n*)'
        imports = re.findall(import_pattern, content)
        
        if not imports:
            # No imports found, add at the top
            return f"import {{ logger }} from './logging';\n\n{content}", True
        
        # Add logger import after the last import
        last_import_end = content.rfind(imports[-1]) + len(imports[-1])
        new_content = content[:last_import_end] + "import { logger } from './logging';\n" + content[last_import_end:]
        
        return new_content, True
    
    def replace_console_statements(self, content):
        """Replace console statements with logger calls"""
        original_content = content
        replacements_made = 0
        
        # Pattern 1: console.error('message', error) -> logger.error('message', error)
        pattern1 = r'console\.error\s*\(\s*["\']([^"\']*)["\']\s*,\s*([^)]+)\)'
        replacement1 = r'logger.error("\1", \2 instanceof Error ? \2 : new Error(String(\2)))'
        content = re.sub(pattern1, replacement1, content)
        replacements_made += len(re.findall(pattern1, original_content))
        
        # Pattern 2: console.error('message:') -> logger.error('message')
        pattern2 = r'console\.error\s*\(\s*["\']([^"\']*):["\']\s*,'
        replacement2 = r'logger.error("\1"'
        content = re.sub(pattern2, replacement2, content)
        replacements_made += len(re.findall(pattern2, original_content))
        
        # Pattern 3: console.error('message') -> logger.error('message')
        pattern3 = r'console\.error\s*\(\s*["\']([^"\']*)["\']\s*\)'
        replacement3 = r'logger.error("\1")'
        content = re.sub(pattern3, replacement3, content)
        replacements_made += len(re.findall(pattern3, original_content))
        
        # Pattern 4: console.warn('message', data) -> logger.warn('message', { data })
        pattern4 = r'console\.warn\s*\(\s*["\']([^"\']*)["\']\s*,\s*([^)]+)\)'
        replacement4 = r'logger.warn("\1", { \2 })'
        content = re.sub(pattern4, replacement4, content)
        replacements_made += len(re.findall(pattern4, original_content))
        
        # Pattern 5: console.warn('message') -> logger.warn('message')
        pattern5 = r'console\.warn\s*\(\s*["\']([^"\']*)["\']\s*\)'
        replacement5 = r'logger.warn("\1")'
        content = re.sub(pattern5, replacement5, content)
        replacements_made += len(re.findall(pattern5, original_content))
        
        # Pattern 6: console.log('Starting...') -> logger.info('Starting...')
        pattern6 = r'console\.log\s*\(\s*["\']([^"\']*(?:Start|Complete|Process)[^"\']*)["\']\s*\)'
        replacement6 = r'logger.info("\1")'
        content = re.sub(pattern6, replacement6, content)
        replacements_made += len(re.findall(pattern6, original_content))
        
        # Pattern 7: console.log('message', data) -> logger.info('message', { data })
        pattern7 = r'console\.log\s*\(\s*["\']([^"\']*)["\']\s*,\s*([^)]+)\)'
        replacement7 = r'logger.info("\1", { \2 })'
        content = re.sub(pattern7, replacement7, content)
        replacements_made += len(re.findall(pattern7, original_content))
        
        # Pattern 8: console.log('message') -> logger.debug('message')
        pattern8 = r'console\.log\s*\(\s*["\']([^"\']*)["\']\s*\)'
        replacement8 = r'logger.debug("\1")'
        content = re.sub(pattern8, replacement8, content)
        replacements_made += len(re.findall(pattern8, original_content))
        
        # Pattern 9: console.info('message', data) -> logger.info('message', { data })
        pattern9 = r'console\.info\s*\(\s*["\']([^"\']*)["\']\s*,\s*([^)]+)\)'
        replacement9 = r'logger.info("\1", { \2 })'
        content = re.sub(pattern9, replacement9, content)
        replacements_made += len(re.findall(pattern9, original_content))
        
        # Pattern 10: console.info('message') -> logger.info('message')
        pattern10 = r'console\.info\s*\(\s*["\']([^"\']*)["\']\s*\)'
        replacement10 = r'logger.info("\1")'
        content = re.sub(pattern10, replacement10, content)
        replacements_made += len(re.findall(pattern10, original_content))
        
        return content, replacements_made
    
    def process_file(self, file_path):
        """Process a single file"""
        if not self.has_console_statements(file_path):
            return False
        
        self.log(f"Processing: {file_path}")
        
        try:
            # Read file content
            with open(file_path, 'r', encoding='utf-8') as f:
                original_content = f.read()
            
            # Count console statements before
            before_count = len(re.findall(r'console\.(log|error|warn|info)', original_content))
            
            # Add logger import
            content, import_added = self.add_logger_import(original_content, file_path)
            
            # Replace console statements
            content, replacements = self.replace_console_statements(content)
            
            # Count console statements after
            after_count = len(re.findall(r'console\.(log|error|warn|info)', content))
            fixed_count = before_count - after_count
            
            if fixed_count > 0:
                # Write the modified content back
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                self.log(f"Fixed {fixed_count} console statements", "SUCCESS")
                self.modified_files += 1
                self.console_statements_fixed += fixed_count
                return True
            else:
                self.log("No console statements fixed (may need manual review)", "WARNING")
                return False
                
        except Exception as e:
            self.log(f"Error processing file: {e}", "ERROR")
            return False
    
    def process_all_files(self):
        """Process all TypeScript/JavaScript files"""
        self.log("Starting console statement migration...")
        
        # Find all TypeScript and JavaScript files
        for file_path in self.project_root.rglob('*.ts'):
            if 'node_modules' not in str(file_path):
                self.total_files += 1
                self.process_file(file_path)
        
        for file_path in self.project_root.rglob('*.tsx'):
            if 'node_modules' not in str(file_path):
                self.total_files += 1
                self.process_file(file_path)
    
    def create_summary(self):
        """Create summary report"""
        print("\n===================================")
        print("CONSOLE TO LOGGING MIGRATION REPORT")
        print("===================================")
        print(f"Total files processed: {self.total_files}")
        print(f"Files modified: {self.modified_files}")
        print(f"Console statements fixed: {self.console_statements_fixed}")
        print("")
        
        if self.console_statements_fixed > 0:
            self.log("Migration completed successfully!", "SUCCESS")
            print("\nNext steps:")
            print("1. Run 'npm run lint' to check remaining console statements")
            print("2. Review any complex console statements that may need manual adjustment")
            print("3. Test the application to ensure logging works correctly")
        else:
            self.log("No console statements were fixed. Please check the script logic.", "WARNING")
    
    def validate_changes(self):
        """Validate the changes"""
        self.log("Validating changes...")
        
        # Check for remaining console statements
        remaining_files = []
        for file_path in self.project_root.rglob('*.ts'):
            if 'node_modules' not in str(file_path) and self.has_console_statements(file_path):
                remaining_files.append(file_path)
        
        for file_path in self.project_root.rglob('*.tsx'):
            if 'node_modules' not in str(file_path) and self.has_console_statements(file_path):
                remaining_files.append(file_path)
        
        if len(remaining_files) == 0:
            self.log("All console statements have been replaced!", "SUCCESS")
        else:
            self.log(f"{len(remaining_files)} files still contain console statements", "WARNING")
            for file_path in remaining_files[:5]:  # Show first 5
                self.log(f"  - {file_path}")

    def main(self):
        """Main execution"""
        print("HalluciFix Console to Logging Migration Script")
        print("==============================================")
        print("")
        
        # Check if we're in the correct directory
        if not (self.project_root / "package.json").exists() or not (self.project_root / "src").exists():
            self.log("Please run this script from the HalluciFix root directory", "ERROR")
            sys.exit(1)
        
        # Process files
        self.process_all_files()
        
        # Validate changes
        self.validate_changes()
        
        # Create summary
        self.create_summary()

if __name__ == "__main__":
    migrator = ConsoleToLoggingMigrator("/home/antonio/ideascope/HalluciFix")
    migrator.main()