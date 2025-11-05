"""
Stage: Install DjangoGoat dependencies using Poetry and cache environment
"""

import subprocess
import os
import json
import shutil
from pathlib import Path


def run():
    """
    Install DjangoGoat dependencies using Poetry and cache the virtualenv path.
    
    Uses 'zerg' from the pipeline namespace to access workspace information.
    """
    print("Installing DjangoGoat dependencies...")
    
    # Find Poetry executable
    poetry_path = shutil.which('poetry')
    assert poetry_path is not None, "Poetry not found in PATH - install system dependencies stage must run first"
    print(f"Using Poetry: {poetry_path}")
    
    env_path = Path(str(zerg.workspace.environment_path))
    pyproject_path = env_path / "pyproject.toml"
    
    # Fallback: search in subdirectories
    if not pyproject_path.exists():
        for subdir in env_path.iterdir():
            if subdir.is_dir():
                candidate = subdir / "pyproject.toml"
                if candidate.exists():
                    pyproject_path = candidate
                    break
    
    if pyproject_path and pyproject_path.exists():
        project_dir = pyproject_path.parent
        print(f"Found pyproject.toml in: {project_dir}")
        original_dir = os.getcwd()
        
        try:
            os.chdir(project_dir)
            
            # # Set Poetry to Python 3.10
            # print("Setting Poetry environment to Python 3.10...")
            # result = subprocess.run(
            #     [poetry_path, 'env', 'use', 'python3.10'],
            #     capture_output=True,
            #     timeout=30
            # )
            # assert result.returncode == 0, f"Failed to set Poetry to Python 3.10: {result.stderr.decode() if result.stderr else 'Unknown error'}"
            # print("✓ Python 3.10 environment configured")
            
            # Install dependencies
            print("Installing dependencies with Poetry (this may take a few minutes)...")
            result = subprocess.run(
                [poetry_path, 'install'],
                capture_output=True,
                timeout=600
            )
            assert result.returncode == 0, f"Failed to install Poetry dependencies: {result.stderr.decode() if result.stderr else 'Unknown error'}"
            print("✓ Dependencies installed")
            
            # Get and cache virtualenv path
            print("Caching virtualenv path...")
            venv_result = subprocess.run(
                [poetry_path, 'env', 'info', '--path'],
                capture_output=True,
                text=True,
                timeout=10
            )
            assert venv_result.returncode == 0, f"Failed to get Poetry virtualenv path: {venv_result.stderr.decode() if venv_result.stderr else 'Unknown error'}"
            
            venv_path = venv_result.stdout.strip()
            assert venv_path, "Poetry virtualenv path is empty"
            print(f"Virtualenv path: {venv_path}")
            
            workspace_root = Path(str(zerg.workspace.environment_path))
            cache_file = workspace_root / ".poetry_venv_cache"
            
            cache_data = {
                'venv_path': venv_path,
                'python_version': '3.10',
                'env_vars': {
                    'VIRTUAL_ENV': venv_path,
                    'PATH': f"{venv_path}/bin:{os.environ.get('PATH', '')}"
                }
            }
            
            cache_file.write_text(json.dumps(cache_data, indent=2))
            print(f"✓ Environment cached to: {cache_file}")
                
        finally:
            os.chdir(original_dir)
    
    print("\n✓ DjangoGoat dependencies installed successfully!")

if __name__ == "__main__":
    run()