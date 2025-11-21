#!/usr/bin/env python3

import os
import re
import sys
from pathlib import Path

class UnusedVariableCleaner:
    def __init__(self, project_root):
        self.project_root = Path(project_root)
        self.total_files = 0
        self.modified_files = 0
        self.variables_removed = 0
        
    def log(self, message, level="INFO"):
        colors = {
            "INFO": "\033[0;34m",
            "SUCCESS": "\033[0;32m", 
            "WARNING": "\033[1;33m",
            "ERROR": "\033[0;31m",
            "NC": "\033[0m"
        }
        print(f"{colors.get(level, '')}[{level}]{colors['NC']} {message}")
    
    def find_unused_variables_in_function(self, content, function_start, function_end):
        """Find unused variables in a function"""
        function_content = content[function_start:function_end]
        
        # Find variable declarations
        var_patterns = [
            r'const\s+\{([^}]+)\}\s*=',
            r'const\s+(\w+)',
            r'let\s+(\w+)',
            r'var\s+(\w+)',
        ]
        
        unused_vars = []
        for pattern in var_patterns:
            matches = re.findall(pattern, function_content)
            for match in matches:
                if isinstance(match, tuple):
                    # Handle destructuring patterns
                    vars_list = [v.strip() for v in match.split(',') if v.strip()]
                    for var in vars_list:
                        if not self.is_variable_used(var, function_content):
                            unused_vars.append(var)
                else:
                    if not self.is_variable_used(match, function_content):
                        unused_vars.append(match)
        
        return unused_vars
    
    def is_variable_used(self, var_name, content):
        """Check if a variable is used in the content"""
        # Simple check - look for the variable name being used
        # This is a basic implementation and might need refinement
        pattern = r'\b' + re.escape(var_name) + r'\b'
        matches = re.findall(pattern, content)
        # Count occurrences - subtract 1 for the declaration
        usage_count = len(matches) - 1
        return usage_count > 0
    
    def remove_unused_variables(self, content):
        """Remove unused variables from content"""
        original_content = content
        
        # Pattern 1: Remove unused destructuring variables
        # const { a, b, c } = obj; where b is unused
        destructuring_pattern = r'const\s+\{\s*([^}]+)\s*\}\s*='
        for match in re.finditer(destructuring_pattern, content):
            vars_str = match.group(1)
            vars_list = [v.strip() for v in vars_str.split(',') if v.strip()]
            
            # Check each variable
            used_vars = []
            for var in vars_list:
                var_name = var.split(':')[0].strip()  # Handle { a: alias } patterns
                if self.is_variable_used(var_name, content):
                    used_vars.append(var)
            
            if len(used_vars) < len(vars_list):
                # Replace with only used variables
                new_vars_str = ', '.join(used_vars)
                new_line = f"const {{ {new_vars_str} }} ="
                content = content[:match.start()] + new_line + content[match.end():]
        
        # Pattern 2: Remove unused simple variable declarations
        simple_var_pattern = r'(const|let|var)\s+(\w+)\s*=\s*[^;]+;'
        for match in re.finditer(simple_var_pattern, content):
            var_name = match.group(2)
            if not self.is_variable_used(var_name, content):
                # Check if this is a simple assignment that can be removed
                line_start = content.rfind('\n', 0, match.start()) + 1
                line_end = content.find('\n', match.end())
                if line_end == -1:
                    line_end = len(content)
                
                line = content[line_start:line_end]
                if var_name in line and '=' in line:
                    # Remove the entire line
                    content = content[:line_start] + content[line_end + 1:]
        
        return content
    
    def clean_file(self, file_path):
        """Clean unused variables in a single file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                original_content = f.read()
            
            # Count original lines
            original_lines = original_content.split('\n')
            
            # Remove unused variables
            cleaned_content = self.remove_unused_variables(original_content)
            
            # Count cleaned lines
            cleaned_lines = cleaned_content.split('\n')
            
            # Check if anything changed
            if cleaned_content != original_content:
                # Write the cleaned content back
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(cleaned_content)
                
                lines_removed = len(original_lines) - len(cleaned_lines)
                self.log(f"Cleaned {lines_removed} lines", "SUCCESS")
                self.modified_files += 1
                self.variables_removed += lines_removed
                return True
            else:
                self.log("No unused variables found", "INFO")
                return False
                
        except Exception as e:
            self.log(f"Error processing file: {e}", "ERROR")
            return False
    
    def process_files(self):
        """Process all TypeScript/JavaScript files"""
        self.log("Starting unused variable cleanup...")
        
        # Find all TypeScript and JavaScript files
        for file_path in self.project_root.rglob('*.ts'):
            if 'node_modules' not in str(file_path) and 'dist' not in str(file_path):
                self.total_files += 1
                self.log(f"Processing: {file_path}")
                self.clean_file(file_path)
        
        for file_path in self.project_root.rglob('*.tsx'):
            if 'node_modules' not in str(file_path) and 'dist' not in str(file_path):
                self.total_files += 1
                self.log(f"Processing: {file_path}")
                self.clean_file(file_path)
    
    def create_summary(self):
        """Create summary report"""
        print("\n===================================")
        print("UNUSED VARIABLE CLEANUP REPORT")
        print("===================================")
        print(f"Total files processed: {self.total_files}")
        print(f"Files modified: {self.modified_files}")
        print(f"Variables removed: {self.variables_removed}")
        print("")
        
        if self.variables_removed > 0:
            self.log("Cleanup completed successfully!", "SUCCESS")
            print("\nBenefits:")
            print("- Reduced bundle size by removing dead code")
            print("- Improved code maintainability")
            print("- Enhanced code readability")
        else:
            self.log("No unused variables found to clean.", "INFO")

    def main(self):
        """Main execution"""
        print("HalluciFix Unused Variable Cleanup Tool")
        print("======================================")
        print("")
        
        # Check if we're in the correct directory
        if not (self.project_root / "package.json").exists() or not (self.project_root / "src").exists():
            self.log("Please run this script from the HalluciFix root directory", "ERROR")
            sys.exit(1)
        
        # Process files
        self.process_files()
        
        # Create summary
        self.create_summary()

if __name__ == "__main__":
    cleaner = UnusedVariableCleaner("/home/antonio/ideascope/HalluciFix")
    cleaner.main()