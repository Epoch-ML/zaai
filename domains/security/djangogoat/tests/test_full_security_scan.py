"""
Test: Full DjangoGoat Security Scan with OWASP ZAP
Runs the complete behave test suite and validates ZAP security findings.

This test is self-contained and handles all dependency installation automatically.
No separate setup stages are required.
"""

import os
import sys
import subprocess
import re
from pathlib import Path


def test_full_security_scan(zerg_state=None):
    """
    Run the full DjangoGoat test suite with OWASP ZAP and validate results.
        
    Returns:
        True if all tests pass and no vulnerabilities found, False otherwise
    """

    def parse_test_results(output):
        """Extract test pass/fail counts."""
        results = {}
        
        patterns = [
            ('features', r'(\d+)\s+features?\s+passed.*?(\d+)\s+failed'),
            ('scenarios', r'(\d+)\s+scenarios?\s+passed.*?(\d+)\s+failed'),
            ('steps', r'(\d+)\s+steps?\s+passed.*?(\d+)\s+failed'),
        ]
        
        for name, pattern in patterns:
            match = re.search(pattern, output)
            if match:
                results[f'{name}_passed'] = int(match.group(1))
                results[f'{name}_failed'] = int(match.group(2))
        
        return results
    
    def parse_alert_details(djangogoat_path):
        """Parse alerts from HTML report. Returns (alerts_list, report_found_bool)."""
        report_path = Path(djangogoat_path) / 'report.html'
        if not report_path.exists():
            return None, False
        
        try:
            content = report_path.read_text(encoding='utf-8')
            alerts = []
            
            pattern = r'<th[^>]*class="risk-(\d+)"[^>]*>.*?<div>(\w+)</div>.*?</th>\s*<th[^>]*class="risk-\d+"[^>]*>([^<]+)</th>'
            risk_map = {'3': 'High', '2': 'Medium', '1': 'Low', '0': 'Informational'}
            
            for match in re.finditer(pattern, content, re.DOTALL):
                risk = risk_map.get(match.group(1), 'Unknown')
                name = match.group(3).strip()
                
                # Extract URLs from section
                section = content[match.start():match.start() + 5000]
                urls = re.findall(r'class="indent1">URL</td>\s*<td[^>]*>(?:<a[^>]*>)?([^<]+)', section)
                
                for url in urls:
                    alerts.append({'name': name, 'risk': risk, 'url': url.strip()})
            
            return alerts, True
        except Exception:
            return None, False
    
    def filter_important_alerts(alerts):
        """Filter out ignored alerts (CSP, Low, and Informational severity)."""
        ignored_names = {
            'Content Security Policy (CSP) Header Not Set',
            'Server Leaks Version Information via "Server" HTTP Response Header Field',
        }
        ignored_risks = {'Low', 'Informational'}
        
        return [
            a for a in alerts
            if a['risk'] not in ignored_risks
            and a['name'] not in ignored_names
            and 'csp' not in a['name'].lower()
            and 'content security policy' not in a['name'].lower()
        ]

    def fail_test(djangogoat_path):
        report_path = Path(djangogoat_path) / 'report.html'

        if report_path.exists():
            print(f"Deleting report.html: {report_path}")
            report_path.unlink()
        else:
            print(f"report.html not found: {report_path}")
    
        return False
    
    def validate_results(output, djangogoat_path):
        """Parse output and determine pass/fail."""
        
        # Parse test results from behave output
        test_results = parse_test_results(output)
        has_test_failures = (
            test_results.get('features_failed', 0) > 0 or
            test_results.get('scenarios_failed', 0) > 0 or
            test_results.get('steps_failed', 0) > 0
        )
        
        # Parse ZAP alerts directly from report.html
        print("\nParsing ZAP security report...")
        parsed_alerts, report_found = parse_alert_details(djangogoat_path)
        if not report_found:
            print("✗ report.html not found - ZAP scan did not produce a report")
            return False
    
        all_alerts = parsed_alerts or []
        important_alerts = filter_important_alerts(all_alerts)
        
        # Display concise summary
        print("\nSummary:")
        if test_results:
            print(
                "  Behave:"
                f" features {test_results.get('features_passed', 0)} pass/{test_results.get('features_failed', 0)} fail;"
                f" scenarios {test_results.get('scenarios_passed', 0)} pass/{test_results.get('scenarios_failed', 0)} fail;"
                f" steps {test_results.get('steps_passed', 0)} pass/{test_results.get('steps_failed', 0)} fail"
            )
        else:
            print("  Behave: no summary found")

        ignored_alerts = len(all_alerts) - len(important_alerts)
        print(
            f"  ZAP: total {len(all_alerts)}, high/medium {len(important_alerts)}, ignored {ignored_alerts}"
        )

        if important_alerts:
            grouped_by_risk = {}
            for alert in important_alerts:
                grouped_by_risk.setdefault(alert['risk'], {}).setdefault(alert['name'], []).append(alert['url'])

            print("  Alerts:")
            for risk_level in ['High', 'Medium']:
                risk_group = grouped_by_risk.get(risk_level)
                if not risk_group:
                    continue
                print(f"    {risk_level}:")
                for name, urls in sorted(risk_group.items()):
                    unique_urls = list(dict.fromkeys(urls))
                    shown = unique_urls[:3]
                    more = len(unique_urls) - len(shown)
                    url_text = ", ".join(shown)
                    if more > 0:
                        url_text += f", ... +{more}"
                    print(f"      - {name}: {url_text}")
        else:
            print("  Alerts: none (high/medium)")

        # Determine pass/fail
        passed = not has_test_failures and not important_alerts

        if passed:
            print("\n✅ Scan passed.")
        else:
            reasons = []
            if has_test_failures:
                reasons.append("behave failures")
            if important_alerts:
                reasons.append("high/medium ZAP alerts")
            reason_text = ", ".join(reasons) if reasons else "unknown issues"
            print(f"\n❌ Scan failed ({reason_text}).")
        
        return passed
    
    # ========== Main test execution starts here ==========
    
    from security_interface import get_djangogoat_path, get_poetry_env
    
    djangogoat_path = Path(get_djangogoat_path())
    if not djangogoat_path.exists():
        print("✗ DjangoGoat directory not found", file=sys.stderr)
        return fail_test(djangogoat_path)
    
    # Setup environment
    env_vars = os.environ.copy()
    cached_env = get_poetry_env()
    if cached_env:
        env_vars.update(cached_env)
    env_vars['DJANGO_SETTINGS_MODULE'] = 'djangogoat.settings'
    env_vars['DJANGO_SECRET_KEY'] = 'insecure-behave-secret-key'
    
    # Change to DjangoGoat directory
    original_dir = os.getcwd()
    os.chdir(djangogoat_path)
    
    try:
        print("Starting DjangoGoat security scan...")
        
        # Run full test suite via shell script, capture output
        script_path = Path(__file__).parent / 'run_full_test.sh'
        result = subprocess.run(
            ['bash', str(script_path)],
            env=env_vars,
            timeout=1800,
            capture_output=True,
            text=True
        )
        
        # Print all output to stdout
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(result.stderr, file=sys.stderr)

        if result.returncode != 0:
            print("✗ run_full_test.sh failed - server or behave execution did not complete")
            return fail_test(djangogoat_path)
        
        # Use captured output for parsing
        output = result.stdout or ""
        if not output:
            print("✗ No output from test execution")
            return fail_test(djangogoat_path)
        
        # Parse and validate results (reads from report.html)
        validation_result = validate_results(output, djangogoat_path)
        

        cleanup_script_path = Path(__file__).parent / 'cleanup_report.sh'
        cleanup_result = subprocess.run(
            ['bash', str(cleanup_script_path), str(djangogoat_path)],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if cleanup_result.returncode != 0:
            print(f"⚠ Warning: Cleanup script failed: {cleanup_result.stderr}", file=sys.stderr)
        elif cleanup_result.stdout:
            print(cleanup_result.stdout.strip())
        
        return validation_result
        
    except subprocess.TimeoutExpired:
        print("✗ Tests timed out (30 minutes)")
        return fail_test(djangogoat_path)
    except Exception as e:
        print(f"✗ Error running tests: {e}", file=sys.stderr)
        return fail_test(djangogoat_path)
    finally:
        os.chdir(original_dir)
