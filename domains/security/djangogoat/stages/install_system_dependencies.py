"""
Stage: Install system dependencies (Poetry, Geckodriver, Firefox, OWASP ZAP)
"""

import subprocess
import platform
import os
import shutil
import urllib.request


def run(zerg_state=None):
    """
    Install Poetry, Geckodriver, Firefox, and OWASP ZAP based on the OS.
    Checks if tools are already installed before attempting installation.
    """
    system = platform.system().lower()
    
    # Check what's already installed
    has_poetry = shutil.which('poetry') is not None
    has_geckodriver = shutil.which('geckodriver') is not None
    has_firefox = shutil.which('firefox') is not None or os.path.exists('/Applications/Firefox.app')
    has_zap = shutil.which('zap.sh') is not None or os.path.exists('/Applications/OWASP ZAP.app')
    
    if system == 'darwin':
        # macOS installation
        if not has_poetry:
            subprocess.run(['brew', 'install', 'poetry'], capture_output=True, timeout=300)
        
        if not has_geckodriver:
            subprocess.run(['brew', 'install', 'geckodriver'], capture_output=True, timeout=300)
        
        if not has_firefox:
            subprocess.run(['brew', 'install', '--cask', 'firefox'], capture_output=True, timeout=600)
        
        if not has_zap:
            subprocess.run(['brew', 'install', '--cask', 'owasp-zap'], capture_output=True, timeout=600)
    
    elif system == 'linux':
        # Linux installation
        if not has_poetry:
            # Install Poetry using the official installer
            urllib.request.urlretrieve('https://install.python-poetry.org', 'install-poetry.py')
            subprocess.run(['python3', 'install-poetry.py'], capture_output=True, timeout=300)
            subprocess.run(['rm', '-f', 'install-poetry.py'], capture_output=True, timeout=10)
        
        if not has_geckodriver:
            urllib.request.urlretrieve(
                'https://github.com/mozilla/geckodriver/releases/download/v0.36.0/geckodriver-v0.36.0-linux64.tar.gz',
                'geckodriver-v0.36.0-linux64.tar.gz'
            )
            subprocess.run(['tar', '-xzf', 'geckodriver-v0.36.0-linux64.tar.gz'], capture_output=True, timeout=60)
            home_bin = os.path.expanduser('~/.local/bin')
            os.makedirs(home_bin, exist_ok=True)
            subprocess.run(['mv', 'geckodriver', home_bin], capture_output=True, timeout=60)
            subprocess.run(['rm', '-f', 'geckodriver-v0.36.0-linux64.tar.gz'], capture_output=True, timeout=10)
        
        if not has_firefox:
            subprocess.run(['apt-get', 'update'], capture_output=True, timeout=300)
            subprocess.run(['apt-get', 'install', '-y', 'firefox'], capture_output=True, timeout=600)
        
        if not has_zap:
            # Download ZAP directly from GitHub releases
            zap_version = '2.15.0'
            zap_dir = os.path.expanduser('~/.local/zap')
            os.makedirs(zap_dir, exist_ok=True)
            urllib.request.urlretrieve(
                f'https://github.com/zaproxy/zaproxy/releases/download/v{zap_version}/ZAP_{zap_version}_Linux.tar.gz',
                'zap.tar.gz'
            )
            subprocess.run(['tar', '-xzf', 'zap.tar.gz', '-C', zap_dir, '--strip-components=1'], capture_output=True, timeout=120)
            subprocess.run(['rm', '-f', 'zap.tar.gz'], capture_output=True, timeout=10)
            # Create symlink to make zap.sh accessible
            home_bin = os.path.expanduser('~/.local/bin')
            os.makedirs(home_bin, exist_ok=True)
            zap_script = os.path.join(zap_dir, 'zap.sh')
            zap_link = os.path.join(home_bin, 'zap.sh')
            if os.path.exists(zap_script):
                os.symlink(zap_script, zap_link)

