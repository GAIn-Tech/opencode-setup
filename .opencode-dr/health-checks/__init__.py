#!/usr/bin/env python3
"""
Health check runner module.
Imports and runs all checks, prints summary table, exits 1 if any fail.
"""

import sys
import os
from pathlib import Path

# Import all check modules
from . import check_env_files
from . import check_db_integrity
from . import check_plugin_versions
from . import check_wal_size
from . import check_config_valid
from . import check_node_modules


def run_all():
    """
    Run all health checks.
    
    Returns:
        dict: {check_name -> (passed: bool, message: str)}
    """
    checks = [
        ("env_files", check_env_files.main),
        ("db_integrity", check_db_integrity.main),
        ("plugin_versions", check_plugin_versions.main),
        ("wal_size", check_wal_size.main),
        ("config_valid", check_config_valid.main),
        ("node_modules", check_node_modules.main),
    ]
    
    results = {}
    for check_name, check_func in checks:
        try:
            passed, message = check_func()
            results[check_name] = (passed, message)
        except Exception as e:
            results[check_name] = (False, f"ERROR: {str(e)}")
    
    return results


def print_summary(results):
    """Print summary table of all check results."""
    print("\n" + "=" * 70)
    print("OPENCODE HEALTH CHECK SUMMARY")
    print("=" * 70)
    
    all_passed = True
    for check_name, (passed, message) in results.items():
        status = "PASS" if passed else "FAIL"
        print(f"\n[{status}] {check_name}")
        print(f"    {message}")
        if not passed:
            all_passed = False
    
    print("\n" + "=" * 70)
    if all_passed:
        print("RESULT: All checks passed")
    else:
        print("RESULT: Some checks failed")
    print("=" * 70 + "\n")
    
    return all_passed


def main():
    """Main entry point."""
    results = run_all()
    all_passed = print_summary(results)
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
