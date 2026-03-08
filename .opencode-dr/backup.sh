#!/usr/bin/env bash
# opencode Disaster Recovery — Backup Creation Script
# Creates timestamped snapshots of opencode config and database
# with 7-backup rotation and optional compression.
#
# Usage: ./backup.sh [message]
# Example: ./backup.sh "before-plugin-upgrade"
#
# Dependencies: bash, rsync or cp, sha256sum or shasum, tar (optional: zstd)
# No Bun/Node.js/opencode dependency.

set -euo pipefail

# --- Configuration ---
BACKUP_COUNT=7
DR_DIR="${HOME}/.opencode-dr"
BACKUP_DIR="${DR_DIR}/backups"
LOG_DIR="${DR_DIR}/logs"
CONFIG_DIR="${HOME}/.config/opencode"
DB_PATH="${HOME}/.local/share/opencode/opencode.db"
DB_WAL_PATH="${HOME}/.local/share/opencode/opencode.db-wal"

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

sha256() {
    if command -v sha256sum &>/dev/null; then
        sha256sum "$1" | awk '{print $1}'
    elif command -v shasum &>/dev/null; then
        shasum -a 256 "$1" | awk '{print $1}'
    else
        echo "no-checksum-tool"
    fi
}

# --- Pre-flight ---
ensure_dirs() {
    for d in "${BACKUP_DIR}" "${LOG_DIR}"; do
        if [ ! -d "$d" ]; then
            mkdir -p "$d" || die "Cannot create directory: $d"
        fi
    done
}

# --- Main ---
main() {
    local message="${1:-manual}"
    # Sanitize message for use in directory name
    message=$(echo "${message}" | tr -cd '[:alnum:]-_' | cut -c1-50)
    [ -z "${message}" ] && message="manual"

    local timestamp
    timestamp=$(date '+%Y-%m-%d-%H%M%S')
    local backup_name="${timestamp}-${message}"
    local backup_path="${BACKUP_DIR}/${backup_name}"

    # Set up logging
    LOG_FILE="${LOG_DIR}/backup-$(date '+%Y-%m-%d').log"
    ensure_dirs

    log "Starting backup: ${backup_name}"

    # Check source exists
    if [ ! -d "${CONFIG_DIR}" ]; then
        die "Config directory not found: ${CONFIG_DIR}"
    fi

    # Run health checks if available
    local health_runner="${DR_DIR}/health-checks/__init__.py"
    if [ -f "${health_runner}" ] && command -v python3 &>/dev/null; then
        log "Running pre-backup health checks..."
        if ! python3 "${health_runner}" 2>&1 | tee -a "${LOG_FILE}"; then
            log "WARNING: Health checks reported issues. Proceeding with backup anyway."
        fi
    fi

    # Create backup directory
    mkdir -p "${backup_path}/config" "${backup_path}/db" || die "Cannot create backup directory"

    # Copy config directory (exclude node_modules for speed, backup separately if needed)
    log "Copying config files..."
    if command -v rsync &>/dev/null; then
        rsync -a --exclude='node_modules' "${CONFIG_DIR}/" "${backup_path}/config/" 2>&1 | tee -a "${LOG_FILE}"
    else
        # Fallback to cp
        cp -r "${CONFIG_DIR}" "${backup_path}/config_tmp" 2>/dev/null || true
        if [ -d "${backup_path}/config_tmp" ]; then
            rm -rf "${backup_path}/config_tmp/node_modules" 2>/dev/null || true
            mv "${backup_path}/config_tmp"/* "${backup_path}/config/" 2>/dev/null || true
            rm -rf "${backup_path}/config_tmp"
        fi
    fi

    # Copy database
    if [ -f "${DB_PATH}" ]; then
        log "Copying database (this may take a moment for large DBs)..."
        cp "${DB_PATH}" "${backup_path}/db/opencode.db" || log "WARNING: Database copy failed"
        if [ -f "${DB_WAL_PATH}" ]; then
            cp "${DB_WAL_PATH}" "${backup_path}/db/opencode.db-wal" || log "WARNING: WAL copy failed"
        fi
    else
        log "WARNING: Database not found at ${DB_PATH} — skipping"
    fi

    # Generate manifest with checksums
    log "Generating manifest..."
    local manifest="${backup_path}/manifest.json"
    {
        echo "{"
        echo "  \"backup_name\": \"${backup_name}\","
        echo "  \"timestamp\": \"$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date '+%Y-%m-%dT%H:%M:%SZ')\","
        echo "  \"message\": \"${message}\","
        echo "  \"source_config\": \"${CONFIG_DIR}\","
        echo "  \"source_db\": \"${DB_PATH}\","
        echo "  \"checksums\": {"

        local first=true
        # Checksum config files
        find "${backup_path}/config" -type f 2>/dev/null | sort | while IFS= read -r f; do
            local rel="${f#${backup_path}/}"
            local hash
            hash=$(sha256 "$f")
            if [ "${first}" = true ]; then
                first=false
            else
                echo ","
            fi
            printf "    \"%s\": \"%s\"" "${rel}" "${hash}"
        done

        # Checksum DB
        if [ -f "${backup_path}/db/opencode.db" ]; then
            local db_hash
            db_hash=$(sha256 "${backup_path}/db/opencode.db")
            echo ","
            printf "    \"db/opencode.db\": \"%s\"" "${db_hash}"
        fi

        echo ""
        echo "  },"

        # Backup size
        local size
        if command -v du &>/dev/null; then
            size=$(du -sh "${backup_path}" 2>/dev/null | awk '{print $1}')
        else
            size="unknown"
        fi
        echo "  \"size\": \"${size}\""
        echo "}"
    } > "${manifest}"

    # Optional compression
    if command -v zstd &>/dev/null; then
        log "Compressing backup with zstd..."
        tar -cf - -C "${BACKUP_DIR}" "${backup_name}" | zstd -T0 -o "${BACKUP_DIR}/${backup_name}.tar.zst" 2>&1 | tee -a "${LOG_FILE}"
        if [ -f "${BACKUP_DIR}/${backup_name}.tar.zst" ]; then
            rm -rf "${backup_path}"
            log "Compressed backup: ${backup_name}.tar.zst"
        fi
    elif command -v gzip &>/dev/null; then
        log "Compressing backup with gzip..."
        tar -czf "${BACKUP_DIR}/${backup_name}.tar.gz" -C "${BACKUP_DIR}" "${backup_name}" 2>&1 | tee -a "${LOG_FILE}"
        if [ -f "${BACKUP_DIR}/${backup_name}.tar.gz" ]; then
            rm -rf "${backup_path}"
            log "Compressed backup: ${backup_name}.tar.gz"
        fi
    else
        log "No compression available — backup stored uncompressed"
    fi

    # Enforce rotation — keep only newest BACKUP_COUNT backups
    log "Enforcing ${BACKUP_COUNT}-backup rotation..."
    local count=0
    # List backups by modification time (newest first), delete beyond threshold
    ls -t "${BACKUP_DIR}" 2>/dev/null | while IFS= read -r entry; do
        count=$((count + 1))
        if [ "${count}" -gt "${BACKUP_COUNT}" ]; then
            log "Rotating out old backup: ${entry}"
            rm -rf "${BACKUP_DIR}/${entry}"
        fi
    done

    log "Backup complete: ${backup_name}"
    log "Location: ${BACKUP_DIR}/"
    echo ""
    echo "Backup created successfully: ${backup_name}"
    echo "Location: ${BACKUP_DIR}/"
}

main "$@"
