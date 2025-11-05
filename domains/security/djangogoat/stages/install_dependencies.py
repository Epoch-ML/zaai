"""
Stage: Install DjangoGoat dependencies using Poetry and cache environment
"""

import subprocess
import os
import json
import shutil
from pathlib import Path


def run(zerg_state=None):
    """
    Install DjangoGoat dependencies using Poetry and cache the virtualenv path.
    
    Args:
        zerg_state: The zerg agent state object containing workspace information
    """
    # Get environment path from zerg state
    if not zerg_state or not hasattr(zerg_state, 'workspace'):
        return
    
    # Find Poetry executable
    poetry_path = shutil.which('poetry')
    if not poetry_path:
        return
    
    env_path = Path(str(zerg_state.workspace.environment_path))
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
        original_dir = os.getcwd()
        
        try:
            os.chdir(project_dir)
            
            # Set Poetry to Python 3.10
            subprocess.run(
                [poetry_path, 'env', 'use', 'python3.10'],
                capture_output=True,
                timeout=30
            )
            
            # Install dependencies
            subprocess.run(
                [poetry_path, 'install'],
                capture_output=True,
                timeout=600
            )
            
            # Get and cache virtualenv path
            venv_result = subprocess.run(
                [poetry_path, 'env', 'info', '--path'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if venv_result.returncode == 0:
                venv_path = venv_result.stdout.strip()
                workspace_root = Path(str(zerg_state.workspace.environment_path))
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
                
        finally:
            os.chdir(original_dir)

