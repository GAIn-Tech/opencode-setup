#!/usr/bin/env python3
"""
Check WAL file size (corruption indicator).
"""

from pathlib import Path


def main():
    """
    Check WAL file size for corruption indicators.
    
    Returns:
        tuple: (passed: bool, message: str)
    """
    wal_path = Path.home() / ".local" / "share" / "opencode" / "opencode.db-wal"
    
    # If WAL doesn't exist, that's fine
    if not wal_path.exists():
        message = "PASS: WAL file OK (not present)"
        return (True, message)
    
    # Check file size
    file_size = wal_path.stat().st_size
    size_mb = file_size / (1024 * 1024)
    
    # Thresholds
    WARN_THRESHOLD_MB = 100
    FAIL_THRESHOLD_MB = 500
    
    if size_mb > FAIL_THRESHOLD_MB:
        message = f"FAIL: WAL file too large ({size_mb:.2f}MB) — possible corruption"
        return (False, message)
    elif size_mb > WARN_THRESHOLD_MB:
        message = f"PASS: WAL file OK ({size_mb:.2f}MB) [WARNING: approaching 100MB threshold]"
        return (True, message)
    else:
        message = f"PASS: WAL file OK ({size_mb:.2f}MB)"
        return (True, message)


if __name__ == "__main__":
    import sys
    passed, message = main()
    print(message)
    sys.exit(0 if passed else 1)
