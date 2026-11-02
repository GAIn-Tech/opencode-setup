#!/usr/bin/env bash
# opencode Disaster Recovery — Pre-flight Validation Script
# Runs all health checks and reports status before any config change.
#
# Usage: ./validate.sh
# Exit code: 0 if all pass, 1 if any fail
#
# Dependencies: Python 3.10+, bash
# No Bun/Node.js/opencode dependency.

set -euo pipefail

DR_DIR="${HOME}/.opencode-dr"
HEALTH_DIR="${DR_DIR}/health-checks"
LOG_DIR="${DR_DIR}/logs"

# --- Helpers ---
log() {
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] $*"
    echo "[${timestamp}] $*" >> "${LOG_FILE}" 2>/dev/null || true
}

# --- Pre-flight ---
if [ ! -d "${HEALTH_DIR}" ]; then
    echo "ERROR: Health checks directory not found: ${HEALTH_DIR}"
    echo "Run the DR installer first."
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo "ERROR: Python 3 is required but not found."
    echo "Install Python 3.10+ and ensure 'python3' is on PATH."
    exit 1
fi

# Set up logging
mkdir -p "${LOG_DIR}" 2>/dev/null || true
LOG_FILE="${LOG_DIR}/validate-$(date '+%Y-%m-%d').log"

# --- Run checks ---
log "=== Pre-flight Validation ==="
log ""

checks=(
    "check_env_files.py"
    "check_db_integrity.py"
    "check_plugin_versions.py"
    "check_wal_size.py"
    "check_config_valid.py"
)

failed=0
passed=0
skipped=0

for check in "${checks[@]}"; do
    check_path="${HEALTH_DIR}/${check}"
    check_name="${check%.py}"

    if [ ! -f "${check_path}" ]; then
        printf "  %-30s SKIP (file not found)\n" "${check_name}"
        log "SKIP: ${check_name} — file not found"
        skipped=$((skipped + 1))
        continue
    fi

    # Run check, capture output and exit code
    output=$(python3 "${check_path}" 2>&1) || true
    exit_code=$?

    if [ ${exit_code} -eq 0 ]; then
        printf "  %-30s PASS\n" "${check_name}"
        log "PASS: ${check_name} — ${output}"
        passed=$((passed + 1))
    else
        printf "  %-30s FAIL\n" "${check_name}"
        echo "    ${output}"
        log "FAIL: ${check_name} — ${output}"
        failed=$((failed + 1))

        # Provide remediation hints
        case "${check_name}" in
            check_env_files)
                echo "    Remediation: Remove .env files from working directories"
                echo "    Run: rm .env (in the reported directory)"
                ;;
            check_db_integrity)
                echo "    Remediation: Restore database from backup"
                echo "    Run: ~/.opencode-dr/recover.sh (select option 2)"
                ;;
            check_plugin_versions)
                echo "    Remediation: Reinstall missing plugins"
                echo "    Run: cd ~/.config/opencode && npm install"
                ;;
            check_wal_size)
                echo "    Remediation: Checkpoint or remove large WAL file"
                echo "    Run: sqlite3 ~/.local/share/opencode/opencode.db 'PRAGMA wal_checkpoint(TRUNCATE);'"
                ;;
            check_config_valid)
                echo "    Remediation: Restore config from backup or use emergency config"
                echo "    Run: ~/.opencode-dr/recover.sh (select option 3 for emergency)"
                ;;
        esac
    fi
done

log ""
log "=== Summary ==="
total=$((passed + failed + skipped))
log "Total: ${total} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}"

echo ""
echo "=== Validation Summary ==="
echo "Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}"

if [ ${failed} -gt 0 ]; then
    echo ""
    echo "RESULT: FAIL — ${failed} check(s) failed. Review issues above."
    log "RESULT: FAIL"
    exit 1
else
    echo ""
    echo "RESULT: PASS — All checks passed. Safe to proceed."
    log "RESULT: PASS"
    exit 0
fi
