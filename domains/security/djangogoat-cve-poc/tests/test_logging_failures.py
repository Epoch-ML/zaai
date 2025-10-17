#!/usr/bin/env python3
"""
A09: Logging and Monitoring Failures Vulnerability Test
Verifies that logging has been properly configured in environment files
"""

import re
from security_interface import get_environment_files


def test_logging_remediation(zerg_state=None):
    """
    Test that logging failures have been fixed in environment files.
    Checks for proper logging configuration without exposing sensitive data.
    """
    try:
        assert zerg_state, "Logging failures test requires valid zerg_state"
        
        # Get environment files from interface
        env_files = get_environment_files()
        
        if not env_files:
            print("✗ Logging Failures: No environment files found")
            return False
        
        vulnerable_patterns = []
        secure_patterns = []
        files_analyzed = 0
        
        for rel_path, content in env_files.items():
            if rel_path.startswith("djangogoat") and rel_path.endswith(".py"):
                try:
                    files_analyzed += 1
                    
                    has_logging_config = "LOGGING" in content or "logging.config" in content
                    has_logger = re.search(r"logger\.(info|error|warning|debug)", content)
                    has_sensitive_print = re.search(r"print\s*\(.*(?:password|token|secret|key|api)", content, re.IGNORECASE)
                    
                    if has_sensitive_print:
                        vulnerable_patterns.append(rel_path)
                    elif has_logging_config or has_logger:
                        secure_patterns.append(rel_path)
                        
                except Exception as e:
                    print(f"  Warning: Could not analyze {rel_path}: {e}")
        
        if not vulnerable_patterns:
            if secure_patterns:
                print(f"✓ Logging Failures: Analyzed {files_analyzed} environment files, found {len(secure_patterns)} with proper logging")
            else:
                print(f"✓ Logging Failures: Analyzed {files_analyzed} environment files - no logging failures detected")
            return True
        else:
            print(f"✗ Logging Failures: Found {len(vulnerable_patterns)} environment files with sensitive data in logs")
            for issue in vulnerable_patterns[:3]:
                print(f"  - {issue}")
            return False
            
    except AssertionError as e:
        print(f"✗ Logging Failures: {e}")
        return False
    except Exception as e:
        print(f"✗ Logging Failures: Unexpected error - {e}")
        import traceback
        traceback.print_exc()
        return False
