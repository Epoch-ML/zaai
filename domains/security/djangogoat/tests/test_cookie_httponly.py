#!/usr/bin/env python3
"""
HTTPOnly Cookie Security Test
Verifies that cookies are configured with HTTPOnly flag enabled
"""

import re
from security_interface import get_environment_files


def test_cookie_httponly(zerg_state=None):
    """
    Test that HTTPOnly flag is enabled for all cookies.
    Checks Django settings for proper cookie configuration.
    """
    try:
        assert zerg_state, "Cookie HTTPOnly test requires valid zerg_state"
        
        # Get environment files from interface
        env_files = get_environment_files()
        
        if not env_files:
            print("✗ Cookie HTTPOnly: No environment files found")
            return False
        
        vulnerable_patterns = []
        secure_patterns = []
        files_analyzed = 0
        
        for rel_path, content in env_files.items():
            if "settings.py" in rel_path and rel_path.startswith("djangogoat"):
                try:
                    files_analyzed += 1
                    
                    # Check for session cookie HTTPOnly setting
                    session_httponly_false = re.search(r'SESSION_COOKIE_HTTPONLY\s*=\s*False', content)
                    session_httponly_true = re.search(r'SESSION_COOKIE_HTTPONLY\s*=\s*True', content)
                    
                    # Check for CSRF cookie HTTPOnly setting
                    csrf_httponly_false = re.search(r'CSRF_COOKIE_HTTPONLY\s*=\s*False', content)
                    csrf_httponly_true = re.search(r'CSRF_COOKIE_HTTPONLY\s*=\s*True', content)
                    
                    # Check if HTTPOnly is explicitly disabled or not set (defaults to True in modern Django)
                    # If explicitly set to False, that's vulnerable
                    vulnerable = False
                    if session_httponly_false or csrf_httponly_false:
                        vulnerable = True
                        vulnerable_patterns.append(f"{rel_path}: HTTPOnly explicitly disabled")
                    
                    # Check for secure cookie settings as well
                    session_secure_false = re.search(r'SESSION_COOKIE_SECURE\s*=\s*False', content)
                    csrf_secure_false = re.search(r'CSRF_COOKIE_SECURE\s*=\s*False', content)
                    
                    if session_secure_false or csrf_secure_false:
                        vulnerable = True
                        vulnerable_patterns.append(f"{rel_path}: Secure cookie flag disabled")
                    
                    if not vulnerable:
                        # Check if HTTPOnly is explicitly enabled or if it's the default
                        if (session_httponly_true or csrf_httponly_true or 
                            ('SESSION_COOKIE_HTTPONLY' not in content and 'CSRF_COOKIE_HTTPONLY' not in content)):
                            secure_patterns.append(f"{rel_path}: HTTPOnly properly configured")
                        else:
                            secure_patterns.append(f"{rel_path}: Using secure defaults")
                        
                except Exception as e:
                    print(f"  Warning: Could not analyze {rel_path}: {e}")
        
        if not vulnerable_patterns:
            if secure_patterns:
                print(f"✓ Cookie HTTPOnly: Analyzed {files_analyzed} settings files, found {len(secure_patterns)} with proper HTTPOnly configuration")
            else:
                print(f"✓ Cookie HTTPOnly: Analyzed {files_analyzed} settings files - no HTTPOnly vulnerabilities detected")
            return True
        else:
            print(f"✗ Cookie HTTPOnly: Found {len(vulnerable_patterns)} configuration issues with cookie HTTPOnly settings")
            for issue in vulnerable_patterns[:3]:
                print(f"  - {issue}")
            return False
            
    except AssertionError as e:
        print(f"✗ Cookie HTTPOnly: {e}")
        return False
    except Exception as e:
        print(f"✗ Cookie HTTPOnly: Unexpected error - {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    test_cookie_httponly()

