#!/usr/bin/env python3
"""
Check SQLite database integrity.
"""

import sqlite3
from pathlib import Path


def main():
    """
    Check database integrity and file size.
    
    Returns:
        tuple: (passed: bool, message: str)
    """
    db_path = Path.home() / ".local" / "share" / "opencode" / "opencode.db"
    
    # Check if database exists
    if not db_path.exists():
        message = "FAIL: Database file not found at " + str(db_path)
        return (False, message)
    
    # Check file size
    file_size = db_path.stat().st_size
    if file_size == 0:
        message = "FAIL: Database file is empty (0 bytes)"
        return (False, message)
    
    size_mb = file_size / (1024 * 1024)
    
    # Check integrity
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        cursor.execute("PRAGMA integrity_check")
        result = cursor.fetchone()
        conn.close()
        
        if result and result[0] == "ok":
            message = f"PASS: Database integrity OK ({size_mb:.2f}MB)"
            return (True, message)
        else:
            error_msg = result[0] if result else "Unknown error"
            message = f"FAIL: Database corrupted — {error_msg}"
            return (False, message)
    except sqlite3.Error as e:
        message = f"FAIL: Database corrupted — {str(e)}"
        return (False, message)


if __name__ == "__main__":
    import sys
    passed, message = main()
    print(message)
    sys.exit(0 if passed else 1)
