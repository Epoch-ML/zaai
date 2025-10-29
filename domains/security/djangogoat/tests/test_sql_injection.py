#!/usr/bin/env python3
"""
A01: SQL Injection Vulnerability Test
Verifies that SQL injection vulnerabilities have been fixed in environment files
"""

import re
from security_interface import get_environment_files


def test_sql_injection_remediation(zerg_state=None):
    """
    Test that SQL injection vulnerabilities have been fixed in environment files.
    Checks for parameterized queries instead of string concatenation.
    """
    try:
        assert zerg_state, "SQL injection test requires valid zerg_state"
        
        # Get environment files from interface
        env_files = get_environment_files()
        
        if not env_files:
            print("✗ SQL Injection: No environment files found")
            return False
        
        vulnerable_patterns = []
        secure_patterns = []
        files_analyzed = 0
        
        # Check environment files for SQL injection patterns
        for rel_path, content in env_files.items():
            if rel_path.startswith("djangogoat") and rel_path.endswith(".py"):
                try:
                    files_analyzed += 1
                    
                    # Check for FIXED patterns (parameterized queries)
                    has_parameterized = (
                        ".raw(" in content and "?" in content or
                        "cursor.execute" in content and "%" in content and "params" in content or
                        "ORM" in content or "objects.filter" in content
                    )
                    
                    # Check for UNFIXED patterns (string concatenation in SQL)
                    has_string_concat = re.search(r'raw\s*\(\s*["\']SELECT.*["\'].*\+|raw\s*\(\s*f["\'].*SELECT.*{', content, re.IGNORECASE)
                    has_format_sql = re.search(r'\.format\s*\(|f["\'].*SELECT.*{', content)
                    has_direct_concat = re.search(r'"SELECT.*"\s*\+\s*|\'SELECT.*\'\s*\+\s*', content, re.IGNORECASE)
                    
                    if has_string_concat or has_format_sql or has_direct_concat:
                        vulnerable_patterns.append(rel_path)
                    elif has_parameterized:
                        secure_patterns.append(rel_path)
                        
                except Exception as e:
                    print(f"  Warning: Could not analyze {rel_path}: {e}")
        
        # Report results
        if not vulnerable_patterns:
            if secure_patterns:
                print(f"✓ SQL Injection: Analyzed {files_analyzed} environment files, found {len(secure_patterns)} with safe SQL patterns")
            else:
                print(f"✓ SQL Injection: Analyzed {files_analyzed} environment files - no SQL injection vulnerabilities detected")
            return True
        else:
            print(f"✗ SQL Injection: Found {len(vulnerable_patterns)} environment files with SQL injection vulnerabilities")
            for issue in vulnerable_patterns[:3]:
                print(f"  - {issue}")
            return False
            
    except AssertionError as e:
        print(f"✗ SQL Injection: {e}")
        return False
    except Exception as e:
        print(f"✗ SQL Injection: Unexpected error - {e}")
        import traceback
        traceback.print_exc()
        return False
