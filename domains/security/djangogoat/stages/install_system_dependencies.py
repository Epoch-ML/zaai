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
    has_java = shutil.which('java') is not None
    has_zap = shutil.which('zap.sh') is not None or os.path.exists('/Applications/OWASP ZAP.app')
    
    print(f"Status: Python3.10={has_python310}, Poetry={has_poetry}, Geckodriver={has_geckodriver}, Firefox={has_firefox}, Java={has_java}, ZAP={has_zap}")
    
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
        
        if not has_java:
            print("Installing Java (OpenJDK) via Homebrew...")
            result = subprocess.run(['brew', 'install', 'openjdk@17'], capture_output=True, timeout=600)
            assert result.returncode == 0, f"Failed to install Java via brew: {result.stderr.decode() if result.stderr else 'Unknown error'}"
            print("✓ Java installed")
        
        if not has_zap:
            print("Installing OWASP ZAP via Homebrew...")
            result = subprocess.run(['brew', 'install', '--cask', 'owasp-zap'], capture_output=True, timeout=600)
            assert result.returncode == 0, f"Failed to install OWASP ZAP via brew: {result.stderr.decode() if result.stderr else 'Unknown error'}"
            print("✓ OWASP ZAP installed")
    
    elif system == 'linux':
        # Linux installation
        if not has_python310:
            print("Installing Python 3.10 via pyenv...")
            
            # Check if pyenv is installed
            pyenv_root = os.path.expanduser('~/.pyenv')
            pyenv_bin = os.path.join(pyenv_root, 'bin', 'pyenv')
            
            if not os.path.exists(pyenv_bin):
                print("Installing pyenv...")
                # Install dependencies for building Python
                print("Installing build dependencies...")
                subprocess.run(['apt-get', 'update'], capture_output=True, timeout=300)
                subprocess.run([
                    'apt-get', 'install', '-y',
                    'build-essential', 'libssl-dev', 'zlib1g-dev',
                    'libbz2-dev', 'libreadline-dev', 'libsqlite3-dev',
                    'curl', 'libncursesw5-dev', 'xz-utils', 'tk-dev',
                    'libxml2-dev', 'libxmlsec1-dev', 'libffi-dev', 'liblzma-dev', 'git'
                ], capture_output=True, timeout=600)
                
                # Install pyenv using official installer
                print("Downloading and installing pyenv...")
                result = subprocess.run([
                    'curl', '-L',
                    'https://github.com/pyenv/pyenv-installer/raw/master/bin/pyenv-installer',
                    '-o', 'pyenv-installer.sh'
                ], capture_output=True, timeout=300)
                assert result.returncode == 0, "Failed to download pyenv installer"
                
                result = subprocess.run(['bash', 'pyenv-installer.sh'], capture_output=True, timeout=300)
                subprocess.run(['rm', '-f', 'pyenv-installer.sh'], capture_output=True, timeout=10)
                assert result.returncode == 0, "Failed to install pyenv"
                print("✓ pyenv installed")
            
            # Add pyenv to PATH and set environment
            pyenv_bin_dir = os.path.join(pyenv_root, 'bin')
            pyenv_shims = os.path.join(pyenv_root, 'shims')
            
            if pyenv_bin_dir not in os.environ['PATH']:
                os.environ['PATH'] = f"{pyenv_shims}:{pyenv_bin_dir}:{os.environ['PATH']}"
                print(f"Added pyenv to PATH")
            os.environ['PYENV_ROOT'] = pyenv_root
            
            # Install Python 3.10 with pyenv
            print("Installing Python 3.10.13 with pyenv (this may take several minutes)...")
            result = subprocess.run(
                [pyenv_bin, 'install', '-s', '3.10.13'],
                capture_output=True,
                text=True,
                timeout=1800,  # 30 minutes for compilation
                env=os.environ
            )
            assert result.returncode == 0, f"Failed to install Python 3.10 with pyenv: {result.stderr}"
            
            # Set Python 3.10 as a global version
            subprocess.run([pyenv_bin, 'global', '3.10.13'], capture_output=True, env=os.environ)
            subprocess.run([pyenv_bin, 'rehash'], capture_output=True, env=os.environ)
            
            # Create python3.10 symlink in ~/.local/bin for consistent access
            local_bin = os.path.expanduser('~/.local/bin')
            os.makedirs(local_bin, exist_ok=True)
            python310_symlink = os.path.join(local_bin, 'python3.10')
            python310_actual = os.path.join(pyenv_root, 'versions', '3.10.13', 'bin', 'python3.10')
            
            if os.path.exists(python310_actual):
                if os.path.islink(python310_symlink) or os.path.exists(python310_symlink):
                    os.remove(python310_symlink)
                os.symlink(python310_actual, python310_symlink)
                if local_bin not in os.environ['PATH']:
                    os.environ['PATH'] = f"{local_bin}:{os.environ['PATH']}"
                print(f"✓ Python 3.10 installed at: {python310_symlink} -> {python310_actual}")
            else:
                assert False, f"Python 3.10 binary not found at {python310_actual}"
        
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
        
        if not has_java:
            print("Installing Java (OpenJDK) via apt-get...")
            print("Updating package lists...")
            subprocess.run(['apt-get', 'update'], capture_output=True, timeout=300)
            result = subprocess.run(['apt-get', 'install', '-y', 'default-jre'], capture_output=True, timeout=600)
            assert result.returncode == 0, f"Failed to install Java via apt-get: {result.stderr.decode() if result.stderr else 'Unknown error'}"
            print("✓ Java installed")
        
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