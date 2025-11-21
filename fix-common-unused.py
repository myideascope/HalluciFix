#!/usr/bin/env python3

import os
import re
import sys
from pathlib import Path

def fix_common_unused_variables():
    """Fix common unused variable patterns across the codebase"""
    
    project_root = Path("/home/antonio/ideascope/HalluciFix")
    total_fixed = 0
    
    print("🔧 Fixing Common Unused Variable Patterns")
    print("=" * 50)
    
    # Find all TypeScript and JavaScript files
    files_to_process = []
    for file_path in project_root.rglob('*.ts'):
        if 'node_modules' not in str(file_path):
            files_to_process.append(file_path)
    
    for file_path in project_root.rglob('*.tsx'):
        if 'node_modules' not in str(file_path):
            files_to_process.append(file_path)
    
    for file_path in files_to_process:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            original_content = content
            fixes_made = 0
            
            # Pattern 1: Remove unused React import when only using hooks
            if 'import React' in content and not re.search(r'React\.', content):
                # Check if it's a simple React import that can be removed
                react_import_pattern = r'import React, \{[^}]*\} from \'react\';'
                if re.search(react_import_pattern, content):
                    # Remove React from the import
                    content = re.sub(
                        r'import React, (\{[^}]*\}) from \'react\';',
                        r'import \1 from \'react\';',
                        content
                    )
                    fixes_made += 1
            
            # Pattern 2: Remove unused destructured parameters
            # Look for patterns like const { a, b, c } = obj; where some are unused
            destructuring_pattern = r'const\s+\{\s*([^}]+)\s*\}\s*='
            for match in re.finditer(destructuring_pattern, content):
                vars_str = match.group(1)
                vars_list = [v.strip() for v in vars_str.split(',') if v.strip()]
                
                # Check each variable for usage
                used_vars = []
                for var in vars_list:
                    var_name = var.split(':')[0].strip()  # Handle { a: alias } patterns
                    if is_variable_used(var_name, content):
                        used_vars.append(var)
                
                if len(used_vars) < len(vars_list):
                    # Replace with only used variables
                    new_vars_str = ', '.join(used_vars)
                    new_line = f"const {{ {new_vars_str} }} ="
                    content = content[:match.start()] + new_line + content[match.end():]
                    fixes_made += 1
            
            # Pattern 3: Remove unused simple variable declarations
            lines = content.split('\n')
            modified_lines = []
            for line in lines:
                # Check for simple unused variable declarations
                var_decl_pattern = r'^(const|let|var)\s+(\w+)\s*=.*;$'
                match = re.match(var_decl_pattern, line.strip())
                if match:
                    var_name = match.group(2)
                    if not is_variable_used(var_name, content):
                        # Skip this line (remove it)
                        continue
                modified_lines.append(line)
            
            content = '\n'.join(modified_lines)
            
            # Write changes if any were made
            if content != original_content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                total_fixed += fixes_made
                print(f"✅ Fixed {fixes_made} issues in {file_path.name}")
            
        except Exception as e:
            print(f"❌ Error processing {file_path.name}: {e}")
    
    print(f"\n📊 Total fixes applied: {total_fixed}")

def is_variable_used(var_name, content):
    """Check if a variable is actually used in the content"""
    # Simple check - look for the variable name being used
    # This is a basic implementation
    pattern = r'\b' + re.escape(var_name) + r'\b'
    matches = re.findall(pattern, content)
    # Count occurrences - subtract 1 for the declaration
    usage_count = len(matches) - 1
    return usage_count > 0

if __name__ == "__main__":
    fix_common_unused_variables()