"""
Stage: Verify DjangoGoat setup by running behave tests
"""

import subprocess
import os
import shutil
from pathlib import Path


def run():
    """
    Verify that the DjangoGoat environment is properly set up by running behave tests.
    
    Uses 'zerg' from the pipeline namespace to access workspace information.
    """
    print("Verifying DjangoGoat setup...")
    
    # Find Poetry executable
    poetry_path = shutil.which('poetry')
    assert poetry_path is not None, "Poetry not found in PATH"
    print(f"Using Poetry: {poetry_path}")
    
    # Get DjangoGoat path
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
    
    assert pyproject_path and pyproject_path.exists(), "Could not find pyproject.toml"
    
    project_dir = pyproject_path.parent
    print(f"Running behave tests in: {project_dir}")
    
    original_dir = os.getcwd()
    
    try:
        os.chdir(project_dir)
        
        # Get cached environment
        workspace_root = Path(str(zerg.workspace.environment_path))
        cache_file = workspace_root / ".poetry_venv_cache"
        
        env_vars = os.environ.copy()
        if cache_file.exists():
            import json
            cache_data = json.loads(cache_file.read_text())
            env_vars.update(cache_data.get('env_vars', {}))
            print(f"Using cached virtualenv: {cache_data.get('venv_path', 'unknown')}")
        
        # Set Django environment variables
        env_vars['DJANGO_SETTINGS_MODULE'] = 'djangogoat.settings'
        env_vars['DJANGO_SECRET_KEY'] = 'test-secret-key-for-verification'
        
        # Run behave with a short timeout just to verify it starts
        print("Running 'poetry run behave' to verify setup...")
        result = subprocess.run(
            [poetry_path, 'run', 'behave'],
            capture_output=True,
            text=True,
            timeout=1800,
            env=env_vars
        )
        
        if result.returncode != 0:
            print(f"\n✗ Behave dry-run failed with exit code {result.returncode}")
            print("\nSTDOUT:")
            print(result.stdout)
            print("\nSTDERR:")
            print(result.stderr)
            assert False, "Behave setup verification failed"
        
        # Check that behave found some features
        if 'features passed' in result.stdout or 'scenarios passed' in result.stdout:
            print(result.stdout)
            print("✓ Behave setup verified successfully")
            print(f"  Found features in the test suite")
        else:
            print("⚠ Behave ran but didn't find expected output")
            print(result.stdout)
        
    finally:
        os.chdir(original_dir)
    
    print("\n✓ Setup verification complete!")


if __name__ == "__main__":
    run()

