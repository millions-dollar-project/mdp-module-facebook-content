#!/usr/bin/env bash
# Scan staged files for likely secrets
PATTERNS='AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{36}|xai-[A-Za-z0-9_-]{20,}|THAALZA[A-Za-z0-9_-]{20,}'
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(go|ts|tsx|js|jsx|json|md|ya?ml|sh)$' || true)
[ -z "$STAGED" ] && exit 0
HITS=$(git diff --cached -- $STAGED | grep -E "$PATTERNS" || true)
if [ -n "$HITS" ]; then
  echo "ERROR: secret in diff:"
  echo "$HITS"
  exit 1
fi
exit 0
