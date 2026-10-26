#!/usr/bin/env bash
# Fetches the SVG flags used by the popup into flags/ (flags/ is not tracked in git).
# Source: npm package country-flag-icons (MIT), pinned by version and checked against its sha512
# integrity hash from the npm registry. Needs only curl, tar and openssl, no Node/npm.
#
# Usage: scripts/fetch-flags.sh
set -euo pipefail

VERSION="1.6.20"
INTEGRITY="sha512-py8JiEKzjhYw6HPJ0L7SxLgCYim36UPRTZX43/kqGueUCZLSvnrqAiwW8HtQibur7mdkFQUkjOgdK+o/9FBtaw=="
# Lowercase ISO country codes, same set as LANGUAGE_FLAGS in popup.js, plus the EU flag for the footer
CODES="bg cz dk de gr gb es ee fi fr ie hr hu it lt lv mt nl pl pt ro sk si se eu"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "https://registry.npmjs.org/country-flag-icons/-/country-flag-icons-${VERSION}.tgz" -o "$TMP/pkg.tgz"

ACTUAL="sha512-$(openssl dgst -sha512 -binary "$TMP/pkg.tgz" | openssl base64 -A)"
if [ "$ACTUAL" != "$INTEGRITY" ]; then
  echo "Integrity check failed for country-flag-icons ${VERSION}" >&2
  echo "  expected: $INTEGRITY" >&2
  echo "  actual:   $ACTUAL" >&2
  exit 1
fi

tar -xzf "$TMP/pkg.tgz" -C "$TMP"
mkdir -p "$ROOT/flags"
count=0
for code in $CODES; do
  upper="$(echo "$code" | tr 'a-z' 'A-Z')"
  cp "$TMP/package/3x2/${upper}.svg" "$ROOT/flags/${code}.svg"
  count=$((count + 1))
done
cp "$TMP/package/LICENSE" "$ROOT/flags/LICENSE" # MIT: keep the notice next to the files

echo "Fetched ${count} flags (country-flag-icons ${VERSION}) into ${ROOT}/flags"
