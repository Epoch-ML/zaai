#!/usr/bin/env python3
"""
A06: Vulnerable Components Vulnerability Test
Verifies that vulnerable dependencies have been fixed in environment requirements.txt
"""

import re
from security_interface import get_environment_files


def test_dependencies_remediation(zerg_state=None):
    """
    Test that vulnerable components have been fixed in environment files.
    Checks for known vulnerable package versions in requirements.txt.
    """
    try:
        assert zerg_state, "Vulnerable components test requires valid zerg_state"
        
        # Get environment files from interface
        env_files = get_environment_files()
        
        if not env_files:
            print("✗ Vulnerable Components: No environment files found")
            return False
        
        vulnerable_patterns = []
        secure_patterns = []
        files_analyzed = 0
        
        vulnerable_versions = {
            'Django': ['1.8', '1.9', '1.10', '1.11', '2.0', '2.1', '2.2.0'],
            'Pillow': ['2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6'],
        }
        
        for rel_path, content in env_files.items():
            if "requirements.txt" in rel_path and rel_path.startswith("djangogoat"):
                try:
                    files_analyzed += 1
                    
                    lines = content.split('\n')
                    has_vulnerable = False
                    
                    for line in lines:
                        line = line.strip()
                        if not line or line.startswith('#'):
                            continue
                        
                        for package, versions in vulnerable_versions.items():
                            for vuln_version in versions:
                                if f"{package}=={vuln_version}" in line:
                                    has_vulnerable = True
                    
                    if has_vulnerable:
                        vulnerable_patterns.append(rel_path)
                    else:
                        secure_patterns.append(rel_path)
                        
                except Exception as e:
                    print(f"  Warning: Could not analyze {rel_path}: {e}")
        
        if not vulnerable_patterns:
            if secure_patterns:
                print(f"✓ Vulnerable Components: Analyzed {files_analyzed} environment files, found {len(secure_patterns)} with secure dependencies")
            else:
                print(f"✓ Vulnerable Components: Analyzed {files_analyzed} environment files - no vulnerable components detected")
            return True
        else:
            print(f"✗ Vulnerable Components: Found {len(vulnerable_patterns)} environment files with vulnerable dependencies")
            for issue in vulnerable_patterns[:3]:
                print(f"  - {issue}")
            return False
            
    except AssertionError as e:
        print(f"✗ Vulnerable Components: {e}")
        return False
    except Exception as e:
        print(f"✗ Vulnerable Components: Unexpected error - {e}")
        import traceback
        traceback.print_exc()
        return False
