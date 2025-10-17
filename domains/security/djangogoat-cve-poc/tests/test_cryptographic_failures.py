#!/usr/bin/env python3
"""
A02: Cryptographic Failures Vulnerability Test
Verifies that cryptographic issues have been fixed in environment files
"""

import re
from security_interface import get_environment_files


def test_cryptographic_failures_remediation(zerg_state=None):
    """
    Test that cryptographic failures have been fixed in environment files.
    Checks for proper encryption, secure hashing, and key management.
    """
    try:
        assert zerg_state, "Cryptographic failures test requires valid zerg_state"
        
        # Get environment files from interface
        env_files = get_environment_files()
        
        if not env_files:
            print("✗ Cryptographic Failures: No environment files found")
            return False
        
        vulnerable_patterns = []
        secure_patterns = []
        files_analyzed = 0
        
        # Check environment files for cryptographic failures
        for rel_path, content in env_files.items():
            if rel_path.startswith("djangogoat") and rel_path.endswith(".py"):
                try:
                    files_analyzed += 1
                    
                    # Check for weak crypto (unfixed)
                    has_md5 = re.search(r"MD5|md5\(\)|hashlib\.md5", content)
                    has_sha1 = re.search(r"SHA1|sha1\(\)|hashlib\.sha1", content)
                    
                    # Check for strong crypto (fixed)
                    has_strong_hash = re.search(r"SHA256|SHA512|bcrypt|Argon2|PBKDF2", content)
                    has_fernet = "Fernet" in content or "cryptography" in content
                    
                    if has_md5 or has_sha1:
                        vulnerable_patterns.append(rel_path)
                    elif has_strong_hash or has_fernet:
                        secure_patterns.append(rel_path)
                        
                except Exception as e:
                    print(f"  Warning: Could not analyze {rel_path}: {e}")
        
        if not vulnerable_patterns:
            if secure_patterns:
                print(f"✓ Cryptographic Failures: Analyzed {files_analyzed} environment files, found {len(secure_patterns)} with strong cryptography")
            else:
                print(f"✓ Cryptographic Failures: Analyzed {files_analyzed} environment files - no cryptographic failures detected")
            return True
        else:
            print(f"✗ Cryptographic Failures: Found {len(vulnerable_patterns)} environment files with cryptographic issues")
            for issue in vulnerable_patterns[:3]:
                print(f"  - {issue}")
            return False
            
    except AssertionError as e:
        print(f"✗ Cryptographic Failures: {e}")
        return False
    except Exception as e:
        print(f"✗ Cryptographic Failures: Unexpected error - {e}")
        import traceback
        traceback.print_exc()
        return False
