#!/usr/bin/env python3
"""
Check main config files are valid JSON.
"""

import json
from pathlib import Path


def main():
    """
    Check that all config files are valid JSON.
    
    Returns:
        tuple: (passed: bool, message: str)
    """
    config_dir = Path.home() / ".config" / "opencode"
    
    config_files = [
        "opencode.json",
        "oh-my-opencode.json",
        "compound-engineering.json",
    ]
    
    invalid_files = []
    
    for config_file in config_files:
        config_path = config_dir / config_file
        
        # Skip if file doesn't exist
        if not config_path.exists():
            continue
        
        # Try to parse as JSON
        try:
            with open(config_path, 'r') as f:
                json.load(f)
        except json.JSONDecodeError as e:
            invalid_files.append((config_file, str(e)))
        except Exception as e:
            invalid_files.append((config_file, str(e)))
    
    if invalid_files:
        first_file, error = invalid_files[0]
        message = f"FAIL: Invalid JSON in {first_file}: {error}"
        return (False, message)
    else:
        message = "PASS: All config files valid JSON"
        return (True, message)


if __name__ == "__main__":
    import sys
    passed, message = main()
    print(message)
    sys.exit(0 if passed else 1)
