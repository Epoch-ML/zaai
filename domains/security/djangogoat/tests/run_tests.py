#!/usr/bin/env python3
"""
PyGoat Security Test Runner
Universal interface for running OWASP Top 10 vulnerability tests
"""

import sys
import os
from pathlib import Path

# Add the tests directory to the Python path
sys.path.insert(0, str(Path(__file__).parent))

from security_tests import SecurityTestInterface, run_all_security_tests


def main():
    """Run all security tests and report results"""
    print("="*60)
    print("PYGOAT SECURITY TESTING SUITE")
    print("OWASP Top 10 Vulnerability Detection")
    print("="*60)
    
    try:
        # Run all security tests
        results = run_all_security_tests()
        
        # Report results
        print("\n" + "="*60)
        print("SECURITY TEST RESULTS")
        print("="*60)
        
        total_tests = len(results)
        vulnerabilities_found = 0
        
        for test_name, (has_vulnerabilities, details) in results.items():
            status = "❌ VULNERABILITIES FOUND" if has_vulnerabilities else "✅ SECURE"
            print(f"{test_name}: {status}")
            
            if has_vulnerabilities:
                vulnerabilities_found += 1
                print(f"  Details: {details}")
        
        print(f"\nSummary: {vulnerabilities_found}/{total_tests} tests found vulnerabilities")
        
        if vulnerabilities_found > 0:
            print("\n🔒 SECURITY REMEDIATION REQUIRED")
            print("Agent should patch the identified vulnerabilities")
            return False
        else:
            print("\n🛡️  ALL SECURITY TESTS PASSED")
            print("No vulnerabilities detected - PyGoat is secure!")
            return True
            
    except Exception as e:
        print(f"ERROR: Test execution failed: {e}")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
