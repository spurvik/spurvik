#!/usr/bin/env bash
# Refuse a dist tree that contains a project key shaped like spurvik_live_<32+>.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
found=0
for dir in "$root/packages/sdk/dist" "$root/packages/spurvik/dist" "$root/packages/n8n-nodes-spurvik/dist"; do
  if [[ -d "$dir" ]] && grep -R -n -E 'spurvik_live_[A-Za-z0-9_-]{32,}' "$dir"; then
    found=1
  fi
done
if [[ "$found" -ne 0 ]]; then
  echo "Refusing to publish: a spurvik_live_ key was found in dist." >&2
  exit 1
fi
echo "no-default-keys: no live project key in dist"
