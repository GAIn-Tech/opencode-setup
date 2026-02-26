#!/bin/bash
# OpenCode Disaster Recovery - Integration Tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DR_DIR="$HOME/.opencode-dr"

echo "========================================"
echo "OpenCode DR Integration Tests"
echo "========================================"
echo ""

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Test function
run_test() {
    local test_name="$1"
    local test_cmd="$2"
    
    echo "Testing: $test_name"
    echo "  Command: $test_cmd"
    
    if eval "$test_cmd" &> /tmp/test-output.log; then
        echo "  ✅ PASS"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo "  ❌ FAIL"
        echo "  Output: $(cat /tmp/test-output.log)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    echo ""
}

# Test 1: Directory structure exists
echo "Test Suite 1: Directory Structure"
echo "-----------------------------------"
run_test "DR directory exists" "test -d $DR_DIR"
run_test "backups directory exists" "test -d $DR_DIR/backups"
run_test "emergency-config directory exists" "test -d $DR_DIR/emergency-config"
run_test "health-checks directory exists" "test -d $DR_DIR/health-checks"
run_test "logs directory exists" "test -d $DR_DIR/logs"
run_test "quarantine directory exists" "test -d $DR_DIR/quarantine"

# Test 2: Scripts are executable
echo "Test Suite 2: Scripts Executable"
echo "-----------------------------------"
run_test "backup.sh is executable" "test -x $DR_DIR/backup.sh"
run_test "validate.sh is executable" "test -x $DR_DIR/validate.sh"
run_test "recover.sh is executable" "test -x $DR_DIR/recover.sh"

# Test 3: Emergency config is valid JSON
echo "Test Suite 3: Emergency Config"
echo "-------------------------------"
run_test "opencode.json is valid JSON" "python3 -c 'import json; json.load(open(\"$DR_DIR/emergency-config/opencode.json\"))'"
run_test "oh-my-opencode.json is valid JSON" "python3 -c 'import json; json.load(open(\"$DR_DIR/emergency-config/oh-my-opencode.json\"))'"

# Test 4: Health checks exist
echo "Test Suite 4: Health Checks"
echo "----------------------------"
run_test "check_env_files.py exists" "test -f $DR_DIR/health-checks/check_env_files.py"
run_test "check_db_integrity.py exists" "test -f $DR_DIR/health-checks/check_db_integrity.py"
run_test "check_plugin_versions.py exists" "test -f $DR_DIR/health-checks/check_plugin_versions.py"
run_test "check_wal_size.py exists" "test -f $DR_DIR/health-checks/check_wal_size.py"
run_test "check_node_modules.py exists" "test -f $DR_DIR/health-checks/check_node_modules.py"

# Test 5: Health checks are valid Python
echo "Test Suite 5: Health Check Syntax"
echo "----------------------------------"
run_test "check_env_files.py syntax valid" "python3 -m py_compile $DR_DIR/health-checks/check_env_files.py"
run_test "check_db_integrity.py syntax valid" "python3 -m py_compile $DR_DIR/health-checks/check_db_integrity.py"
run_test "check_plugin_versions.py syntax valid" "python3 -m py_compile $DR_DIR/health-checks/check_plugin_versions.py"

# Test 6: Backup functionality
echo "Test Suite 6: Backup Creation"
echo "------------------------------"
run_test "Create test backup" "$DR_DIR/backup.sh 'integration-test'"
run_test "Backup directory created" "test -d $DR_DIR/backups/*integration-test"

# Test 7: Validation functionality
echo "Test Suite 7: Validation"
echo "-------------------------"
run_test "validate.sh runs" "$DR_DIR/validate.sh"

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"
echo ""
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo "✅ ALL TESTS PASSED"
    exit 0
else
    echo "❌ SOME TESTS FAILED"
    exit 1
fi
