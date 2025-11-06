"""
Security Interface
Provides standardized access to environment files for reading and analyzing
"""

import os
import json
from pathlib import Path
from typing import Dict, Optional


def get_poetry_env_cache_path() -> Path:
    """
    Get the path to the Poetry environment cache file.
    This file stores the virtualenv path for reuse across tests.
    
    Cache is stored in the environment directory itself:
    - When running from stages: environment_path/.poetry_venv_cache
    - When running standalone: djangogoat/.poetry_venv_cache
    
    Returns:
        Path: Path to .poetry_venv_cache in environment directory
    """
    try:
        djangogoat_path = Path(get_djangogoat_path())
        
        # Check if this looks like the environment directory itself
        # In Zerg context: /tmp/zerg/agent_workspace_XXX/environment/djangogoat
        # We want: /tmp/zerg/agent_workspace_XXX/environment/.poetry_venv_cache
        
        # If djangogoat is inside an "environment" directory, use that environment dir
        if djangogoat_path.parent.name == "environment":
            cache_file = djangogoat_path.parent / ".poetry_venv_cache"
            return cache_file
        
        # Otherwise, use djangogoat directory itself
        cache_file = djangogoat_path / ".poetry_venv_cache"
        return cache_file
        
    except Exception:
        pass
    
    # Fallback: use same directory as this file
    this_file_dir = Path(__file__).parent.resolve()
    cache_file = this_file_dir / ".poetry_venv_cache"
    return cache_file


def save_poetry_env(venv_path: str, python_version: str = "3.10") -> None:
    """
    Save Poetry virtualenv configuration to cache file.
    
    Args:
        venv_path: Absolute path to the Poetry virtualenv
        python_version: Python version string (e.g., "3.10")
    """
    cache_file = get_poetry_env_cache_path()
    cache_data = {
        'venv_path': venv_path,
        'python_version': python_version,
        'env_vars': {
            'VIRTUAL_ENV': venv_path,
            'PATH': f"{venv_path}/bin:{os.environ.get('PATH', '')}"
        }
    }
    
    cache_file.write_text(json.dumps(cache_data, indent=2))


def get_poetry_env() -> Optional[Dict[str, str]]:
    """
    Get Poetry environment variables from cache.
    
    Returns:
        Dict with environment variables including VIRTUAL_ENV and PATH,
        or None if cache doesn't exist
    """
    cache_file = get_poetry_env_cache_path()
    
    if not cache_file.exists():
        return None
    
    try:
        cache_data = json.loads(cache_file.read_text())
        return cache_data.get('env_vars')
    except Exception:
        return None


def get_djangogoat_path() -> str:
    """
    Get the absolute path to the DjangoGoat environment directory.
    
    Returns:
        str: Absolute path to the djangogoat directory
    """
    env_path = Path("djangogoat")
    if env_path.exists():
        return str(env_path.resolve())
    
    # If not found in current directory, try parent
    parent_env_path = Path("..") / "djangogoat"
    if parent_env_path.exists():
        return str(parent_env_path.resolve())
    
    # Return default path even if it doesn't exist (caller will handle)
    return str(env_path.resolve())


def get_environment_files() -> Dict[str, str]:
    """
    Get all files from the environment repo directory.
    
    Returns:
        Dict[str, str]: Dictionary mapping file paths to their content
    """
    env_files = {}
    try:
        env_path = Path("djangogoat")
        if env_path.exists():
            for file_path in env_path.rglob("*"):
                if file_path.is_file():
                    try:
                        rel_path = str(file_path.relative_to(env_path.parent))
                        content = file_path.read_text(errors='ignore')
                        env_files[rel_path] = content
                    except Exception:
                        pass
    except Exception:
        pass
    return env_files
