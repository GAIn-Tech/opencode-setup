#!/usr/bin/env python3
"""
Check plugin installation consistency.
"""

import json
from pathlib import Path


def main():
    """
    Check that all expected plugins are installed.
    
    Returns:
        tuple: (passed: bool, message: str)
    """
    config_path = Path.home() / ".config" / "opencode" / "package.json"
    node_modules_path = Path.home() / ".config" / "opencode" / "node_modules"
    
    # Check if config exists
    if not config_path.exists():
        message = "FAIL: package.json not found at " + str(config_path)
        return (False, message)
    
    # Read package.json
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        message = f"FAIL: Invalid JSON in package.json: {str(e)}"
        return (False, message)
    except Exception as e:
        message = f"FAIL: Error reading package.json: {str(e)}"
        return (False, message)
    
    # Get expected plugins from dependencies
    dependencies = config.get("dependencies", {})
    if not dependencies:
        message = "PASS: No plugins configured"
        return (True, message)
    
    # Check each plugin directory exists
    missing_plugins = []
    for plugin_name in dependencies.keys():
        plugin_dir = node_modules_path / plugin_name
        if not plugin_dir.exists():
            missing_plugins.append(plugin_name)
    
    if missing_plugins:
        message = f"FAIL: Missing plugins: {', '.join(missing_plugins)}"
        return (False, message)
    else:
        plugin_count = len(dependencies)
        message = f"PASS: All {plugin_count} plugins installed"
        return (True, message)


if __name__ == "__main__":
    import sys
    passed, message = main()
    print(message)
    sys.exit(0 if passed else 1)
