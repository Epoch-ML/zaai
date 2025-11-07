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
    
    def read_test_output():
        """Read behave output log."""
        if BEHAVE_LOG.exists():
            return BEHAVE_LOG.read_text(encoding='utf-8', errors='ignore')
        return None

    def dump_log(log_path, label, max_lines=1000):
        """Print the tail of a log file."""
        log_print(f"\n--- {label} (last {max_lines} lines) ---")
        if not log_path.exists():
            log_print(f"(log file not found: {log_path})")
            return
        try:
            with log_path.open('r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
            tail = lines[-max_lines:] if max_lines else lines
            for line in tail:
                log_print(line.rstrip())
        except Exception as exc:
            log_print(f"(failed to read {log_path}: {exc})")
    
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
            if a['name'] not in ignored_names and a['risk'] not in ignored_risks
        ]
    
    def display_alert_summary(alerts):
        """Display count of alerts by type."""
        summary = {}
        for alert in alerts:
            key = (alert['name'], alert['risk'])
            summary[key] = summary.get(key, 0) + 1
        
        risk_order = {'High': 0, 'Medium': 1, 'Low': 2, 'Informational': 3}
        sorted_alerts = sorted(summary.items(), key=lambda x: (risk_order.get(x[0][1], 999), x[0][0]))
        
        log_print("\nAlert Summary:")
        for (name, risk), count in sorted_alerts:
            log_print(f"  [{risk}] {name}: {count} URLs")
    
    def display_important_alerts(alerts):
        """Display important alerts by risk level (High and Medium only)."""
        for risk_level in ['High', 'Medium']:
            level_alerts = [a for a in alerts if a['risk'] == risk_level]
            if not level_alerts:
                continue
                
            log_print(f"\n{'='*70}")
            log_print(f"[{risk_level.upper()} SEVERITY ALERTS]")
            log_print('='*70)
            
            by_name = {}
            for alert in level_alerts:
                name = alert['name']
                by_name.setdefault(name, []).append(alert['url'])
            
            for name, urls in by_name.items():
                log_print(f"\n  {name}")
                log_print(f"  Found at {len(urls)} location(s):")
                for i, url in enumerate(urls, 1):
                    log_print(f"    {i}. {url}")
    
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
            dump_log(FULL_TEST_LOG, "Full test log")
            dump_log(BEHAVE_LOG, "Behave log")
            dump_log(START_SERVER_LOG, "Start server log")
            dump_log(STOP_SERVER_LOG, "Stop server log")
        return False
    
        all_alerts = parsed_alerts or []
        important_alerts = filter_important_alerts(all_alerts)
        
        # Display results
        log_print("\n" + "="*70)
        log_print("TEST RESULTS")
        log_print("="*70)
        
        if test_results:
            log_print(f"\nBehave Tests:")
            log_print(f"  Features: {test_results.get('features_passed', 0)} passed, "
                      f"{test_results.get('features_failed', 0)} failed")
            log_print(f"  Scenarios: {test_results.get('scenarios_passed', 0)} passed, "
                      f"{test_results.get('scenarios_failed', 0)} failed")
            log_print(f"  Steps: {test_results.get('steps_passed', 0)} passed, "
                      f"{test_results.get('steps_failed', 0)} failed")
        
        if all_alerts:
            log_print(f"\nZAP Security Scan:")
            log_print(f"  Total alerts: {len(all_alerts)}")
            log_print(f"  High/Medium: {len(important_alerts)}")
            log_print(f"  Ignored (Low/Info/CSP): {len(all_alerts) - len(important_alerts)}")
            display_alert_summary(all_alerts)
        else:
            log_print("\nZAP Security Scan: No alerts reported")
        
        if important_alerts:
            log_print(f"\n⚠️  CRITICAL SECURITY ISSUES FOUND: {len(important_alerts)}")
            display_important_alerts(important_alerts)
        else:
            log_print("\n✓ No HIGH or MEDIUM severity security issues found")
        
        # Determine pass/fail
        passed = not has_test_failures and not important_alerts
        
        log_print("\n" + "="*70)
        log_print("PASSED ✓" if passed else "FAILED ✗")
        log_print("="*70 + "\n")
        
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
        log_print("Running DjangoGoat security test suite...")
        log_print("(Server startup/shutdown is silent - check report.html for details)")
        
        # Run full test suite via shell script (completely silent)
        script_path = Path(__file__).parent / 'run_full_test.sh'
        result = subprocess.run(
            ['bash', str(script_path)],
            env=env_vars,
            timeout=1800,
            capture_output=True  # Suppress all output from shell scripts
        )

        if result.returncode != 0:
            log_print("✗ run_full_test.sh failed - server or behave execution did not complete")
            stdout = result.stdout.decode('utf-8', errors='ignore') if isinstance(result.stdout, bytes) else result.stdout
            stderr = result.stderr.decode('utf-8', errors='ignore') if isinstance(result.stderr, bytes) else result.stderr
            if stdout:
                log_print("\n--- run_full_test.sh STDOUT ---")
                log_print(stdout)
            if stderr:
                log_print("\n--- run_full_test.sh STDERR ---")
                log_print(stderr)
            dump_log(FULL_TEST_LOG, "Full test log")
            dump_log(START_SERVER_LOG, "Start server log")
            dump_log(BEHAVE_LOG, "Behave log")
            dump_log(STOP_SERVER_LOG, "Stop server log")
            return False
        
        # Read test output from file
        output = read_test_output()
        if not output:
            log_print("✗ Could not read behave output log")
            dump_log(BEHAVE_LOG, "Behave log")
            dump_log(FULL_TEST_LOG, "Full test log")
            return False
        
        # Parse and validate results (reads from report.html)
        return validate_results(output, djangogoat_path)
        
    except subprocess.TimeoutExpired:
        log_print("✗ Tests timed out (30 minutes)")
        dump_log(FULL_TEST_LOG, "Full test log")
        dump_log(START_SERVER_LOG, "Start server log")
        dump_log(BEHAVE_LOG, "Behave log")
        dump_log(STOP_SERVER_LOG, "Stop server log")
        return False
    except Exception as e:
        log_print(f"✗ Error running tests: {e}")
        dump_log(FULL_TEST_LOG, "Full test log")
        dump_log(START_SERVER_LOG, "Start server log")
        dump_log(BEHAVE_LOG, "Behave log")
        dump_log(STOP_SERVER_LOG, "Stop server log")
        return False
    finally:
        close_log_file()
        os.chdir(original_dir)
