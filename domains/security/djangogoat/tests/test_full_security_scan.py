"""
Test: Full DjangoGoat Security Scan with OWASP ZAP
Runs the complete behave test suite and validates ZAP security findings.
"""

import os
import subprocess
import re
from pathlib import Path
from datetime import datetime


def test_full_security_scan(zerg_state=None):
    """
    Run the full DjangoGoat test suite with OWASP ZAP and validate results.
        
    Returns:
        True if all tests pass and no vulnerabilities found, False otherwise
    """
    
    # Global log file handle and paths
    log_file_handle = {'file': None}
    LOG_DIR = Path(__file__).parent
    TEST_LOG_PATH = LOG_DIR / 'djangogoat_security_test.log'
    START_SERVER_LOG = LOG_DIR / 'djangogoat_start_server.log'
    STOP_SERVER_LOG = LOG_DIR / 'djangogoat_stop_server.log'
    BEHAVE_LOG = LOG_DIR / 'djangogoat_behave.log'
    FULL_TEST_LOG = LOG_DIR / 'djangogoat_full_test.log'
    
    def log_print(*args, **kwargs):
        """Print to console and append to log file."""
        # Filter kwargs to only include valid print() arguments
        valid_print_kwargs = {'sep', 'end', 'file', 'flush'}
        print_kwargs = {k: v for k, v in kwargs.items() if k in valid_print_kwargs}
        
        # Print to console
        print(*args, **print_kwargs)
        
        # Also write to log file if it's open
        if log_file_handle['file']:
            sep = kwargs.get('sep', ' ')
            end = kwargs.get('end', '\n')
            message = sep.join(str(arg) for arg in args)
            log_file_handle['file'].write(message + end)
            log_file_handle['file'].flush()
    
    def open_log_file(log_path):
        """Open the log file for writing."""
        log_file_handle['file'] = open(log_path, 'w', encoding='utf-8')
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_file_handle['file'].write(f"="*70 + "\n")
        log_file_handle['file'].write(f"DjangoGoat Security Scan Log\n")
        log_file_handle['file'].write(f"Started: {timestamp}\n")
        log_file_handle['file'].write(f"="*70 + "\n\n")
        log_file_handle['file'].flush()
    
    def close_log_file():
        """Close the log file."""
        if log_file_handle['file']:
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            log_file_handle['file'].write(f"\n" + "="*70 + "\n")
            log_file_handle['file'].write(f"Completed: {timestamp}\n")
            log_file_handle['file'].write(f"="*70 + "\n")
            log_file_handle['file'].close()
            log_file_handle['file'] = None

    def log_run_artifacts(label="Check log files"):
        """List log artifacts that capture full run output."""
        log_print(f"  {label}:")
        log_print(f"    • Summary: {TEST_LOG_PATH}")
        log_print(f"    • Full run: {FULL_TEST_LOG}")
        log_print(f"    • Behave: {BEHAVE_LOG}")
        log_print(f"    • Server start: {START_SERVER_LOG}")
        log_print(f"    • Server stop: {STOP_SERVER_LOG}")
    
    def read_test_output():
        """Read behave output log."""
        if BEHAVE_LOG.exists():
            return BEHAVE_LOG.read_text(encoding='utf-8', errors='ignore')
        return None

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
        log_print("\nParsing ZAP security report...")
        parsed_alerts, report_found = parse_alert_details(djangogoat_path)
        if not report_found:
            log_print("✗ report.html not found - ZAP scan did not produce a report")
            log_run_artifacts("See logs for details")
            return False
    
        all_alerts = parsed_alerts or []
        important_alerts = filter_important_alerts(all_alerts)
        
        # Display concise summary
        log_print("\nSummary:")
        if test_results:
            log_print(
                "  Behave:"
                f" features {test_results.get('features_passed', 0)} pass/{test_results.get('features_failed', 0)} fail;"
                f" scenarios {test_results.get('scenarios_passed', 0)} pass/{test_results.get('scenarios_failed', 0)} fail;"
                f" steps {test_results.get('steps_passed', 0)} pass/{test_results.get('steps_failed', 0)} fail"
            )
        else:
            log_print("  Behave: no summary found")

        ignored_alerts = len(all_alerts) - len(important_alerts)
        log_print(
            f"  ZAP: total {len(all_alerts)}, high/medium {len(important_alerts)}, ignored {ignored_alerts}"
        )

        if important_alerts:
            grouped_by_risk = {}
            for alert in important_alerts:
                grouped_by_risk.setdefault(alert['risk'], {}).setdefault(alert['name'], []).append(alert['url'])

            log_print("  Alerts:")
            for risk_level in ['High', 'Medium']:
                risk_group = grouped_by_risk.get(risk_level)
                if not risk_group:
                    continue
                log_print(f"    {risk_level}:")
                for name, urls in sorted(risk_group.items()):
                    unique_urls = list(dict.fromkeys(urls))
                    shown = unique_urls[:3]
                    more = len(unique_urls) - len(shown)
                    url_text = ", ".join(shown)
                    if more > 0:
                        url_text += f", ... +{more}"
                    log_print(f"      - {name}: {url_text}")
        else:
            log_print("  Alerts: none (high/medium)")

        # Determine pass/fail
        passed = not has_test_failures and not important_alerts

        if passed:
            log_print(f"\n✅ Scan passed. Summary log: {TEST_LOG_PATH}")
        else:
            reasons = []
            if has_test_failures:
                reasons.append("behave failures")
            if important_alerts:
                reasons.append("high/medium ZAP alerts")
            reason_text = ", ".join(reasons) if reasons else "unknown issues"
            log_print(f"\n❌ Scan failed ({reason_text}). See logs for details.")
            log_run_artifacts("Key logs")
        
        return passed
    
    # ========== Main test execution starts here ==========
    
    from security_interface import get_djangogoat_path, get_poetry_env
    
    djangogoat_path = Path(get_djangogoat_path())
    if not djangogoat_path.exists():
        print("✗ DjangoGoat directory not found")
        return False
        
    # Open log file
    open_log_file(TEST_LOG_PATH)
    
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
        log_print("Starting DjangoGoat security scan (details recorded in tests/djangogoat_security_test.log)...")
        
        # Run full test suite via shell script (stream output directly)
        script_path = Path(__file__).parent / 'run_full_test.sh'
        result = subprocess.run(
            ['bash', str(script_path)],
            env=env_vars,
            timeout=1800
        )

        if result.returncode != 0:
            log_print("✗ run_full_test.sh failed - server or behave execution did not complete")
            log_print("  Review the console output above and saved logs.")
            log_run_artifacts("Log files")
            return False
        
        # Read test output from file
        output = read_test_output()
        if not output:
            log_print("✗ Could not read behave output log")
            log_run_artifacts("Log files")
            return False
        
        # Parse and validate results (reads from report.html)
        return validate_results(output, djangogoat_path)
        
    except subprocess.TimeoutExpired:
        log_print("✗ Tests timed out (30 minutes)")
        log_run_artifacts("Log files")
        return False
    except Exception as e:
        log_print(f"✗ Error running tests: {e}")
        log_run_artifacts("Log files")
        return False
    finally:
        close_log_file()
        os.chdir(original_dir)
