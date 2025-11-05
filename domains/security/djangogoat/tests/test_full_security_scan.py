"""
Test: Full DjangoGoat Security Scan with OWASP ZAP
Runs the complete behave test suite and validates ZAP security findings.
"""

import os
import subprocess
import re
import time
import socket
from pathlib import Path


def test_full_security_scan(zerg_state=None):
    """
    Run the full DjangoGoat test suite with OWASP ZAP and validate results.
    
    This test:
    1. Starts the Django server (gunicorn)
    2. Runs 'poetry run behave' in the DjangoGoat directory
    3. Parses ZAP alert counts by severity level
    4. Parses test pass/fail results
    5. Shuts down the Django server
    6. Validates that there are no security alerts and all tests pass
    
    Args:
        zerg_state: Optional state object (not required for this test)
        
    Returns:
        True if all tests pass and no vulnerabilities found, False otherwise
    """
    
    def get_poetry_env_vars():
        """
        Get Poetry environment variables from cache set by stages.
        Requires stages to have run first - does not set up environment on its own.
        """
        from security_interface import get_poetry_env
        
        # Get cached environment from stages
        cached_env = get_poetry_env()
        if cached_env:
            # Merge with current environment
            env_vars = os.environ.copy()
            env_vars.update(cached_env)
            return env_vars
        
        # No cache found - stages didn't run or failed
        # Return current environment and let the test fail with helpful message
        return os.environ.copy()
    
    def poetry_run_with_setup(cmd, **kwargs):
        """
        Wrapper for subprocess.run that uses cached Poetry environment from stages.
        All commands share the same virtualenv via environment variables.
        """
        env_vars = get_poetry_env_vars()
        
        # Add environment to kwargs if not already specified
        if 'env' not in kwargs:
            kwargs['env'] = env_vars
        
        # Run the actual command
        return subprocess.run(cmd, **kwargs)
    
    def is_port_in_use(port, host='127.0.0.1'):
        """Check if a port is already in use."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.connect((host, port))
                return True
            except (socket.error, ConnectionRefusedError):
                return False
    
    def wait_for_server(port=3572, host='127.0.0.1', timeout=30):
        """Wait for the server to be ready to accept connections."""
        start_time = time.time()
        while time.time() - start_time < timeout:
            if is_port_in_use(port, host):
                return True
            time.sleep(0.5)
        return False
    
    def parse_behave_output(output):
        """
        Parse behave test output to extract test results.
        
        Expected format:
        "X features passed, Y failed, Z skipped"
        "X scenarios passed, Y failed, Z skipped"
        "X steps passed, Y failed, Z skipped"
        """
        results = {
            'features_passed': 0,
            'features_failed': 0,
            'scenarios_passed': 0,
            'scenarios_failed': 0,
            'steps_passed': 0,
            'steps_failed': 0,
        }
        
        # Match pattern: "X feature(s) passed, Y failed"
        feature_match = re.search(r'(\d+)\s+features?\s+passed.*?(\d+)\s+failed', output)
        if feature_match:
            results['features_passed'] = int(feature_match.group(1))
            results['features_failed'] = int(feature_match.group(2))
        
        scenario_match = re.search(r'(\d+)\s+scenarios?\s+passed.*?(\d+)\s+failed', output)
        if scenario_match:
            results['scenarios_passed'] = int(scenario_match.group(1))
            results['scenarios_failed'] = int(scenario_match.group(2))
        
        step_match = re.search(r'(\d+)\s+steps?\s+passed.*?(\d+)\s+failed', output)
        if step_match:
            results['steps_passed'] = int(step_match.group(1))
            results['steps_failed'] = int(step_match.group(2))
        
        return results
    
    def parse_zap_alerts(output, djangogoat_path):
        """
        Parse ZAP alerts from behave output and report.html file.
        
        Looks for:
        1. "There are X Zap alerts." in the output
        2. "Alerts by Risk Level:" structured output
        3. Parses report.html if available for detailed breakdown by severity
        """
        results = {
            'total': 0,
            'by_risk': {}
        }
        
        # Try to get total from output
        alert_match = re.search(r'There are (\d+) Zap alerts?\.', output)
        if alert_match:
            results['total'] = int(alert_match.group(1))
        
        # Try to parse structured output from environment.py
        if 'Alerts by Risk Level:' in output:
            risk_section = output.split('Alerts by Risk Level:')[1].split('\n\n')[0]
            
            high_match = re.search(r'High:\s*(\d+)', risk_section)
            medium_match = re.search(r'Medium:\s*(\d+)', risk_section)
            low_match = re.search(r'Low:\s*(\d+)', risk_section)
            info_match = re.search(r'Informational:\s*(\d+)', risk_section)
            
            if high_match:
                count = int(high_match.group(1))
                if count > 0:
                    results['by_risk']['High'] = count
            if medium_match:
                count = int(medium_match.group(1))
                if count > 0:
                    results['by_risk']['Medium'] = count
            if low_match:
                count = int(low_match.group(1))
                if count > 0:
                    results['by_risk']['Low'] = count
            if info_match:
                count = int(info_match.group(1))
                if count > 0:
                    results['by_risk']['Informational'] = count
        
        return results
    
    def parse_detailed_alerts(djangogoat_path):
        """
        Parse detailed alert information from HTML report.
        Returns list of alerts with name, risk, URL, and description.
        """
        report_path = Path(djangogoat_path) / 'report.html'
        if not report_path.exists():
            return []
        
        try:
            with open(report_path, 'r', encoding='utf-8') as f:
                report_content = f.read()
            
            detailed_alerts = []
            
            # Find all alert tables
            # Pattern: <th class="risk-X">Alert Name</th>
            alert_matches = re.finditer(
                r'<th[^>]*class="risk-(\d+)"[^>]*>.*?<div>(\w+)</div>.*?</th>\s*<th[^>]*class="risk-\d+"[^>]*>([^<]+)</th>',
                report_content,
                re.DOTALL
            )
            
            for match in alert_matches:
                risk_code = match.group(1)
                risk_text = match.group(2).strip()
                alert_name = match.group(3).strip()
                
                # Map risk code to text
                risk_map = {'3': 'High', '2': 'Medium', '1': 'Low', '0': 'Informational'}
                risk = risk_map.get(risk_code, risk_text)
                
                # Find the table containing this alert
                start_pos = match.start()
                # Find next table closing or next alert
                end_match = re.search(r'</table>|<th[^>]*class="risk-', report_content[start_pos + len(match.group(0)):])
                if end_match:
                    section = report_content[start_pos:start_pos + len(match.group(0)) + end_match.start()]
                else:
                    section = report_content[start_pos:start_pos + 5000]  # Get next 5000 chars
                
                # Extract URLs from this section
                url_matches = re.findall(r'class="indent1">URL</td>\s*<td[^>]*>(?:<a[^>]*>)?([^<]+)', section)
                
                for url in url_matches:
                    detailed_alerts.append({
                        'name': alert_name,
                        'risk': risk,
                        'url': url.strip()
                    })
            
            # Sort by risk level
            risk_order = {'High': 0, 'Medium': 1, 'Low': 2, 'Informational': 3, 'Unknown': 4}
            detailed_alerts.sort(key=lambda x: (risk_order.get(x['risk'], 999), x['name']))
            
            return detailed_alerts
        except Exception as e:
            return []
    
    # Main test logic starts here
    # Get the environment interface to locate DjangoGoat
    from security_interface import get_djangogoat_path
    djangogoat_path = Path(get_djangogoat_path())

    if not djangogoat_path.exists():
        print(f"✗ DjangoGoat directory not found")
        return False
    
    # Change to DjangoGoat directory and run tests
    original_dir = os.getcwd()
    server_process = None
    server_was_running = False  # Track if we need to shut down the server
    
    try:
        os.chdir(djangogoat_path)
        
        # Get Poetry environment variables for all commands
        env_vars = get_poetry_env_vars()
        
        # Set Django environment variables
        env_vars['DJANGO_SETTINGS_MODULE'] = 'djangogoat.settings'
        env_vars['DJANGO_SECRET_KEY'] = 'insecure-behave-secret-key'
        
        # Check if server is already running
        if is_port_in_use(3572):
            server_was_running = True
        else:
            # Start Django development server
            server_process = subprocess.Popen(
                ['poetry', 'run', 'python', 'manage.py', 'runserver', '127.0.0.1:3572', '--noreload'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env_vars
            )
            
            # Wait for server to be ready
            if wait_for_server(port=3572, timeout=30):
                server_was_running = False
            else:
                print("✗ Server failed to start")
                if server_process:
                    server_process.terminate()
                return False
        
        try:
            result = poetry_run_with_setup(
                ['poetry', 'run', 'behave'],
                capture_output=True,
                text=True,
                timeout=1800
            )
        except subprocess.TimeoutExpired:
            print("✗ Test timed out")
            return False
        except Exception as e:
            print(f"✗ Error: {e}")
            return False
        
        output = result.stdout + result.stderr
        
        # Suppress verbose output - we'll show only the summary
        
        # Check if behave actually ran
        if 'Command not found: behave' in output or 'command not found' in output.lower():
            print("✗ behave not found - run poetry install")
            return False
        
        if 'No module named' in output and 'behave' in output:
            print("✗ behave module missing - run poetry install")
            return False
        
        # Parse the results
        test_results = parse_behave_output(output)
        zap_results = parse_zap_alerts(output, djangogoat_path)
        
        # Print minimal summary
        print("\n" + "="*70)
        print("RESULTS")
        print("="*70)
        
        # Validate that behave actually ran tests
        total_tests_run = (
            test_results['features_passed'] + test_results['features_failed'] +
            test_results['scenarios_passed'] + test_results['scenarios_failed'] +
            test_results['steps_passed'] + test_results['steps_failed']
        )
        
        if total_tests_run == 0:
            print("✗ No tests executed")
            return False
        
        if 'OWASP ZAP was not started' in output or 'skipping active scanning' in output:
            print("✗ ZAP not started - install OWASP ZAP")
            return False
        
        if 'ALL SCANS COMPLETED' not in output and 'All scans completed' not in output:
            print("✗ ZAP scans incomplete")
            return False
        
        # Determine pass/fail based on test results and ZAP alerts
        has_test_failures = (
            test_results['features_failed'] > 0 or
            test_results['scenarios_failed'] > 0 or
            test_results['steps_failed'] > 0
        )
        has_security_alerts = zap_results['total'] > 0
        
        # Show failed features if any
        if has_test_failures:
            if 'Failing scenarios:' in output:
                failing_section = output.split('Failing scenarios:')[1].split('\n\n')[0]
                print("\nFailed Features:")
                print(failing_section.strip())
        
        # Show security alerts if any
        if has_security_alerts:
            print(f"\nSecurity Alerts: {zap_results['total']} total")
            
            detailed_alerts = parse_detailed_alerts(djangogoat_path)
            if detailed_alerts:
                # Group by risk level and vulnerability type
                for risk_level in ['High', 'Medium', 'Low']:
                    level_alerts = [a for a in detailed_alerts if a['risk'] == risk_level]
                    if level_alerts:
                        print(f"\n{risk_level}:")
                        # Group by alert name
                        alert_groups = {}
                        for alert in level_alerts:
                            name = alert['name']
                            if name not in alert_groups:
                                alert_groups[name] = []
                            alert_groups[name].append(alert['url'])
                        
                        for name, urls in alert_groups.items():
                            print(f"  • {name}")
                            for url in urls:
                                print(f"    {url}")
        
        # Return result
        print("\n" + "="*70)
        if has_test_failures or has_security_alerts:
            print("FAILED")
            print("="*70 + "\n")
            return False
        else:
            print("PASSED")
            print("="*70 + "\n")
            return True
            
    finally:
        # Shut down the Django server if we started it
        if server_process and not server_was_running:
            try:
                server_process.terminate()
                server_process.wait(timeout=10)
            except Exception:
                try:
                    server_process.kill()
                except:
                    pass
        
        # Return to original directory
        os.chdir(original_dir)

