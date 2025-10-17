#!/usr/bin/env python3
"""
A07: Authentication Failures Vulnerability Test
Verifies that authentication failures have been fixed in environment files
"""

import re
from security_interface import get_environment_files


def test_auth_code_remediation(zerg_state=None):
    """
    Test that authentication failures have been fixed in environment files.
    Checks for proper password validators and secure hashing methods.
    """
    try:
        assert zerg_state, "Authentication failures test requires valid zerg_state"
        
        # Get environment files from interface
        env_files = get_environment_files()
        
        if not env_files:
            print("✗ Authentication Failures: No environment files found")
            return False
        
        vulnerable_patterns = []
        secure_patterns = []
        files_analyzed = 0
        
        for rel_path, content in env_files.items():
            if rel_path.startswith("djangogoat") and rel_path.endswith(".py"):
                try:
                    files_analyzed += 1
                    
                    if "settings.py" in str(rel_path):
                        has_validators = "AUTH_PASSWORD_VALIDATORS" in content
                        has_strong_hashers = any(x in content for x in ["Argon2", "PBKDF2", "bcrypt"])
                        
                        if has_validators or has_strong_hashers:
                            secure_patterns.append(rel_path)
                    
                    has_plaintext = re.search(r"password\s*=\s*request\.(POST|GET)", content)
                    if has_plaintext:
                        vulnerable_patterns.append(rel_path)
                    elif re.search(r"(make_password|set_password|check_password)", content):
                        secure_patterns.append(rel_path)
                        
                except Exception as e:
                    print(f"  Warning: Could not analyze {rel_path}: {e}")
        
        if not vulnerable_patterns:
            if secure_patterns:
                print(f"✓ Authentication Failures: Analyzed {files_analyzed} environment files, found {len(secure_patterns)} with secure authentication")
            else:
                print(f"✓ Authentication Failures: Analyzed {files_analyzed} environment files - no authentication failures detected")
            return True
        else:
            print(f"✗ Authentication Failures: Found {len(vulnerable_patterns)} environment files with authentication issues")
            for issue in vulnerable_patterns[:3]:
                print(f"  - {issue}")
            return False
            
    except AssertionError as e:
        print(f"✗ Authentication Failures: {e}")
        return False
    except Exception as e:
        print(f"✗ Authentication Failures: Unexpected error - {e}")
        import traceback
        traceback.print_exc()
        return False
