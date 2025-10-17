#!/usr/bin/env python3
"""
A05: Security Misconfiguration Vulnerability Test
Verifies that security misconfigurations have been fixed in environment settings.py
"""

import re
from security_interface import get_environment_files


def test_configuration_remediation(zerg_state=None):
    """
    Test that security misconfigurations have been fixed in environment files.
    Checks for proper Django configuration and security middleware.
    """
    try:
        assert zerg_state, "Security misconfiguration test requires valid zerg_state"
        
        # Get environment files from interface
        env_files = get_environment_files()
        
        if not env_files:
            print("✗ Security Misconfiguration: No environment files found")
            return False
        
        vulnerable_patterns = []
        secure_patterns = []
        files_analyzed = 0
        
        for rel_path, content in env_files.items():
            if "settings.py" in rel_path and rel_path.startswith("djangogoat"):
                try:
                    files_analyzed += 1
                    
                    debug_disabled = "DEBUG = False" in content or "DEBUG=False" in content
                    debug_enabled = "DEBUG = True" in content or "DEBUG=True" in content
                    
                    has_allowed_hosts = "ALLOWED_HOSTS" in content and not re.search(r"ALLOWED_HOSTS\s*=\s*\[\s*\]|\*", content)
                    has_csrf = "CsrfViewMiddleware" in content or "csrf" in content.lower()
                    has_session = "SessionMiddleware" in content
                    has_security = "SecurityMiddleware" in content
                    
                    if debug_enabled:
                        vulnerable_patterns.append(rel_path)
                    elif debug_disabled and (has_allowed_hosts or has_csrf or has_session or has_security):
                        secure_patterns.append(rel_path)
                        
                except Exception as e:
                    print(f"  Warning: Could not analyze {rel_path}: {e}")
        
        if not vulnerable_patterns:
            if secure_patterns:
                print(f"✓ Security Misconfiguration: Analyzed {files_analyzed} environment files, found {len(secure_patterns)} with proper configuration")
            else:
                print(f"✓ Security Misconfiguration: Analyzed {files_analyzed} environment files - no security misconfigurations detected")
            return True
        else:
            print(f"✗ Security Misconfiguration: Found {len(vulnerable_patterns)} environment files with security misconfigurations")
            for issue in vulnerable_patterns[:3]:
                print(f"  - {issue}")
            return False
            
    except AssertionError as e:
        print(f"✗ Security Misconfiguration: {e}")
        return False
    except Exception as e:
        print(f"✗ Security Misconfiguration: Unexpected error - {e}")
        import traceback
        traceback.print_exc()
        return False
