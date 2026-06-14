#!/usr/bin/env bash
set -e
MSG=$(cat "$1")
PATTERN='^(feat|fix|chore|docs|refactor|test|perf|build|ci)(\([a-z0-9-]+\))?!?: .+'
echo "$MSG" | grep -qE "$PATTERN" || { echo "ERROR: not Conventional Commits: $MSG"; echo "Pattern: $PATTERN"; exit 1; }
