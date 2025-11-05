"""
Test: Full DjangoGoat Security Scan with OWASP ZAP
Runs the complete behave test suite and validates ZAP security findings.

This test is self-contained and handles all dependency installation automatically.
No separate setup stages are required.
"""

import os
import subprocess
import re
import time
import socket
import shutil
import platform
import urllib.request
import json
from pathlib import Path


def test_full_security_scan(zerg_state=None):
    """
    Run the full DjangoGoat test suite with OWASP ZAP and validate results.
    
    This test:
    0. Installs all dependencies (Python, Poetry, Firefox, Java, ZAP) with caching
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
    
    # ===== INSTALLATION HELPER FUNCTIONS (nested) =====
    
    def get_or_cache_path(workspace_path, program_name, finder_func):
        """
        Get cached program path or find and cache it.
        Cache stored in {workspace}/._cache_{program_name}
        """
        cache_file = workspace_path / f"._cache_{program_name}"
        if cache_file.exists():
            cached_path = cache_file.read_text().strip()
            if os.path.exists(cached_path):
                print(f"✓ Using cached {program_name}: {cached_path}")
                return cached_path
        
        # Find and cache
        print(f"Finding {program_name}...")
        path = finder_func()
        if path:
            cache_file.write_text(str(path))
            print(f"✓ Cached {program_name}: {path}")
        return path
    
    def install_system_dependencies(workspace_path):
        """
        Install system dependencies with caching.
        Returns dict of paths: {'java': path, 'zap': path, etc.}
        """
        system = platform.system().lower()
        print(f"Installing system dependencies on {system}...")
        
        paths = {}
        local_bin = os.path.expanduser('~/.local/bin')
        os.makedirs(local_bin, exist_ok=True)
        
        # Check what's installed
        has_python310 = shutil.which('python3.10') is not None
        has_poetry = shutil.which('poetry') is not None
        has_geckodriver = shutil.which('geckodriver') is not None
        has_firefox = shutil.which('firefox') is not None or os.path.exists('/Applications/Firefox.app')
        has_java = shutil.which('java') is not None
        has_zap = shutil.which('zap.sh') is not None or os.path.exists('/Applications/OWASP ZAP.app')
        
        # Print status
        print(f"Status: Python3.10={has_python310}, Poetry={has_poetry}, Geckodriver={has_geckodriver}, Firefox={has_firefox}, Java={has_java}, ZAP={has_zap}")
        
        # Install each dependency if needed
        if system == 'linux':
            # Python 3.10
            if not has_python310:
                print("Python 3.10 not found - installing via pyenv...")
                pyenv_root = os.path.expanduser('~/.pyenv')
                pyenv_bin = os.path.join(pyenv_root, 'bin', 'pyenv')
                
                if not os.path.exists(pyenv_bin):
                    subprocess.run(['apt-get', 'update'], capture_output=True, timeout=300)
                    subprocess.run([
                        'apt-get', 'install', '-y',
                        'build-essential', 'libssl-dev', 'zlib1g-dev',
                        'libbz2-dev', 'libreadline-dev', 'libsqlite3-dev',
                        'curl', 'libncursesw5-dev', 'xz-utils', 'tk-dev',
                        'libxml2-dev', 'libxmlsec1-dev', 'libffi-dev', 'liblzma-dev', 'git'
                    ], capture_output=True, timeout=600)
                    
                    result = subprocess.run([
                        'curl', '-L',
                        'https://github.com/pyenv/pyenv-installer/raw/master/bin/pyenv-installer',
                        '-o', 'pyenv-installer.sh'
                    ], capture_output=True, timeout=300)
                    subprocess.run(['bash', 'pyenv-installer.sh'], capture_output=True, timeout=300)
                    subprocess.run(['rm', '-f', 'pyenv-installer.sh'], capture_output=True, timeout=10)
                
                pyenv_shims = os.path.join(pyenv_root, 'shims')
                pyenv_bin_dir = os.path.join(pyenv_root, 'bin')
                os.environ['PATH'] = f"{pyenv_shims}:{pyenv_bin_dir}:{os.environ['PATH']}"
                os.environ['PYENV_ROOT'] = pyenv_root
                
                subprocess.run([pyenv_bin, 'install', '-s', '3.10.13'], capture_output=True, timeout=1800, env=os.environ)
                subprocess.run([pyenv_bin, 'global', '3.10.13'], capture_output=True, env=os.environ)
                subprocess.run([pyenv_bin, 'rehash'], capture_output=True, env=os.environ)
                
                python310_symlink = os.path.join(local_bin, 'python3.10')
                python310_actual = os.path.join(pyenv_root, 'versions', '3.10.13', 'bin', 'python3.10')
                if os.path.exists(python310_actual):
                    if os.path.islink(python310_symlink) or os.path.exists(python310_symlink):
                        os.remove(python310_symlink)
                    os.symlink(python310_actual, python310_symlink)
                print("✓ Python 3.10 installed")
            else:
                print("✓ Python 3.10 already available")
            
            paths['python310'] = shutil.which('python3.10') or os.path.join(local_bin, 'python3.10')
            
            # Poetry
            if not has_poetry:
                print("Installing Poetry...")
                urllib.request.urlretrieve('https://install.python-poetry.org', 'install-poetry.py')
                subprocess.run(['python3', 'install-poetry.py'], capture_output=True, timeout=300)
                subprocess.run(['rm', '-f', 'install-poetry.py'], capture_output=True, timeout=10)
                print("✓ Poetry installed")
            else:
                print("✓ Poetry already available")
            
            paths['poetry'] = shutil.which('poetry') or os.path.join(local_bin, 'poetry')
            
            # Geckodriver
            if not has_geckodriver:
                print("Installing Geckodriver...")
                urllib.request.urlretrieve(
                    'https://github.com/mozilla/geckodriver/releases/download/v0.36.0/geckodriver-v0.36.0-linux64.tar.gz',
                    'geckodriver.tar.gz'
                )
                subprocess.run(['tar', '-xzf', 'geckodriver.tar.gz'], capture_output=True, timeout=60)
                subprocess.run(['mv', 'geckodriver', local_bin], capture_output=True, timeout=60)
                subprocess.run(['rm', '-f', 'geckodriver.tar.gz'], capture_output=True, timeout=10)
                print("✓ Geckodriver installed")
            else:
                print("✓ Geckodriver already available")
            
            paths['geckodriver'] = shutil.which('geckodriver') or os.path.join(local_bin, 'geckodriver')
            
            # Firefox + Xvfb
            if not has_firefox:
                print("Installing Firefox and Xvfb...")
                subprocess.run(['apt-get', 'update'], capture_output=True, timeout=300)
                subprocess.run(['apt-get', 'install', '-y', 'xvfb'], capture_output=True, timeout=300)
                
                result = subprocess.run(['apt-get', 'install', '-y', 'firefox-esr'], capture_output=True, timeout=600)
                if result.returncode != 0:
                    result = subprocess.run(['apt-get', 'install', '-y', 'firefox'], capture_output=True, timeout=600)
                print("✓ Firefox and Xvfb installed")
            else:
                print("✓ Firefox already available")
            
            paths['firefox'] = shutil.which('firefox') or '/usr/bin/firefox'
            
            # Java
            if not has_java:
                print("Installing Java...")
                subprocess.run(['apt-get', 'update'], capture_output=True, timeout=300)
                subprocess.run(['apt-get', 'install', '-y', 'default-jre'], capture_output=True, timeout=600)
                print("✓ Java installed")
            else:
                print("✓ Java already available")
            
            paths['java'] = shutil.which('java') or '/usr/bin/java'
            
            # ZAP
            if not has_zap:
                print("Installing OWASP ZAP...")
                zap_dir = os.path.expanduser('~/.local/zap')
                os.makedirs(zap_dir, exist_ok=True)
                urllib.request.urlretrieve(
                    'https://github.com/zaproxy/zaproxy/releases/download/v2.15.0/ZAP_2.15.0_Linux.tar.gz',
                    'zap.tar.gz'
                )
                subprocess.run(['tar', '-xzf', 'zap.tar.gz', '-C', zap_dir, '--strip-components=1'], capture_output=True, timeout=120)
                subprocess.run(['rm', '-f', 'zap.tar.gz'], capture_output=True, timeout=10)
                
                zap_script = os.path.join(zap_dir, 'zap.sh')
                zap_link = os.path.join(local_bin, 'zap.sh')
                if os.path.islink(zap_link) or os.path.exists(zap_link):
                    os.remove(zap_link)
                os.symlink(zap_script, zap_link)
                print("✓ OWASP ZAP installed")
            else:
                print("✓ OWASP ZAP already available")
            
            paths['zap'] = shutil.which('zap.sh') or os.path.join(local_bin, 'zap.sh')
        
        print("\n✓ All system dependencies installed successfully!")
        return paths
    
    def install_python_dependencies(workspace_path, djangogoat_path, poetry_path):
        """
        Install Python dependencies using Poetry and cache virtualenv.
        Returns dict of environment variables to use.
        """
        print("\nInstalling Python dependencies...")
        
        pyproject_path = djangogoat_path / "pyproject.toml"
        if not pyproject_path.exists():
            print(f"✗ pyproject.toml not found in {djangogoat_path}")
            return {}
        
        original_dir = os.getcwd()
        try:
            os.chdir(djangogoat_path)
            
            # Check cache first
            cache_file = workspace_path / ".poetry_venv_cache"
            if cache_file.exists():
                cache_data = json.loads(cache_file.read_text())
                venv_path = cache_data.get('venv_path')
                if venv_path and os.path.exists(venv_path):
                    print(f"✓ Using cached virtualenv: {venv_path}")
                    return cache_data.get('env_vars', {})
            
            # Install
            print("Running poetry install (this may take a few minutes)...")
            result = subprocess.run(
                [poetry_path, 'install'],
                capture_output=True,
                timeout=600
            )
            if result.returncode != 0:
                print(f"✗ Poetry install failed: {result.stderr.decode()[:500]}")
                return {}
            
            # Get virtualenv path
            venv_result = subprocess.run(
                [poetry_path, 'env', 'info', '--path'],
                capture_output=True,
                text=True,
                timeout=10
            )
            venv_path = venv_result.stdout.strip()
            
            # Cache it
            cache_data = {
                'venv_path': venv_path,
                'env_vars': {
                    'VIRTUAL_ENV': venv_path,
                    'PATH': f"{venv_path}/bin:{os.environ.get('PATH', '')}"
                }
            }
            cache_file.write_text(json.dumps(cache_data, indent=2))
            print(f"✓ Python dependencies installed and cached")
            
            return cache_data['env_vars']
            
        finally:
            os.chdir(original_dir)
    
    # ===== EXISTING HELPER FUNCTIONS =====
    
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
    
    # ===== MAIN TEST LOGIC =====
    
    print("="*70)
    print("DJANGOGOAT SECURITY SCAN - SELF-CONTAINED TEST")
    print("="*70)
    
    # Get workspace path
    from security_interface import get_djangogoat_path
    djangogoat_path = Path(get_djangogoat_path())
    workspace_path = djangogoat_path.parent
    
    # Install system dependencies with caching
    print("\n[1/3] SYSTEM DEPENDENCIES")
    sys_paths = install_system_dependencies(workspace_path)
    
    # Build enhanced PATH with all installed programs
    local_bin = os.path.expanduser('~/.local/bin')
    path_dirs = [local_bin]
    for prog_path in sys_paths.values():
        prog_dir = os.path.dirname(prog_path)
        if prog_dir not in path_dirs:
            path_dirs.append(prog_dir)
    
    enhanced_path = ':'.join(path_dirs) + ':' + os.environ.get('PATH', '')
    
    # Cache the enhanced PATH
    path_cache = workspace_path / '._cache_path'
    path_cache.write_text(enhanced_path)
    
    # Set environment
    os.environ['PATH'] = enhanced_path
    os.environ['ZAP_PATH'] = sys_paths.get('zap', '')
    print(f"✓ Enhanced PATH with {len(path_dirs)} directories")
    
    # Install Python dependencies
    print("\n[2/3] PYTHON DEPENDENCIES")
    poetry_env = install_python_dependencies(workspace_path, djangogoat_path, sys_paths['poetry'])
    
    # Merge Poetry environment
    if poetry_env:
        for key, value in poetry_env.items():
            os.environ[key] = value
        print("✓ Poetry environment configured")
    
    # Now continue with test
    print("\n[3/3] RUNNING SECURITY TESTS")
    print("="*70 + "\n")
    
    # Get poetry executable path for all commands
    poetry_path = sys_paths['poetry']
    
    # Change to DjangoGoat directory and run tests
    original_dir = os.getcwd()
    server_process = None
    server_was_running = False  # Track if we need to shut down the server
    
    try:
        os.chdir(djangogoat_path)
        
        # Build environment variables with enhanced PATH
        env_vars = os.environ.copy()
        if poetry_env:
            env_vars.update(poetry_env)
        
        # Set Django environment variables
        env_vars['DJANGO_SETTINGS_MODULE'] = 'djangogoat.settings'
        env_vars['DJANGO_SECRET_KEY'] = 'insecure-behave-secret-key'
        
        # Check if server is already running - kill it for clean slate
        if is_port_in_use(3572):
            print("Killing existing server on port 3572...")
            try:
                # Try to kill using lsof and kill command
                result = subprocess.run(
                    ['lsof', '-t', '-i', ':3572'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0 and result.stdout.strip():
                    pids = result.stdout.strip().split('\n')
                    for pid in pids:
                        subprocess.run(['kill', '-9', pid], capture_output=True, timeout=5)
                    print(f"✓ Killed {len(pids)} process(es) on port 3572")
                    time.sleep(2)  # Give OS time to free the port
            except Exception as e:
                print(f"⚠ Could not kill existing server: {e}")
        
        # Start Django development server with clean slate
        print("Starting Django server on port 3572...")
        server_process = subprocess.Popen(
            [poetry_path, 'run', 'python', 'manage.py', 'runserver', '127.0.0.1:3572', '--noreload'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env_vars
        )
        
        # Wait for server to be ready
        if not wait_for_server(port=3572, timeout=30):
            print("✗ Server failed to start")
            if server_process:
                stdout, stderr = '', ''
                try:
                    stdout, stderr = server_process.communicate(timeout=2)
                except:
                    pass
                if stderr:
                    print(f"Server error: {stderr[:500]}")
                server_process.terminate()
            return False
        
        print("✓ Django server started on port 3572")
        server_was_running = False  # We started it, so we'll shut it down
        
        try:
            result = subprocess.run(
                [poetry_path, 'run', 'behave'],
                capture_output=True,
                text=True,
                timeout=1800,
                env=env_vars
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

