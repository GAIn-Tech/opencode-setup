#!/usr/bin/env bash
# opencode Disaster Recovery — Interactive Recovery CLI
# Restores opencode from backup when startup fails.
#
# Usage: ./recover.sh [--minimal] [--dry-run]
#   --minimal   Deploy emergency minimal config (no backup needed)
#   --dry-run   Show what would be done without changing anything
#
# Dependencies: bash, cp, tar (optional: zstd)
# No Bun/Node.js/opencode dependency.

set -euo pipefail

# --- Configuration ---
DR_DIR="${HOME}/.opencode-dr"
BACKUP_DIR="${DR_DIR}/backups"
QUARANTINE_DIR="${DR_DIR}/quarantine"
EMERGENCY_DIR="${DR_DIR}/emergency-config"
LOG_DIR="${DR_DIR}/logs"
HEALTH_DIR="${DR_DIR}/health-checks"
CONFIG_DIR="${HOME}/.config/opencode"
DB_DIR="${HOME}/.local/share/opencode"
DRY_RUN=false

# --- Helpers ---
log() {
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] $*"
    echo "[${timestamp}] $*" >> "${LOG_FILE}" 2>/dev/null || true
}

die() {
    log "ERROR: $*"
    exit 1
}

ensure_dirs() {
    for d in "${QUARANTINE_DIR}" "${LOG_DIR}"; do
        mkdir -p "$d" 2>/dev/null || true
    done
}

confirm() {
    local prompt="$1"
    echo ""
    read -r -p "${prompt} [y/N] " response
    case "${response}" in
        [yY][eE][sS]|[yY]) return 0 ;;
        *) return 1 ;;
    esac
}

# --- Operations ---

list_backups() {
    log "Listing available backups..."
    echo ""
    echo "=== Available Backups ==="
    echo ""

    if [ ! -d "${BACKUP_DIR}" ] || [ -z "$(ls -A "${BACKUP_DIR}" 2>/dev/null)" ]; then
        echo "  No backups found."
        echo "  Create one with: ~/.opencode-dr/backup.sh \"description\""
        return 1
    fi

    local index=0
    # Store in array for selection
    BACKUP_LIST=()
    while IFS= read -r entry; do
        index=$((index + 1))
        local size="unknown"
        local backup_path="${BACKUP_DIR}/${entry}"

        if [ -f "${backup_path}" ]; then
            # Compressed backup (tar.zst or tar.gz)
            size=$(du -h "${backup_path}" 2>/dev/null | awk '{print $1}')
        elif [ -d "${backup_path}" ]; then
            size=$(du -sh "${backup_path}" 2>/dev/null | awk '{print $1}')
        fi

        BACKUP_LIST+=("${entry}")
        printf "  [%d] %-50s %s\n" "${index}" "${entry}" "${size}"
    done < <(ls -t "${BACKUP_DIR}" 2>/dev/null)

    echo ""
    return 0
}

quarantine_current() {
    local timestamp
    timestamp=$(date '+%Y-%m-%d-%H%M%S')
    local q_path="${QUARANTINE_DIR}/${timestamp}"

    log "Quarantining current config to ${q_path}..."

    if ${DRY_RUN}; then
        echo "  [DRY RUN] Would quarantine ${CONFIG_DIR} to ${q_path}"
        return 0
    fi

    mkdir -p "${q_path}"

    if [ -d "${CONFIG_DIR}" ]; then
        cp -r "${CONFIG_DIR}" "${q_path}/config" 2>/dev/null || log "WARNING: Config copy to quarantine failed"
    fi

    if [ -f "${DB_DIR}/opencode.db" ]; then
        mkdir -p "${q_path}/db"
        cp "${DB_DIR}/opencode.db" "${q_path}/db/" 2>/dev/null || log "WARNING: DB copy to quarantine failed"
    fi

    log "Current config quarantined to: ${q_path}"
    echo "  Quarantined current config to: ${q_path}"
}

restore_from_backup() {
    list_backups || return 1

    echo "Enter backup number to restore (or 'q' to cancel):"
    read -r selection

    if [ "${selection}" = "q" ] || [ "${selection}" = "Q" ]; then
        echo "Cancelled."
        return 0
    fi

    # Validate selection
    if ! [[ "${selection}" =~ ^[0-9]+$ ]] || [ "${selection}" -lt 1 ] || [ "${selection}" -gt "${#BACKUP_LIST[@]}" ]; then
        echo "Invalid selection."
        return 1
    fi

    local backup_name="${BACKUP_LIST[$((selection - 1))]}"
    local backup_path="${BACKUP_DIR}/${backup_name}"

    log "Selected backup: ${backup_name}"

    if ! confirm "Restore from '${backup_name}'? This will quarantine your current config first."; then
        echo "Cancelled."
        return 0
    fi

    # Quarantine current config before restoring
    quarantine_current

    if ${DRY_RUN}; then
        echo "  [DRY RUN] Would restore from ${backup_path}"
        return 0
    fi

    # Handle compressed backups
    if [[ "${backup_name}" == *.tar.zst ]]; then
        log "Extracting zstd-compressed backup..."
        local tmpdir
        tmpdir=$(mktemp -d)
        zstd -d "${backup_path}" --stdout | tar -xf - -C "${tmpdir}"
        local extracted="${tmpdir}/$(basename "${backup_name}" .tar.zst)"
        _do_restore "${extracted}"
        rm -rf "${tmpdir}"
    elif [[ "${backup_name}" == *.tar.gz ]]; then
        log "Extracting gzip-compressed backup..."
        local tmpdir
        tmpdir=$(mktemp -d)
        tar -xzf "${backup_path}" -C "${tmpdir}"
        local extracted="${tmpdir}/$(basename "${backup_name}" .tar.gz)"
        _do_restore "${extracted}"
        rm -rf "${tmpdir}"
    elif [ -d "${backup_path}" ]; then
        _do_restore "${backup_path}"
    else
        die "Unknown backup format: ${backup_name}"
    fi

    log "Restore complete from: ${backup_name}"
    echo ""
    echo "Restore complete. Verify with:"
    echo "  opencode --version"
    echo "  ~/.opencode-dr/validate.sh"
}

_do_restore() {
    local source="$1"

    # Restore config
    if [ -d "${source}/config" ]; then
        log "Restoring config files..."
        # Remove current config (already quarantined)
        rm -rf "${CONFIG_DIR}" 2>/dev/null || true
        mkdir -p "${CONFIG_DIR}"
        cp -r "${source}/config/"* "${CONFIG_DIR}/" 2>/dev/null || log "WARNING: Config restore had errors"
        log "Config restored."
    else
        log "WARNING: No config directory in backup"
    fi

    # Restore database
    if [ -f "${source}/db/opencode.db" ]; then
        log "Restoring database..."
        mkdir -p "${DB_DIR}"
        cp "${source}/db/opencode.db" "${DB_DIR}/opencode.db" 2>/dev/null || log "WARNING: DB restore failed"
        if [ -f "${source}/db/opencode.db-wal" ]; then
            cp "${source}/db/opencode.db-wal" "${DB_DIR}/opencode.db-wal"
        fi
        log "Database restored."
    else
        log "WARNING: No database in backup — database unchanged"
    fi
}

deploy_emergency() {
    log "Deploying emergency minimal config..."

    if [ ! -d "${EMERGENCY_DIR}" ]; then
        die "Emergency config not found: ${EMERGENCY_DIR}"
    fi

    # Quarantine first
    quarantine_current

    if ${DRY_RUN}; then
        echo "  [DRY RUN] Would deploy emergency config from ${EMERGENCY_DIR}"
        return 0
    fi

    # Deploy minimal config
    mkdir -p "${CONFIG_DIR}"
    cp "${EMERGENCY_DIR}/opencode.json" "${CONFIG_DIR}/opencode.json" 2>/dev/null || die "Failed to copy emergency opencode.json"
    cp "${EMERGENCY_DIR}/oh-my-opencode.json" "${CONFIG_DIR}/oh-my-opencode.json" 2>/dev/null || true
    cp "${EMERGENCY_DIR}/compound-engineering.json" "${CONFIG_DIR}/compound-engineering.json" 2>/dev/null || true

    log "Emergency minimal config deployed."
    echo ""
    echo "Emergency config deployed. opencode will start with:"
    echo "  - Single model: gemini-2.5-flash (Google free tier)"
    echo "  - No plugins"
    echo "  - No agent orchestration"
    echo ""
    echo "To restore full config later:"
    echo "  ~/.opencode-dr/recover.sh  (select option 2)"
}

reset_to_stable() {
    log "Resetting to last stable backup..."

    if [ ! -d "${BACKUP_DIR}" ] || [ -z "$(ls -A "${BACKUP_DIR}" 2>/dev/null)" ]; then
        echo "No backups available. Cannot reset to stable."
        echo "Use option 3 (emergency minimal) instead."
        return 1
    fi

    # Get the newest backup
    local latest
    latest=$(ls -t "${BACKUP_DIR}" 2>/dev/null | head -1)

    if [ -z "${latest}" ]; then
        die "No backups found."
    fi

    echo "Latest backup: ${latest}"
    if ! confirm "Restore from latest backup '${latest}'?"; then
        echo "Cancelled."
        return 0
    fi

    quarantine_current

    local backup_path="${BACKUP_DIR}/${latest}"

    if ${DRY_RUN}; then
        echo "  [DRY RUN] Would restore from ${backup_path}"
        return 0
    fi

    if [[ "${latest}" == *.tar.zst ]]; then
        local tmpdir
        tmpdir=$(mktemp -d)
        zstd -d "${backup_path}" --stdout | tar -xf - -C "${tmpdir}"
        _do_restore "${tmpdir}/$(basename "${latest}" .tar.zst)"
        rm -rf "${tmpdir}"
    elif [[ "${latest}" == *.tar.gz ]]; then
        local tmpdir
        tmpdir=$(mktemp -d)
        tar -xzf "${backup_path}" -C "${tmpdir}"
        _do_restore "${tmpdir}/$(basename "${latest}" .tar.gz)"
        rm -rf "${tmpdir}"
    elif [ -d "${backup_path}" ]; then
        _do_restore "${backup_path}"
    else
        die "Unknown backup format: ${latest}"
    fi

    log "Reset to stable complete: ${latest}"
    echo "Reset to stable complete."
}

quarantine_only() {
    log "Quarantining current config for analysis..."
    quarantine_current
    echo ""
    echo "Current config quarantined. opencode config directory is now empty."
    echo "Options:"
    echo "  - Restore from backup: ~/.opencode-dr/recover.sh (option 2)"
    echo "  - Use emergency config: ~/.opencode-dr/recover.sh (option 3)"
    echo "  - Inspect quarantine: ls ~/.opencode-dr/quarantine/"
}

run_diagnostics() {
    log "Running full diagnostics..."
    echo ""
    echo "=== Full Diagnostics ==="

    # Run health checks
    if [ -f "${HEALTH_DIR}/__init__.py" ] && command -v python3 &>/dev/null; then
        echo ""
        echo "--- Health Checks ---"
        python3 "${HEALTH_DIR}/__init__.py" 2>&1 || true
    else
        echo "Health checks not available (Python 3 or health-checks/ missing)"
    fi

    # Check opencode version
    echo ""
    echo "--- opencode Status ---"
    if command -v opencode &>/dev/null; then
        opencode --version 2>&1 || echo "opencode: failed to get version"
    else
        echo "opencode: not found on PATH"
    fi

    # Check config directory
    echo ""
    echo "--- Config Files ---"
    if [ -d "${CONFIG_DIR}" ]; then
        ls -la "${CONFIG_DIR}/" 2>/dev/null | head -20
    else
        echo "Config directory not found: ${CONFIG_DIR}"
    fi

    # Check database
    echo ""
    echo "--- Database ---"
    if [ -f "${DB_DIR}/opencode.db" ]; then
        ls -lh "${DB_DIR}/opencode.db"
    else
        echo "Database not found: ${DB_DIR}/opencode.db"
    fi

    # Check backups
    echo ""
    echo "--- Backups ---"
    local backup_count
    backup_count=$(ls -1 "${BACKUP_DIR}" 2>/dev/null | wc -l)
    echo "Available backups: ${backup_count}"

    # Check quarantine
    echo ""
    echo "--- Quarantine ---"
    local q_count
    q_count=$(ls -1 "${QUARANTINE_DIR}" 2>/dev/null | wc -l)
    echo "Quarantined configs: ${q_count}"

    echo ""
    log "Diagnostics complete."
}

# --- Menu ---
show_menu() {
    echo ""
    echo "========================================"
    echo "  opencode Disaster Recovery CLI"
    echo "========================================"
    echo ""
    echo "  [1] List available backups"
    echo "  [2] Restore from backup"
    echo "  [3] Reset to emergency minimal"
    echo "  [4] Reset to stable (last backup)"
    echo "  [5] Quarantine current config"
    echo "  [6] Run diagnostics"
    echo "  [q] Quit"
    echo ""
    echo -n "Select option: "
}

# --- Main ---
main() {
    # Parse flags
    for arg in "$@"; do
        case "${arg}" in
            --minimal)
                LOG_FILE="${LOG_DIR}/recovery-$(date '+%Y-%m-%d').log"
                ensure_dirs
                deploy_emergency
                exit $?
                ;;
            --dry-run)
                DRY_RUN=true
                echo "[DRY RUN MODE — no changes will be made]"
                ;;
        esac
    done

    LOG_FILE="${LOG_DIR}/recovery-$(date '+%Y-%m-%d').log"
    ensure_dirs

    log "=== Recovery CLI started ==="

    while true; do
        show_menu
        read -r choice

        case "${choice}" in
            1) list_backups ;;
            2) restore_from_backup ;;
            3) deploy_emergency ;;
            4) reset_to_stable ;;
            5) quarantine_only ;;
            6) run_diagnostics ;;
            q|Q)
                log "Recovery CLI exited."
                echo "Goodbye."
                exit 0
                ;;
            *)
                echo "Invalid option. Try again."
                ;;
        esac
    done
}

main "$@"
