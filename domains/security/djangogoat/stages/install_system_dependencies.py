"""
Stage: Install system dependencies (Poetry, Geckodriver, Firefox, OWASP ZAP)
"""

import subprocess
import platform
import os
import shutil
import urllib.request


def run():
    """
    Install Poetry, Geckodriver, Firefox, and OWASP ZAP based on the OS.
    Checks if tools are already installed before attempting installation.
    
    Uses the pipeline namespace (zerg is available if needed).
    """
    system = platform.system().lower()
    assert system in ['darwin', 'linux'], f"Unsupported operating system: {system}"
    
    print(f"Installing system dependencies on {system}...")
    
    # Check what's already installed
    has_python310 = shutil.which('python3.10') is not None
    has_poetry = shutil.which('poetry') is not None
    has_geckodriver = shutil.which('geckodriver') is not None
    has_firefox = shutil.which('firefox') is not None or os.path.exists('/Applications/Firefox.app')
    has_zap = shutil.which('zap.sh') is not None or os.path.exists('/Applications/OWASP ZAP.app')
    
    print(f"Status: Python3.10={has_python310}, Poetry={has_poetry}, Geckodriver={has_geckodriver}, Firefox={has_firefox}, ZAP={has_zap}")
    
    if system == 'darwin':
        # macOS installation
        if not has_python310:
            print("Installing Python 3.10 via Homebrew...")
            result = subprocess.run(['brew', 'install', 'python@3.10'], capture_output=True, timeout=600)
            assert result.returncode == 0, f"Failed to install Python 3.10 via brew: {result.stderr.decode() if result.stderr else 'Unknown error'}"
        
        if not has_poetry:
            print("Installing Poetry via Homebrew...")
            result = subprocess.run(['brew', 'install', 'poetry'], capture_output=True, timeout=300)
            assert result.returncode == 0, f"Failed to install Poetry via brew: {result.stderr.decode() if result.stderr else 'Unknown error'}"
            print("✓ Poetry installed")
        
        if not has_geckodriver:
            print("Installing Geckodriver via Homebrew...")
            result = subprocess.run(['brew', 'install', 'geckodriver'], capture_output=True, timeout=300)
            assert result.returncode == 0, f"Failed to install Geckodriver via brew: {result.stderr.decode() if result.stderr else 'Unknown error'}"
            print("✓ Geckodriver installed")
        
        if not has_firefox:
            print("Installing Firefox via Homebrew...")
            result = subprocess.run(['brew', 'install', '--cask', 'firefox'], capture_output=True, timeout=600)
            assert result.returncode == 0, f"Failed to install Firefox via brew: {result.stderr.decode() if result.stderr else 'Unknown error'}"
            print("✓ Firefox installed")
        
        if not has_zap:
            print("Installing OWASP ZAP via Homebrew...")
            result = subprocess.run(['brew', 'install', '--cask', 'owasp-zap'], capture_output=True, timeout=600)
            assert result.returncode == 0, f"Failed to install OWASP ZAP via brew: {result.stderr.decode() if result.stderr else 'Unknown error'}"
            print("✓ OWASP ZAP installed")
    
    elif system == 'linux':
        # Linux installation
        if not has_python310:
            print("Installing Python 3.10 from deadsnakes PPA...")
            
            # Add deadsnakes PPA which provides prebuilt Python packages
            print("Adding deadsnakes PPA...")
            subprocess.run(['apt-get', 'update'], capture_output=True, timeout=300)
            subprocess.run(['apt-get', 'install', '-y', 'software-properties-common'], capture_output=True, timeout=300)
            subprocess.run(['add-apt-repository', '-y', 'ppa:deadsnakes/ppa'], capture_output=True, timeout=300)
            subprocess.run(['apt-get', 'update'], capture_output=True, timeout=300)
            
            # Install python3.10 (minimal, no extra packages to avoid conflicts)
            print("Installing python3.10...")
            result = subprocess.run(['apt-get', 'install', '-y', 'python3.10-minimal'], capture_output=True, timeout=600)
            assert result.returncode == 0, f"Failed to install Python 3.10: {result.stderr.decode() if result.stderr else 'Unknown error'}"
            
            # Verify it's accessible
            python310_path = shutil.which('python3.10')
            if not python310_path:
                # Manually check /usr/bin
                if os.path.exists('/usr/bin/python3.10'):
                    python310_path = '/usr/bin/python3.10'
                    # Ensure /usr/bin is in PATH
                    if '/usr/bin' not in os.environ['PATH']:
                        os.environ['PATH'] = f"/usr/bin:{os.environ['PATH']}"
                        print("Added /usr/bin to PATH")
            
            assert python310_path is not None, "Python 3.10 was installed but cannot be found"
            print(f"✓ Python 3.10 installed at: {python310_path}")
        
        if not has_poetry:
            print("Installing Poetry using official installer...")
            urllib.request.urlretrieve('https://install.python-poetry.org', 'install-poetry.py')
            result = subprocess.run(['python3', 'install-poetry.py'], capture_output=True, timeout=300)
            subprocess.run(['rm', '-f', 'install-poetry.py'], capture_output=True, timeout=10)
            assert result.returncode == 0, f"Failed to install Poetry: {result.stderr.decode() if result.stderr else 'Unknown error'}"
            
            # Add Poetry to PATH
            poetry_bin = os.path.expanduser('~/.local/bin')
            if poetry_bin not in os.environ['PATH']:
                os.environ['PATH'] = f"{poetry_bin}:{os.environ['PATH']}"
                print(f"Added {poetry_bin} to PATH")
            
            print("✓ Poetry installed")
        
        if not has_geckodriver:
            print("Downloading Geckodriver v0.36.0...")
            urllib.request.urlretrieve(
                'https://github.com/mozilla/geckodriver/releases/download/v0.36.0/geckodriver-v0.36.0-linux64.tar.gz',
                'geckodriver-v0.36.0-linux64.tar.gz'
            )
            print("Extracting Geckodriver...")
            result = subprocess.run(['tar', '-xzf', 'geckodriver-v0.36.0-linux64.tar.gz'], capture_output=True, timeout=60)
            assert result.returncode == 0, "Failed to extract geckodriver"
            home_bin = os.path.expanduser('~/.local/bin')
            os.makedirs(home_bin, exist_ok=True)
            result = subprocess.run(['mv', 'geckodriver', home_bin], capture_output=True, timeout=60)
            assert result.returncode == 0, "Failed to move geckodriver to ~/.local/bin"
            subprocess.run(['rm', '-f', 'geckodriver-v0.36.0-linux64.tar.gz'], capture_output=True, timeout=10)
            print("✓ Geckodriver installed")
        
        if not has_firefox:
            print("Installing Firefox via apt-get...")
            print("Updating package lists...")
            subprocess.run(['apt-get', 'update'], capture_output=True, timeout=300)
            
            print("Trying firefox-esr...")
            result = subprocess.run(['apt-get', 'install', '-y', 'firefox-esr'], capture_output=True, timeout=600)
            if result.returncode != 0:
                print("firefox-esr not available, trying firefox...")
                result = subprocess.run(['apt-get', 'install', '-y', 'firefox'], capture_output=True, timeout=600)
                if result.returncode != 0:
                    print("firefox not available, trying firefox-geckodriver...")
                    result = subprocess.run(['apt-get', 'install', '-y', 'firefox-geckodriver'], capture_output=True, timeout=600)
                    assert result.returncode == 0, f"Failed to install Firefox (tried firefox-esr, firefox, and firefox-geckodriver): {result.stderr.decode() if result.stderr else 'Unknown error'}"
            print("✓ Firefox installed")
        
        if not has_zap:
            print("Downloading OWASP ZAP v2.15.0...")
            zap_version = '2.15.0'
            zap_dir = os.path.expanduser('~/.local/zap')
            os.makedirs(zap_dir, exist_ok=True)
            urllib.request.urlretrieve(
                f'https://github.com/zaproxy/zaproxy/releases/download/v{zap_version}/ZAP_{zap_version}_Linux.tar.gz',
                'zap.tar.gz'
            )
            print("Extracting OWASP ZAP...")
            result = subprocess.run(['tar', '-xzf', 'zap.tar.gz', '-C', zap_dir, '--strip-components=1'], capture_output=True, timeout=120)
            assert result.returncode == 0, "Failed to extract OWASP ZAP"
            subprocess.run(['rm', '-f', 'zap.tar.gz'], capture_output=True, timeout=10)
            print("Creating symlink...")
            home_bin = os.path.expanduser('~/.local/bin')
            os.makedirs(home_bin, exist_ok=True)
            zap_script = os.path.join(zap_dir, 'zap.sh')
            zap_link = os.path.join(home_bin, 'zap.sh')
            assert os.path.exists(zap_script), f"ZAP script not found at {zap_script}"
            # Remove existing symlink if present
            if os.path.islink(zap_link) or os.path.exists(zap_link):
                os.remove(zap_link)
            os.symlink(zap_script, zap_link)
            print("✓ OWASP ZAP installed")
    
    print("\n✓ All system dependencies installed successfully!")

if __name__ == "__main__":
    run()