#!/usr/bin/env python3
"""
Check for .env files in common working directories that trigger ThreadLock crashes.
"""

import os
from pathlib import Path


def main():
    """
    Check for .env files in CWD and common opencode working directories.
    
    Returns:
        tuple: (passed: bool, message: str)
    """
    # Directories to check
    dirs_to_check = [
        Path.cwd(),  # Current working directory
        Path.home() / ".config" / "opencode",
        Path.home() / ".local" / "share" / "opencode",
        Path.home() / "work" / "opencode-setup",
        Path.home() / "work" / "opencode",
    ]
    
    found_env_files = []
    
    for directory in dirs_to_check:
        env_file = directory / ".env"
        if env_file.exists():
            found_env_files.append(str(env_file))
    
    if found_env_files:
        message = f"FAIL: .env file detected at {found_env_files[0]} — remove to prevent ThreadLock crash"
        return (False, message)
    else:
        message = "PASS: No .env files detected"
        return (True, message)


if __name__ == "__main__":
    import sys
    passed, message = main()
    print(message)
    sys.exit(0 if passed else 1)
