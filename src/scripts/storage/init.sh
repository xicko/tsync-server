#!/usr/bin/env bash
set -euo pipefail

STORAGE_DIR="${1:-/var/tsync/storage}"

mkdir -p "$STORAGE_DIR"

chmod 700 "$STORAGE_DIR"

if command -v setfacl &> /dev/null; then
  setfacl -d -m u::rw-,g::---,o::--- "$STORAGE_DIR" 2>/dev/null || true
fi

if [ "$(id -u)" -eq 0 ]; then
  if ! mountpoint -q "$STORAGE_DIR"; then
    mount --bind "$STORAGE_DIR" "$STORAGE_DIR"
    mount -o remount,bind,noexec,nosuid,nodev "$STORAGE_DIR"
  fi
fi
